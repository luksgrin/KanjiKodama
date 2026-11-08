/** Mode switches: no silent loss of unsent uploads, the importer path back. */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

import { emptySubjectRow } from '../../src/core/progressFile/format';
import { checkConnection, ServerError, SyncEngine } from '../../src/sync/engine';
import { backupBeforeServerSwitch, downloadForLocal, flushBeforeLeaving, switchToLocal, switchToServer } from '../../src/sync/modeSwitch';
import { enqueueReview, pendingUploads } from '../../src/sync/queue';
import { ServerStore } from '../../src/sync/store';
import { NO_JLPT, smallContent } from '../progress-storage/helpers';
import { BASE, FakeClock, FakeHttp, firstSyncRoutes, limiterFor, NOW, ok, openDb } from './helpers';

const deps = () => {
  const clock = new FakeClock(NOW);
  return { clock, limiter: limiterFor(clock), retryDelay: 1 };
};

async function serverDb() {
  const http = firstSyncRoutes(new FakeHttp());
  const kk = await openDb();
  await kk.subjects.put({ ...emptySubjectRow(), id: 10, srsStage: 4, passedAt: 1 });
  await kk.state.bulkPut([{ key: 'curriculum', value: 'WANIKANI' }, { key: 'mm_state.level_test', value: 'done' }]);
  const user = await checkConnection({ http, baseUrl: BASE, token: 'tok', ...deps() });
  const message = await switchToServer(kk, { baseUrl: BASE, token: 'tok', user });
  return { kk, http, message };
}

describe('local → server', () => {
  it('clears local progress, stores the connection and the account, WaniKani order', async () => {
    const { kk, message } = await serverDb();
    expect(message).toBe('Server mode: downloading everything from kk.example.test.');
    expect(await kk.subjects.count()).toBe(0);
    expect(await kk.state.get('mm_state.level_test')).toBeUndefined();
    const store = new ServerStore(kk);
    expect(await store.mode()).toBe('server');
    expect(await store.baseUrl()).toBe(BASE);
    expect(await store.token()).toBe('tok');
    expect((await kk.state.get('userLevel'))?.value).toBe(2);
    expect((await kk.state.get('ordering'))?.value).toBe('WANIKANI');
    expect((await kk.state.get('curriculum'))?.value).toBe('WANIKANI');
  });

  it('the backup offer saves the current progress file through the platform', async () => {
    const kk = await openDb();
    await kk.subjects.put({ ...emptySubjectRow(), id: 10, srsStage: 4, unlockedAt: 5 });
    const saved: Array<{ name: string; text: string }> = [];
    const files = { saveText: async (name: string, text: string) => { saved.push({ name, text }); return 'saved' as const; }, openText: async () => null };
    expect(await backupBeforeServerSwitch(kk, files, NOW)).toBe('saved');
    expect(saved[0]!.name).toMatch(/^kanjikodama-progress-2026-10-2\d\.json$/);
    expect(JSON.parse(saved[0]!.text).subjects.map((s: { id: number }) => s.id)).toEqual([10]);
    expect((await kk.meta.get('lastSavedAt'))?.value).toBe(NOW);
  });
});

describe('server → local', () => {
  it('refuses while uploads are pending unless explicitly discarded', async () => {
    const { kk } = await serverDb();
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 0, at: NOW, justPassed: false });
    const o = { content: smallContent(), jlptKanji: NO_JLPT, now: NOW };
    const err = await switchToLocal(kk, o).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ServerError);
    expect((err as ServerError).reason).toBe('pending');
    expect((err as ServerError).message).toBe('1 answers or notes have not been sent to kk.example.test yet.');
    expect(await pendingUploads(kk)).toBe(1);
    expect(await new ServerStore(kk).mode()).toBe('server');

    expect(await switchToLocal(kk, { ...o, discardPendingUploads: true })).toBe('Local mode, starting at level 1.');
    expect(await pendingUploads(kk)).toBe(0);
    expect(await new ServerStore(kk).mode()).toBe('local');
    expect((await kk.state.get('userLevel'))?.value).toBe(1);
    // Level 1 unlocked from the bundled content (updateProgression).
    expect((await kk.subjects.get(1))?.unlockedAt).toBe(NOW);
    expect(await kk.serverSubjects.count()).toBe(0);
    // The connection is kept for next time.
    expect(await new ServerStore(kk).baseUrl()).toBe(BASE);
  });

  it('flushes first, then brings the server progress along (importer path)', async () => {
    const { kk, http } = await serverDb();
    const d = deps();
    const engine = new SyncEngine({ kk, http, ...d });
    await engine.syncNow();
    http.on('POST', '/v2/reviews', ok('review-created'));
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 1, at: NOW, justPassed: false });
    expect(await flushBeforeLeaving(engine)).toBe(0);

    http.requests.length = 0;
    const download = await downloadForLocal(kk, { http, ...deps() });
    expect(http.requests.map((q) => q.url.slice(BASE.length))).toEqual([
      '/v2/user', '/v2/assignments', '/v2/review_statistics', '/v2/study_materials', '/v2/level_progressions',
    ]);
    expect(download.assignments.map((a) => a.subjectId)).toEqual([1, 2, 10]);
    const message = await switchToLocal(kk, { content: smallContent(), jlptKanji: NO_JLPT, now: NOW, download });
    expect(message).toBe('Local mode. Imported level 2: 3 items, 1 review statistics, 1 notes.');
    expect(await kk.subjects.get(10)).toMatchObject({ assignmentId: 9003, srsStage: 1, studyMaterialId: 5010 });
    expect(await new ServerStore(kk).mode()).toBe('local');
  });

  it('a failed download names the server and changes nothing', async () => {
    const { kk, http } = await serverDb();
    http.on('GET', '/v2/study_materials', 'network');
    await expect(downloadForLocal(kk, { http, ...deps() }))
      .rejects.toThrow('The download from kk.example.test was interrupted. Local progress was not changed.');
    expect(await new ServerStore(kk).mode()).toBe('server');
  });

  it('no token: "There is no API token for <server>."', async () => {
    const { kk, http } = await serverDb();
    await new ServerStore(kk).tokens.set(null);
    await expect(downloadForLocal(kk, { http })).rejects.toThrow('There is no API token for kk.example.test.');
  });
});
