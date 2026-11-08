/** The pure server-mode decisions (core `server/`). */
import { describe, expect, it } from 'vitest';

import {
  RATE_LIMIT_DELAY,
  afterFailure,
  afterWait,
  apiErrorBanner,
  apiKeyRejectedBanner,
  backoffDelay,
  classifyStatus,
  cleanSubjectData,
  collectionUri,
  createReviewBody,
  currentApiState,
  effectiveMaxLevelGranted,
  formatTimestampForApi,
  initialRateLimiter,
  levelAccessible,
  observeHeaders,
  orderTasks,
  parseCollectionPage,
  parseServerUser,
  pause,
  serverStatusMessage,
  startAssignmentBody,
  switchToLocalQuestion,
  syncSteps,
  taskRequest,
  tokenRejectedMessage,
  tryAcquire,
  updatedAfter,
  WANIKANI_API_BASE_URL,
  type RateLimiterState,
} from '../../src/core/server';
import { BASE, fixture, NOW } from './helpers';

const HOUR = 3600_000;

describe('formatTimestampForApi', () => {
  it('prints ISO_OFFSET_DATE_TIME in UTC, fraction only when non-zero', () => {
    expect(formatTimestampForApi(0)).toBeNull();
    expect(formatTimestampForApi(1700000000000)).toBe('2023-11-14T22:13:20Z');
    expect(formatTimestampForApi(1700000000500)).toBe('2023-11-14T22:13:20.5Z');
    expect(formatTimestampForApi(1700000000123)).toBe('2023-11-14T22:13:20.123Z');
    expect(formatTimestampForApi(1700000000120)).toBe('2023-11-14T22:13:20.12Z');
  });
});

describe('rate limiter (api/RateLimiter)', () => {
  const run = (s0: RateLimiterState, now: number) => {
    // RateLimiter.prepare's loop with a fake sleep; returns the total wait and the new state.
    let s = s0;
    let t = now;
    let waited = 0;
    for (;;) {
      const r = tryAcquire(s, t);
      if (r.ok) return { s: r.state, waited, t };
      waited += r.waitMs;
      t += r.waitMs;
      s = afterWait(s, t);
    }
  };

  it('allows one call per 1.1 s with a burst of 1', () => {
    let { s, waited, t } = run(initialRateLimiter(NOW), NOW);
    expect(waited).toBe(0);
    ({ s, waited, t } = run(s, t));
    expect(waited).toBe(RATE_LIMIT_DELAY);
    ({ s, waited, t } = run(s, t + 2000));
    expect(waited).toBe(0);
    expect(t).toBe(NOW + RATE_LIMIT_DELAY + 2000);
  });

  it('a 429 pauses as if 3 over the burst (~4.4 s)', () => {
    const first = run(initialRateLimiter(NOW), NOW);
    const r = run(pause(first.s), first.t);
    expect(r.waited).toBe(4 * RATE_LIMIT_DELAY);
  });

  it('holds until RateLimit-Reset when none remain, and for Retry-After on a 429', () => {
    const s = initialRateLimiter(NOW);
    const reset = String(Math.floor((NOW + 30_000) / 1000));
    const held = observeHeaders(s, 200, { 'ratelimit-remaining': '0', 'ratelimit-reset': reset }, NOW);
    expect(tryAcquire(held, NOW)).toEqual({ ok: false, waitMs: 30_000 });
    expect(observeHeaders(s, 200, { 'ratelimit-remaining': '12', 'ratelimit-reset': reset }, NOW)).toEqual(s);
    expect(observeHeaders(s, 429, { 'retry-after': '7' }, NOW).holdUntil).toBe(NOW + 7000);
    // Absurd values are ignored.
    expect(observeHeaders(s, 429, { 'retry-after': '86400' }, NOW)).toEqual(s);
  });
});

describe('API state and schedule', () => {
  const flags = { hasToken: true, rejected: false, inError: false, lastApiSuccess: NOW, lastUserSync: NOW };
  it('ApiState.getCurrentApiState', () => {
    expect(currentApiState({ ...flags, hasToken: false }, NOW)).toBe('API_KEY_MISSING');
    expect(currentApiState({ ...flags, rejected: true, inError: true }, NOW)).toBe('API_KEY_REJECTED');
    expect(currentApiState({ ...flags, inError: true }, NOW)).toBe('ERROR');
    expect(currentApiState({ ...flags, lastApiSuccess: 0 }, NOW)).toBe('UNKNOWN');
    expect(currentApiState(flags, NOW + HOUR + 1)).toBe('EXPIRED');
    expect(currentApiState({ ...flags, lastUserSync: NOW - 2 * HOUR }, NOW)).toBe('REFRESH_USER_DATA');
    expect(currentApiState(flags, NOW)).toBe('OK');
  });

  it('runs steps in task priority order; subjects hourly, SRS systems daily', () => {
    expect(syncSteps({}, NOW)).toEqual([
      'user', 'spaced_repetition_systems', 'uploads', 'subjects', 'assignments', 'review_statistics', 'study_materials', 'level_progressions',
    ]);
    expect(syncSteps({ subjects: NOW - 10, spaced_repetition_systems: NOW - 10 }, NOW)).toEqual([
      'user', 'uploads', 'assignments', 'review_statistics', 'study_materials', 'level_progressions',
    ]);
  });

  it('updated_after is an hour before the last success; SRS systems always whole', () => {
    expect(updatedAfter({}, 'assignments')).toBe(0);
    expect(updatedAfter({ assignments: NOW }, 'assignments')).toBe(NOW - HOUR);
    expect(updatedAfter({ spaced_repetition_systems: NOW }, 'spaced_repetition_systems')).toBe(0);
    expect(collectionUri('/v2/assignments', NOW - HOUR)).toBe('/v2/assignments?updated_after=2026-10-25T09:00:00Z');
    expect(collectionUri('/v2/assignments', 0)).toBe('/v2/assignments');
  });

  it('classifies statuses', () => {
    expect([200, 201, 304, 401, 404, 422, 429, 500].map(classifyStatus)).toEqual(
      ['ok', 'ok', 'notModified', 'unauthorized', 'error', 'unprocessable', 'tooManyRequests', 'error']);
  });
});

describe('responses', () => {
  it('parses a collection page with its absolute next_url', () => {
    const page = parseCollectionPage(fixture('subjects-page1'))!;
    expect(page.items.map((i) => i.id)).toEqual([1, 2]);
    expect(page.nextUrl).toBe('https://cdn.kk.example.test/v2/subjects?page_after_id=2');
    expect(parseCollectionPage(fixture('subjects-page2'))!.nextUrl).toBeNull();
    expect(parseCollectionPage({ object: 'collection' })).toBeNull();
    expect(parseCollectionPage({ data: [{ id: 1, data: {} }] })!.invalid).toBe(1);
  });

  it('drops readings that are empty or "None"', () => {
    const page = parseCollectionPage(fixture('subjects-page2'))!;
    const cleaned = cleanSubjectData(page.items[0]!.data) as { readings: Array<{ reading: string }> };
    expect(cleaned.readings.map((r) => r.reading)).toEqual(['いち']);
  });

  it('subscription limit: subscription.max_level_granted, else max_level_granted_by_subscription; stale after a month', () => {
    expect(parseServerUser(fixture('user'))).toMatchObject({ level: 2, maxLevelGranted: 60, username: 'kodama', vacationStartedAt: 0 });
    const free = parseServerUser(fixture('user-free'))!;
    expect(free.maxLevelGranted).toBe(3);
    expect(free.vacationStartedAt).toBe(Date.UTC(2026, 9, 19));
    expect(parseServerUser({ data: { level: 5, max_level_granted_by_subscription: 10 } })!.maxLevelGranted).toBe(10);
    expect(parseServerUser({ object: 'user' })).toBeNull();
    expect(effectiveMaxLevelGranted(60, NOW, NOW + 1000)).toBe(60);
    expect(effectiveMaxLevelGranted(60, 0, NOW)).toBe(3);
    expect(effectiveMaxLevelGranted(60, NOW - 31 * 24 * HOUR, NOW)).toBe(3);
    expect(levelAccessible(3, 3)).toBe(true);
    expect(levelAccessible(4, 3)).toBe(false);
  });
});

describe('queue decisions', () => {
  it('sends in priority then id order (reviews and lessons 15, study materials 16)', () => {
    const tasks = [
      { id: 1, kind: 'studyMaterial', payload: {}, createdAt: 0 },
      { id: 2, kind: 'review', payload: {}, createdAt: 0 },
      { id: 3, kind: 'mystery', payload: {}, createdAt: 0 },
      { id: 4, kind: 'lessonStart', payload: {}, createdAt: 0 },
    ];
    expect(orderTasks(tasks).map((t) => t.id)).toEqual([2, 4, 1, 3]);
  });

  it('backs off 30 s, 1 min, 2 min … up to an hour', () => {
    expect([0, 1, 2, 3, 10, 20].map(backoffDelay)).toEqual([0, 30_000, 60_000, 120_000, 3600_000, 3600_000]);
    const t = afterFailure({ id: 1, kind: 'review', payload: {}, createdAt: 0, attempts: 1 }, NOW, 'HTTP 503');
    expect(t).toMatchObject({ attempts: 2, nextAttemptAt: NOW + 60_000, lastError: 'HTTP 503' });
  });

  it('builds the request bodies; times only when older than 5 minutes', () => {
    expect(startAssignmentBody(NOW - 60_000, NOW)).toEqual({ started_at: null });
    expect(startAssignmentBody(NOW - 10 * 60_000, NOW)).toEqual({ started_at: '2026-10-25T09:50:00Z' });
    expect(createReviewBody(10, 1, 2, NOW - 6 * 60_000, NOW)).toEqual({
      review: { subject_id: 10, incorrect_meaning_answers: 1, incorrect_reading_answers: 2, created_at: '2026-10-25T09:54:00Z' },
    });
    const sm = { kind: 'studyMaterial' as const, payload: { subjectId: 11, meaningNote: 'n', readingNote: null, meaningSynonyms: ['a'] } };
    expect(taskRequest(sm, { assignmentId: 0, studyMaterialId: 0 }, NOW)?.uri).toBe('/v2/study_materials');
    expect(taskRequest(sm, { assignmentId: 0, studyMaterialId: 5020 }, NOW)).toMatchObject({ method: 'PUT', uri: '/v2/study_materials/5020' });
    const lesson = { kind: 'lessonStart' as const, payload: { subjectId: 2, assignmentId: 0, at: NOW } };
    expect(taskRequest(lesson, { assignmentId: 0, studyMaterialId: 0 }, NOW)).toBeNull();
    expect(taskRequest(lesson, { assignmentId: 9002, studyMaterialId: 0 }, NOW)).toMatchObject({ method: 'PUT', uri: '/v2/assignments/9002/start' });
  });
});

describe('messages name the configured server', () => {
  it('uses "WaniKani" for WaniKani and the host otherwise', () => {
    expect(tokenRejectedMessage(BASE)).toBe('kk.example.test rejected this API token.');
    expect(tokenRejectedMessage(WANIKANI_API_BASE_URL)).toBe('WaniKani rejected this API token.');
    expect(apiErrorBanner(WANIKANI_API_BASE_URL)).toBe('There was an error talking to the WaniKani servers');
    expect(apiErrorBanner(BASE)).toBe('There was an error talking to kk.example.test');
    expect(apiKeyRejectedBanner(BASE)).toBe('kk.example.test is not accepting your API token. Did you give your API token the correct permissions?');
    expect(serverStatusMessage(BASE, 2)).toBe('Connected to kk.example.test (https://kk.example.test). The server decides SRS stages, unlocks and'
      + ' level-ups.\n\n2 answers or notes have not been sent to kk.example.test yet.');
    expect(switchToLocalQuestion(BASE, 0)).not.toContain('will be lost');
    expect(switchToLocalQuestion(BASE, 3)).toContain('3 answers or notes not yet sent to kk.example.test will be lost.');
  });
});
