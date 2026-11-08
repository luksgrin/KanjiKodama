/** The sync engine against a fake server: first sync, incremental merge, 401, subscription, queue. */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

import { KkDb } from '../../src/storage/db';
import { checkConnection, migrateFromWaniKani, ServerError, SyncEngine } from '../../src/sync/engine';
import { switchToServer } from '../../src/sync/modeSwitch';
import { enqueueLessonStart, enqueueReview, enqueueStudyMaterial, listQueue, pendingUploads } from '../../src/sync/queue';
import { BASE, FakeClock, FakeHttp, firstSyncRoutes, fixture, freshDbName, json, limiterFor, NOW, ok, openDb } from './helpers';

const HOUR = 3600_000;

async function connected(http: FakeHttp, kk?: KkDb, clock = new FakeClock(NOW)) {
  const db = kk ?? (await openDb());
  const user = await checkConnection({ http, baseUrl: BASE, token: 'tok', clock, limiter: limiterFor(clock), retryDelay: 10 });
  await switchToServer(db, { baseUrl: BASE, token: 'tok', user });
  http.requests.length = 0;
  const engine = new SyncEngine({ kk: db, http, clock, limiter: limiterFor(clock), retryDelay: 10 });
  return { kk: db, engine, clock };
}

describe('checkConnection / migrate', () => {
  it('returns the account, or the Java messages naming the server', async () => {
    const clock = new FakeClock(NOW);
    const t = { baseUrl: BASE, token: 'tok', clock, limiter: limiterFor(clock), retryDelay: 1 };
    const user = await checkConnection({ ...t, http: new FakeHttp().on('GET', '/v2/user', ok('user')) });
    expect(user).toMatchObject({ username: 'kodama', level: 2 });
    await expect(checkConnection({ ...t, http: new FakeHttp().on('GET', '/v2/user', json(401, fixture('error-401'))) }))
      .rejects.toThrow('kk.example.test rejected this API token.');
    await expect(checkConnection({ ...t, http: new FakeHttp().on('GET', '/v2/user', 'network') }))
      .rejects.toThrow('Could not reach kk.example.test. Check the connection and try again.');
  });

  it('POST /v2/migrate: token on 200/409; 404 and 401 messages', async () => {
    const m = (status: number, body: unknown) =>
      migrateFromWaniKani({ http: new FakeHttp().on('POST', '/v2/migrate', json(status, body)), baseUrl: BASE, wkApiKey: 'wk' });
    expect(await m(200, { token: 'server-token' })).toBe('server-token');
    expect(await m(409, { token: 'again' })).toBe('again');
    await expect(m(404, { error: 'nope' })).rejects.toThrow('kk.example.test cannot copy data from WaniKani. Paste a token for kk.example.test instead.');
    await expect(m(401, {})).rejects.toThrow('WaniKani rejected this API token.');
    await expect(m(500, { error: 'db down' })).rejects.toThrow('kk.example.test could not copy the WaniKani data (500): db down');
    const http = new FakeHttp().on('POST', '/v2/migrate', json(200, { token: 't' }));
    await migrateFromWaniKani({ http, baseUrl: BASE, wkApiKey: 'wk-key' });
    expect(JSON.parse(http.requests[0]!.body!)).toEqual({ wanikani_api_key: 'wk-key' });
    expect(http.requests[0]!.headers).not.toHaveProperty('Authorization');
  });
});

describe('SyncEngine', () => {
  it('first sync downloads everything into the progress tables, never GET /v2/reviews', async () => {
    const http = firstSyncRoutes(new FakeHttp());
    const { kk, engine } = await connected(http);
    const r = await engine.syncNow();
    expect(r.ok).toBe(true);
    expect(r.apiState).toBe('OK');
    expect(r.steps.map((s) => s.step)).toEqual([
      'user', 'spaced_repetition_systems', 'uploads', 'subjects', 'assignments', 'review_statistics', 'study_materials', 'level_progressions',
    ]);
    expect(http.requests.some((q) => q.url.includes('/v2/reviews'))).toBe(false);
    expect(http.requests.every((q) => !q.url.includes('updated_after'))).toBe(true);

    expect((await kk.serverSubjects.toArray()).map((s) => s.id)).toEqual([1, 2, 10]);
    const s10 = await kk.subjects.get(10);
    expect(s10).toMatchObject({
      assignmentId: 9003, srsStage: 1, reviewStatisticId: 7003, meaningCorrect: 3, readingIncorrect: 2,
      studyMaterialId: 5010, meaningNote: 'a single stroke', meaningSynonyms: '["single"]',
      availableAt: Date.UTC(2026, 9, 20, 10),
    });
    expect((await kk.subjects.get(2))?.srsStage).toBe(0);
    expect((await kk.levelProgression.toArray()).map((l) => [l.id, l.level])).toEqual([[301, 1], [302, 2]]);
    expect((await kk.state.get('userLevel'))?.value).toBe(2);
    const status = await engine.status();
    expect(status).toMatchObject({ mode: 'server', label: 'kk.example.test', apiState: 'OK', banner: null, pending: 0, maxLevelGranted: 60, username: 'kodama' });
    expect(((await kk.state.get('server.srsSystems'))?.value as unknown[]).length).toBe(1);
  });

  it('incremental sync asks for updated_after (last success − 1 h) and merges without losing other columns', async () => {
    const http = firstSyncRoutes(new FakeHttp());
    const { kk, engine, clock } = await connected(http);
    await engine.syncNow();
    const cursors = new Map<string, number>();
    for (const r of await kk.state.where('key').startsWith('server.cursor.').toArray()) cursors.set(r.key.slice(14), r.value as number);
    clock.advance(10 * 60_000);
    http.requests.length = 0;
    const after = (path: string) => {
      const at = cursors.get(path.slice(4))! - HOUR;
      return `${path}?updated_after=${new Date(at).toISOString().replace(/\.?0*Z$/, 'Z')}`;
    };
    http
      .on('GET', after('/v2/assignments'), ok('assignments-updated'))
      .on('GET', after('/v2/review_statistics'), ok('empty-collection'))
      .on('GET', after('/v2/study_materials'), ok('empty-collection'))
      .on('GET', after('/v2/level_progressions'), ok('empty-collection'));
    const r = await engine.syncNow();
    expect(r.ok).toBe(true);
    // Subjects (hourly) and SRS systems (daily) are not fetched again yet.
    expect(r.steps.map((s) => s.step)).toEqual(['user', 'uploads', 'assignments', 'review_statistics', 'study_materials', 'level_progressions']);
    expect(http.requests.map((q) => q.url).filter((u) => u.includes('assignments'))).toEqual([BASE + after('/v2/assignments')]);
    const s10 = await kk.subjects.get(10);
    expect(s10).toMatchObject({ srsStage: 2, availableAt: Date.UTC(2026, 9, 25, 17, 30), meaningCorrect: 3, studyMaterialId: 5010 });
    expect((await kk.subjects.get(1))?.srsStage).toBe(5);
  });

  it('subscription limit from the user (free account: 3)', async () => {
    const http = firstSyncRoutes(new FakeHttp()).on('GET', '/v2/user', ok('user-free'));
    const { engine } = await connected(http);
    await engine.syncNow();
    expect(await engine.status()).toMatchObject({ maxLevelGranted: 3, vacation: true });
  });

  it('401: "token rejected" state, queue kept, nothing synced until a new token', async () => {
    const http = firstSyncRoutes(new FakeHttp());
    const { kk, engine } = await connected(http);
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 1, at: NOW, justPassed: false });
    http.on('GET', '/v2/user', json(401, fixture('error-401')));
    const r = await engine.syncNow();
    expect(r.ok).toBe(false);
    expect(r.apiState).toBe('API_KEY_REJECTED');
    expect(r.message).toBe('kk.example.test is not accepting your API token. Did you give your API token the correct permissions?');
    expect(await pendingUploads(kk)).toBe(1);
    expect((await engine.status()).banner).toEqual({ kind: 'rejected', text: r.message });

    http.requests.length = 0;
    expect((await engine.syncNow({ manual: true })).apiState).toBe('API_KEY_REJECTED');
    expect(http.requests).toHaveLength(0);

    http.on('GET', '/v2/user', ok('user')).on('POST', '/v2/reviews', ok('review-created'));
    await engine.setToken('new-token');
    const again = await engine.syncNow();
    expect(again.ok).toBe(true);
    expect(await pendingUploads(kk)).toBe(0);
    expect(http.calls('POST', '/v2/reviews')[0]!.headers!.Authorization).toBe('Bearer new-token');
  });

  it('a 401 on an upload also keeps the whole queue', async () => {
    const http = firstSyncRoutes(new FakeHttp()).on('POST', '/v2/reviews', json(401, fixture('error-401')));
    const { kk, engine } = await connected(http);
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 0, at: NOW, justPassed: false });
    await enqueueStudyMaterial(kk, { subjectId: 11, meaningNote: 'x', readingNote: null, meaningSynonyms: [] });
    const r = await engine.syncNow();
    expect(r.apiState).toBe('API_KEY_REJECTED');
    expect(await pendingUploads(kk)).toBe(2);
    expect(http.calls('POST', '/v2/study_materials')).toHaveLength(0);
  });

  it('server errors: error banner naming the server; a manual retry clears it', async () => {
    const http = firstSyncRoutes(new FakeHttp()).on('GET', '/v2/assignments', json(503, {}));
    const { engine } = await connected(http);
    const r = await engine.syncNow();
    expect(r).toMatchObject({ ok: false, apiState: 'ERROR', message: 'There was an error talking to kk.example.test' });
    expect((await engine.status()).lastError).toBe('HTTP 503');
    expect((await engine.syncNow()).apiState).toBe('ERROR'); // automatic: stays stopped
    http.on('GET', '/v2/assignments', ok('assignments'));
    expect((await engine.syncNow({ manual: true })).ok).toBe(true);
  });

  it('a different account on the server resets the downloaded data and the queue (GetUserTask)', async () => {
    const http = firstSyncRoutes(new FakeHttp());
    const { kk, engine } = await connected(http);
    await engine.syncNow();
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 0, at: NOW, justPassed: false });
    const other = structuredClone(fixture('user')) as { data: { id: string } };
    other.data.id = 'another-account';
    http.on('GET', '/v2/user', json(200, other));
    const r = await engine.syncNow();
    expect(r.accountChanged).toBe(true);
    expect(await pendingUploads(kk)).toBe(0);
    // Everything downloaded again from scratch (no updated_after after the reset).
    expect(http.requests.filter((q) => q.url.includes('updated_after'))).toHaveLength(0);
  });

  it('concurrent syncNow calls share one run', async () => {
    const http = firstSyncRoutes(new FakeHttp());
    const { engine } = await connected(http);
    const [a, b] = await Promise.all([engine.syncNow(), engine.syncNow()]);
    expect(a).toBe(b);
    expect(http.calls('GET', '/v2/user')).toHaveLength(1);
  });

  it('does nothing in local mode', async () => {
    const kk = await openDb();
    const http = new FakeHttp();
    const engine = new SyncEngine({ kk, http });
    expect((await engine.syncNow()).ok).toBe(false);
    expect(http.requests).toHaveLength(0);
  });
});

describe('upload queue', () => {
  it('sends in order (priority, then id) and applies the responses', async () => {
    const http = firstSyncRoutes(new FakeHttp())
      .on('POST', '/v2/study_materials', ok('study-material-created'))
      .on('PUT', '/v2/study_materials/5020', ok('study-material-created'))
      .on('POST', '/v2/reviews', ok('review-created'))
      .on('PUT', '/v2/assignments/9002/start', ok('assignment-started'));
    const { kk, engine } = await connected(http);
    await engine.syncNow();
    http.requests.length = 0;
    await enqueueStudyMaterial(kk, { subjectId: 11, meaningNote: 'two strokes', readingNote: null, meaningSynonyms: ['pair'] });
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 1, at: NOW, justPassed: false });
    await enqueueStudyMaterial(kk, { subjectId: 11, meaningNote: 'two strokes!', readingNote: null, meaningSynonyms: ['pair'] });
    await enqueueLessonStart(kk, { subjectId: 2, assignmentId: 0, at: NOW - 10 * 60_000 });
    expect((await listQueue(kk)).map((t) => t.kind)).toEqual(['review', 'lessonStart', 'studyMaterial', 'studyMaterial']);

    const r = await engine.flushUploads();
    expect(r.uploads).toMatchObject({ sent: 4, dropped: 0, remaining: 0 });
    expect(http.requests.map((q) => `${q.method} ${q.url.slice(BASE.length)}`)).toEqual([
      'POST /v2/reviews', 'PUT /v2/assignments/9002/start', 'POST /v2/study_materials', 'PUT /v2/study_materials/5020',
    ]);
    expect(JSON.parse(http.requests[1]!.body!)).toEqual({ started_at: '2026-10-25T09:50:00Z' });
    expect(JSON.parse(http.requests[3]!.body!)).toEqual({
      study_material: { meaning_note: 'two strokes!', meaning_synonyms: ['pair'], reading_note: null, subject_id: 11 },
    });
    expect(await kk.subjects.get(10)).toMatchObject({ srsStage: 3, readingIncorrect: 3, readingCurrentStreak: 0 });
    expect(await kk.subjects.get(2)).toMatchObject({ srsStage: 1, startedAt: NOW });
    expect(await kk.subjects.get(11)).toMatchObject({ studyMaterialId: 5020, meaningNote: 'two strokes' });
  });

  it('survives a restart: the queue is in IndexedDB', async () => {
    const name = freshDbName();
    const http = firstSyncRoutes(new FakeHttp()).on('POST', '/v2/reviews', 'network');
    const first = await openDb(name);
    const { engine } = await connected(http, first);
    await engine.syncNow();
    await enqueueReview(first, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 1, readingIncorrect: 0, at: NOW, justPassed: false });
    await enqueueReview(first, { subjectId: 1, assignmentId: 9001, meaningIncorrect: 0, readingIncorrect: 0, at: NOW, justPassed: false });
    const offline = await engine.flushUploads();
    expect(offline.uploads).toMatchObject({ sent: 0, remaining: 2, stop: { reason: 'failed' } });
    first.close();

    const reopened = new KkDb(name);
    await reopened.open();
    const queue = await listQueue(reopened);
    expect(queue.map((t) => (t.payload as { subjectId: number }).subjectId)).toEqual([10, 1]);
    expect(queue[0]).toMatchObject({ attempts: 1, lastError: 'offline' });

    const clock = new FakeClock(NOW + HOUR / 2);
    const http2 = firstSyncRoutes(new FakeHttp()).on('POST', '/v2/reviews', ok('review-created'));
    const engine2 = new SyncEngine({ kk: reopened, http: http2, clock, limiter: limiterFor(clock), retryDelay: 10 });
    const r = await engine2.flushUploads({ manual: true });
    expect(r.uploads).toMatchObject({ sent: 2, remaining: 0 });
    expect(http2.calls('POST', '/v2/reviews').map((q) => JSON.parse(q.body!).review.subject_id)).toEqual([10, 1]);
  });

  it('a failing task blocks the ones behind it and backs off', async () => {
    const http = firstSyncRoutes(new FakeHttp()).on('POST', '/v2/reviews', json(500, {}));
    const { kk, engine, clock } = await connected(http);
    await engine.syncNow({ manual: true });
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 0, at: NOW, justPassed: false });
    await enqueueStudyMaterial(kk, { subjectId: 11, meaningNote: 'x', readingNote: null, meaningSynonyms: [] });
    const r = await engine.flushUploads({ manual: true });
    expect(r.uploads?.stop).toEqual({ reason: 'failed', message: 'HTTP 500' });
    expect(http.calls('POST', '/v2/reviews')).toHaveLength(3); // NUM_API_TRIES
    expect(http.calls('POST', '/v2/study_materials')).toHaveLength(0);
    const head = (await listQueue(kk))[0]!;
    expect(head.nextAttemptAt).toBe(clock.now() + 30_000);

    // Automatic sync (no manual retry): the error state holds it; after a manual retry the backoff
    // is ignored and the queue drains.
    http.on('POST', '/v2/reviews', ok('review-created')).on('POST', '/v2/study_materials', ok('study-material-created'));
    expect((await engine.flushUploads()).ok).toBe(false);
    expect((await engine.flushUploads({ manual: true })).uploads).toMatchObject({ sent: 2, remaining: 0 });
  });

  it('honours the backoff on automatic flushes', async () => {
    const http = firstSyncRoutes(new FakeHttp()).on('POST', '/v2/reviews', json(502, {}), json(502, {}), json(502, {}), ok('review-created'));
    const { kk, engine, clock } = await connected(http);
    await engine.syncNow();
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 0, at: NOW, justPassed: false });
    await engine.flushUploads();
    // The learner retries the error (clears it) but automatic flushing waits for the backoff.
    await engine.store.setInError(false);
    const early = await engine.flushUploads();
    expect(early.uploads?.stop).toMatchObject({ reason: 'backoff' });
    expect(http.calls('POST', '/v2/reviews')).toHaveLength(3);
    clock.advance(31_000);
    expect((await engine.flushUploads()).uploads).toMatchObject({ sent: 1, remaining: 0 });
  });

  it('422 drops the task (the server refused it) and goes on', async () => {
    const http = firstSyncRoutes(new FakeHttp())
      .on('PUT', '/v2/assignments/9002/start', json(422, fixture('error-422')))
      .on('POST', '/v2/reviews', ok('review-created'));
    const { kk, engine } = await connected(http);
    await engine.syncNow();
    await enqueueLessonStart(kk, { subjectId: 2, assignmentId: 9002, at: NOW });
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 0, at: NOW, justPassed: false });
    const r = await engine.flushUploads();
    expect(r.uploads).toMatchObject({ sent: 1, dropped: 1, remaining: 0 });
  });

  it('a lesson with an unknown assignment looks it up by subject first', async () => {
    const http = new FakeHttp()
      .on('GET', '/v2/user', ok('user'))
      .on('GET', '/v2/assignments?subject_ids=2', json(200, {
        object: 'collection', pages: { next_url: null }, data: [(fixture('assignments') as { data: unknown[] }).data[1]],
      }))
      .on('PUT', '/v2/assignments/9002/start', ok('assignment-started'));
    const { kk, engine } = await connected(http);
    await enqueueLessonStart(kk, { subjectId: 2, assignmentId: 0, at: NOW });
    const r = await engine.flushUploads();
    expect(r.uploads).toMatchObject({ sent: 1 });
    expect(http.calls('PUT', '/v2/assignments/9002/start')).toHaveLength(1);
  });

  it('a passed review asks for an extra assignment refresh', async () => {
    const http = firstSyncRoutes(new FakeHttp()).on('POST', '/v2/reviews', ok('review-created'));
    const { kk, engine } = await connected(http);
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 0, at: NOW, justPassed: true });
    const r = await engine.syncNow();
    expect(r.steps.filter((s) => s.step === 'assignments')).toHaveLength(2);
  });
});

describe('ServerError', () => {
  it('is an Error with a reason', () => {
    const e = new ServerError('x', 'pending');
    expect(e).toBeInstanceOf(Error);
    expect(e.reason).toBe('pending');
  });
});
