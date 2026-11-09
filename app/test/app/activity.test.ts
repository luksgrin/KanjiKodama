import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { NO_LEVEL_TEST_HOOKS, type SessionHooks } from '../../src/core/session';
import { HOUR } from '../../src/core/time';
import { KkDb } from '../../src/storage/db';
import { progressFile } from '../progress-storage/helpers';
import { T0, makeApp, type Harness } from './fixtures';

type Kind = 'LESSON' | 'REVIEW' | 'SELF_STUDY';

/** One finished session item through the app's session hooks, inside a write. */
function finish(h: Harness, hooks: SessionHooks, subjectId: number, type: Kind, wrong = 0, timestamp = 0): Promise<void> {
  return h.app.write((ldb, now) => {
    hooks.report!(ldb, { subjectId, type, meaningIncorrect: wrong, readingIncorrect: 0, timestamp, assignmentId: 0 }, now);
  });
}

const T0_DAY = '2026-10-25'; // T0 is 2026-10-25 09:30 UTC

describe('study activity', () => {
  it('lessons and reviews count towards the study day, are saved and survive a restart', async () => {
    const h = makeApp();
    await h.app.start();
    expect(h.app.get().activity.size).toBe(0);
    const hooks = h.app.sessionHooks(NO_LEVEL_TEST_HOOKS);
    await finish(h, hooks, 1, 'LESSON');
    // The local report still runs: the lesson started the subject.
    expect(h.app.get().learner!.progress.subjects.get(1)?.startedAt).toBe(T0);
    await finish(h, hooks, 2, 'LESSON');
    await finish(h, hooks, 1, 'REVIEW', 0);
    await finish(h, hooks, 2, 'REVIEW', 2);
    await finish(h, hooks, 2, 'SELF_STUDY', 1);
    expect(h.app.get().activity.get(T0_DAY)).toEqual({ day: T0_DAY, lessons: 2, reviews: 2, correct: 1, incorrect: 1, selfStudy: 1 });
    h.app.dispose();

    const again = makeApp({ dbName: h.dbName, at: T0 + HOUR });
    await again.app.start();
    expect(again.app.get().activity.get(T0_DAY)?.lessons).toBe(2);
    again.app.dispose();
  });

  it('the study day starts at the start hour, in the device time zone', async () => {
    // 02:00 UTC is 11:00 in Tokyo; 20:00 UTC is 05:00 the next day there.
    const h = makeApp({ at: Date.UTC(2026, 9, 25, 2, 0), offsetMinutes: 9 * 60 });
    await h.app.start();
    const hooks = h.app.sessionHooks(NO_LEVEL_TEST_HOOKS);
    await finish(h, hooks, 1, 'LESSON');
    h.clock.advance(18 * HOUR); // 20:00 UTC: 05:00 on the 26th in Tokyo
    await finish(h, hooks, 2, 'LESSON');
    await h.app.setPreference('study_day_start_hour', '6'); // now 05:00 still belongs to the 25th
    await finish(h, hooks, 1, 'REVIEW');
    // Delayed reporting: the moment of the answer decides, not the report.
    await finish(h, hooks, 2, 'REVIEW', 0, Date.UTC(2026, 9, 24, 10, 0));
    expect([...h.app.get().activity.values()].map((d) => [d.day, d.lessons, d.reviews])).toEqual(
      expect.arrayContaining([['2026-10-25', 1, 1], ['2026-10-26', 1, 0], ['2026-10-24', 0, 1]]),
    );
    h.app.dispose();
  });

  it('a failed write drops its counts', async () => {
    const h = makeApp();
    await h.app.start();
    const hooks = h.app.sessionHooks(NO_LEVEL_TEST_HOOKS);
    await expect(h.app.write((ldb, now) => {
      hooks.report!(ldb, { subjectId: 1, type: 'LESSON', meaningIncorrect: 0, readingIncorrect: 0, timestamp: 0, assignmentId: 0 }, now);
      throw new Error('boom');
    })).rejects.toThrow('boom');
    await h.app.write(() => undefined);
    expect(h.app.get().activity.size).toBe(0);
    const kk = new KkDb(h.dbName);
    expect(await kk.activity.count()).toBe(0);
    kk.close();
    h.app.dispose();
  });

  it('goes into the saved progress file; a restore merges a file\'s log in', async () => {
    const h = makeApp();
    await h.app.start();
    expect(h.app.exportProgressFile().text).not.toContain('"activity"');
    const hooks = h.app.sessionHooks(NO_LEVEL_TEST_HOOKS);
    await finish(h, hooks, 1, 'LESSON');
    const file = JSON.parse(h.app.exportProgressFile().text) as { activity: unknown[] };
    expect(file.activity).toEqual([{ day: T0_DAY, lessons: 1, reviews: 0, correct: 0, incorrect: 0, selfStudy: 0 }]);

    // An older file (no log) keeps the device's days; a file with a log adds its days.
    await h.app.restoreProgress(progressFile({ userLevel: 1 }));
    expect(h.app.get().activity.get(T0_DAY)?.lessons).toBe(1);
    await h.app.restoreProgress(progressFile({
      activity: [
        { day: '2026-10-20', lessons: 0, reviews: 7, correct: 7, incorrect: 0, selfStudy: 0 },
        { day: T0_DAY, lessons: 3, reviews: 0, correct: 0, incorrect: 0, selfStudy: 0 },
      ],
    }));
    expect(h.app.get().activity.get('2026-10-20')?.reviews).toBe(7);
    expect(h.app.get().activity.get(T0_DAY)?.lessons).toBe(3);
    h.app.dispose();

    const again = makeApp({ dbName: h.dbName });
    await again.app.start();
    expect(again.app.get().activity.size).toBe(2);
    again.app.dispose();
  });
});
