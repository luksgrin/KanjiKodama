import { describe, expect, it } from 'vitest';
import { makeContent, type ContentSubject } from '../content';
import { createLearnerDb, updateProgress, type LearnerDb } from '../progression';
import { DAY, HOUR, MINUTE } from '../time';
import {
  MAX_REVIEW_NOTIFICATIONS,
  enableNotifications,
  notificationHour,
  planReviewNotifications,
  reviewNotificationText,
} from './plan';

function subject(id: number, level = 1): ContentSubject {
  return {
    id, object: 'kanji', hiddenAt: 0, lessonPosition: id, srsSystemId: 1, level, characters: String(id), slug: null,
    meanings: [], auxiliaryMeanings: [], readings: [], componentSubjectIds: [], amalgamationSubjectIds: [],
    visuallySimilarSubjectIds: [], partsOfSpeech: [], frequency: 0, joyoGrade: 0, jlptLevel: 0,
  };
}

function dbWith(n: number, level = 1): LearnerDb {
  const subjects = Array.from({ length: n }, (_, i) => subject(i + 1, level));
  return createLearnerDb(makeContent(subjects, []), new Map());
}

/** A started review item available at `availableAt`. */
function review(db: LearnerDb, id: number, availableAt: number): void {
  updateProgress(db, id, { unlockedAt: 1, startedAt: 1, srsStage: 1, availableAt });
}

function lesson(db: LearnerDb, id: number): void {
  updateProgress(db, id, { unlockedAt: 1, startedAt: 0, srsStage: 0 });
}

// 2026-10-24T09:20:00Z: 20 minutes past an hour.
const NOW = Date.UTC(2026, 9, 24, 9, 20);
const H10 = Date.UTC(2026, 9, 24, 10);

describe('notificationHour', () => {
  it('keeps an on-the-hour time and rounds anything else up', () => {
    expect(notificationHour(H10)).toBe(H10);
    expect(notificationHour(H10 + 1)).toBe(H10 + HOUR);
    expect(notificationHour(H10 + 59 * MINUTE)).toBe(H10 + HOUR);
  });
});

describe('planReviewNotifications', () => {
  it('is empty with nothing upcoming', () => {
    const db = dbWith(3);
    review(db, 1, NOW - HOUR); // already available
    expect(planReviewNotifications(db, NOW)).toEqual([]);
  });

  it('plans one entry per review hour with the counts at that hour', () => {
    const db = dbWith(6);
    review(db, 1, NOW - 2 * HOUR); // available now
    review(db, 2, H10);
    review(db, 3, H10);
    review(db, 4, H10 + 3 * HOUR);
    review(db, 5, H10 + 3 * HOUR + 15 * MINUTE); // counted at the hour after
    lesson(db, 6);
    expect(planReviewNotifications(db, NOW)).toEqual([
      { at: H10, newReviews: 2, totalReviews: 3, lessons: 1 },
      { at: H10 + 3 * HOUR, newReviews: 1, totalReviews: 4, lessons: 1 },
      { at: H10 + 4 * HOUR, newReviews: 1, totalReviews: 5, lessons: 1 },
    ]);
  });

  it('never plans a time at or before now', () => {
    const db = dbWith(3);
    const onTheHour = Date.UTC(2026, 9, 24, 9);
    review(db, 1, onTheHour); // == now: already available
    review(db, 2, onTheHour + 10 * MINUTE); // past, not on the hour: available, no notification
    review(db, 3, onTheHour + HOUR);
    const plan = planReviewNotifications(db, onTheHour + 10 * MINUTE);
    expect(plan).toEqual([{ at: onTheHour + HOUR, newReviews: 1, totalReviews: 3, lessons: 0 }]);
    for (const t of planReviewNotifications(db, onTheHour)) expect(t.at).toBeGreaterThan(onTheHour);
  });

  it('a review due later in the current hour notifies at the next top of the hour', () => {
    const db = dbWith(1);
    review(db, 1, NOW + 5 * MINUTE);
    expect(planReviewNotifications(db, NOW)).toEqual([{ at: H10, newReviews: 1, totalReviews: 1, lessons: 0 }]);
  });

  it('stops at 7 days', () => {
    const db = dbWith(3);
    review(db, 1, notificationHour(NOW + 7 * DAY)); // first hour past the window end
    review(db, 2, NOW + 7 * DAY - 30 * MINUTE); // hour = NOW + 7d - 20min: inside
    review(db, 3, NOW + 8 * DAY);
    const plan = planReviewNotifications(db, NOW);
    expect(plan.map((t) => t.at)).toEqual([notificationHour(NOW + 7 * DAY - 30 * MINUTE)]);
    expect(plan[0]!.totalReviews).toBe(1);
  });

  it('caps at 64, earliest first, totals still cumulative', () => {
    const db = dbWith(100);
    for (let i = 1; i <= 100; i++) review(db, i, H10 + (i - 1) * HOUR);
    const plan = planReviewNotifications(db, NOW);
    expect(plan).toHaveLength(MAX_REVIEW_NOTIFICATIONS);
    expect(plan[0]).toEqual({ at: H10, newReviews: 1, totalReviews: 1, lessons: 0 });
    expect(plan[63]).toEqual({ at: H10 + 63 * HOUR, newReviews: 1, totalReviews: 64, lessons: 0 });
    expect(planReviewNotifications(db, NOW, { cap: 2 })).toHaveLength(2);
    expect(planReviewNotifications(db, NOW, { cap: 0 })).toEqual([]);
  });

  it('skips hidden subjects, levels above the max and vacation mode', () => {
    const db = dbWith(3);
    review(db, 1, H10);
    review(db, 2, H10);
    review(db, 3, H10);
    db.table.get(2)!.hiddenAt = 5;
    db.table.get(3)!.level = 61;
    expect(planReviewNotifications(db, NOW)).toEqual([{ at: H10, newReviews: 1, totalReviews: 1, lessons: 0 }]);
    expect(planReviewNotifications(db, NOW, { maxLevel: 0 })).toEqual([]);
    expect(planReviewNotifications(db, NOW, { vacationMode: true })).toEqual([]);
  });

  it('ignores NULL and text availableAt (hand-edited files)', () => {
    const db = dbWith(3);
    updateProgress(db, 1, { availableAt: null });
    updateProgress(db, 2, { availableAt: 'soon' });
    review(db, 3, H10);
    expect(planReviewNotifications(db, NOW)).toEqual([{ at: H10, newReviews: 1, totalReviews: 1, lessons: 0 }]);
  });

  it('works on epoch hours: a DST change does not shift or merge hours', () => {
    // Europe/Madrid leaves summer time on 2026-10-25 at 01:00 UTC (03:00 CEST -> 02:00 CET):
    // local 02:00-03:00 happens twice, but the epoch hours stay distinct and 1 h apart.
    const db = dbWith(3);
    const t0 = Date.UTC(2026, 9, 25, 0); // 02:00 CEST
    review(db, 1, t0);
    review(db, 2, t0 + HOUR); // 02:00 CET
    review(db, 3, t0 + 2 * HOUR);
    const plan = planReviewNotifications(db, t0 - 30 * MINUTE);
    expect(plan.map((t) => t.at)).toEqual([t0, t0 + HOUR, t0 + 2 * HOUR]);
    // Spring forward (2027-03-28 01:00 UTC): local 02:00 doesn't exist, the epoch hour does.
    const db2 = dbWith(1);
    const spring = Date.UTC(2027, 2, 28, 1);
    review(db2, 1, spring);
    expect(planReviewNotifications(db2, spring - HOUR).map((t) => t.at)).toEqual([spring]);
  });

  it('the window is 7 x 24 epoch hours whatever the time zone', () => {
    const db = dbWith(200);
    for (let i = 1; i <= 200; i++) review(db, i, H10 + (i - 1) * HOUR);
    const plan = planReviewNotifications(db, NOW, { cap: 1000 });
    expect(plan).toHaveLength(168); // 10:00 .. 09:00 seven days later (09:20 + 7 d)
    expect(plan.at(-1)!.at).toBe(H10 + 167 * HOUR);
  });
});

describe('reviewNotificationText', () => {
  it('has the notification texts', () => {
    expect(reviewNotificationText({ lessons: 0, totalReviews: 12 })).toEqual({
      title: 'New reviews available',
      body: '12 reviews available',
    });
    expect(reviewNotificationText({ lessons: 5, totalReviews: 1 })).toEqual({
      title: 'New lessons and reviews available',
      body: '5 lessons and 1 reviews available',
    });
  });
});

describe('enableNotifications', () => {
  it('defaults to true', () => {
    expect(enableNotifications({})).toBe(true);
    expect(enableNotifications({ enable_notifications: false })).toBe(false);
  });
});
