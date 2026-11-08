/**
 * The dashboard timeline: available lessons and reviews, the upcoming reviews per hour slot, and the
 * next review beyond the chart.
 */

import { HOUR, topOfHour } from '../time';
import { num, progressRow, sqlIsZero, sqlNonZero, type LearnerDb } from '../progression';

/** The highest level granted in local mode. */
export const LOCAL_MAX_LEVEL_GRANTED = 60;

/** `timeline_chart_size_shown` default. */
export const DEFAULT_TIME_LINE_SIZE = 24;

export interface TimeLineOptions {
  /** `timeline_chart_size`, in hours. */
  size: number;
  /** The highest level granted (60 in local mode). */
  maxLevel?: number;
  /** Vacation mode: no lessons or reviews at all. */
  vacationMode?: boolean;
}

/** The timeline, with subject ids instead of subjects. */
export interface TimeLine {
  /** The top of the hour the timeline was made in: slot 0. */
  firstSlot: number;
  availableLessons: number[];
  availableReviews: number[];
  /** One list of review ids per hour slot (`size` of them). */
  slots: number[][];
  /** Per slot: reviews not passed yet that are on the level-up track. */
  numRequiredForLevelUp: number[];
  /** First review beyond the chart (0 if none) and how many become available then. */
  longTermUpcomingReviewDate: number;
  numLongTermUpcomingReviews: number;
}

/** `TimeLine.getUpcomingReviewDate`: the first review in slots 1.., 0 if none. */
export function upcomingReviewDate(db: LearnerDb, t: TimeLine): number {
  for (let i = 1; i < t.slots.length; i++) {
    const slot = t.slots[i]!;
    if (slot.length > 0) return num(progressRow(db, slot[0]!), 'availableAt');
  }
  return 0;
}

/** `TimeLine.getNumUpcomingReviews`: the reviews in slots 1... */
export function numUpcomingReviews(t: TimeLine): number {
  let n = 0;
  for (let i = 1; i < t.slots.length; i++) n += t.slots[i]!.length;
  return n;
}

/** Visible, typed and at most `maxLevel` (the common WHERE of the dashboard queries). */
function inRange(db: LearnerDb, id: number, maxLevel: number): boolean {
  const t = db.table.get(id)!;
  return t.hiddenAt === 0 && t.level <= maxLevel;
}

/**
 * The level-up ids: the current level's kanji and their components, empty at the
 * last level.
 */
export function levelUpIds(db: LearnerDb, userLevel: number, maxLevel: number): Set<number> {
  const out = new Set<number>();
  if (userLevel >= maxLevel) return out;
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id)!;
    if (s.object !== 'kanji' || t.hiddenAt !== 0 || t.level !== userLevel) continue;
    out.add(s.id);
    for (const c of s.componentSubjectIds) out.add(c);
  }
  return out;
}

/** `getAvailableLessonItems`: unlocked, not started, not burned (or resurrected); by level, lesson position, id. */
export function availableLessonIds(db: LearnerDb, maxLevel: number): number[] {
  const ids: number[] = [];
  for (const s of db.content.subjects) {
    if (!inRange(db, s.id, maxLevel)) continue;
    const row = progressRow(db, s.id);
    if ((sqlNonZero(row.resurrectedAt) || sqlIsZero(row.burnedAt)) && sqlNonZero(row.unlockedAt) && sqlIsZero(row.startedAt)) {
      ids.push(s.id);
    }
  }
  const key = (id: number): readonly [number, number] => {
    const t = db.table.get(id)!;
    return [t.level, t.lessonPosition];
  };
  return ids.sort((a, b) => {
    const [la, pa] = key(a);
    const [lb, pb] = key(b);
    return la - lb || pa - pb || a - b;
  });
}

/**
 * `getUpcomingReviewItems`: reviews available before `cutoff`. The query has no ORDER BY; SQLite
 * answers it from the `availableAt` index, so rows come by availableAt, then id.
 */
export function upcomingReviewIds(db: LearnerDb, maxLevel: number, cutoff: number): number[] {
  const rows: [number, number][] = [];
  for (const s of db.content.subjects) {
    if (!inRange(db, s.id, maxLevel)) continue;
    const at = progressRow(db, s.id).availableAt;
    if (typeof at === 'number' && at !== 0 && at < cutoff) rows.push([at, s.id]);
  }
  rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return rows.map((r) => r[1]);
}

/** `getNextLongTermReviewDate` and `getNextLongTermReviewCount`. */
function nextLongTermReviews(db: LearnerDb, maxLevel: number, from: number): [number, number] {
  let date = 0;
  let count = 0;
  for (const s of db.content.subjects) {
    if (!inRange(db, s.id, maxLevel)) continue;
    const at = progressRow(db, s.id).availableAt;
    if (typeof at !== 'number' || at === 0 || at < from) continue;
    if (date === 0 || at < date) {
      date = at;
      count = 1;
    } else if (at === date) {
      count++;
    }
  }
  return [date, count];
}

/** The timeline at `now`. */
export function computeTimeLine(db: LearnerDb, now: number, options: TimeLineOptions): TimeLine {
  const maxLevel = options.maxLevel ?? LOCAL_MAX_LEVEL_GRANTED;
  const userLevel = db.progress.userLevel;
  const size = options.size;
  const firstSlot = topOfHour(now);
  const t: TimeLine = {
    firstSlot,
    availableLessons: [],
    availableReviews: [],
    slots: Array.from({ length: Math.max(0, size) }, () => []),
    numRequiredForLevelUp: Array.from({ length: Math.max(0, size) }, () => 0),
    longTermUpcomingReviewDate: 0,
    numLongTermUpcomingReviews: 0,
  };
  if (options.vacationMode === true) return t;

  const levelUp = levelUpIds(db, userLevel, maxLevel);
  t.availableLessons = availableLessonIds(db, maxLevel);

  const cutoff = now + size * HOUR;
  for (const id of upcomingReviewIds(db, maxLevel, cutoff)) {
    const row = progressRow(db, id);
    const availableAt = num(row, 'availableAt');
    if (availableAt === 0) continue;
    if (availableAt < now) t.availableReviews.push(id);
    // Integer division truncates toward zero.
    const slot = Math.max(0, Math.trunc((availableAt - firstSlot) / HOUR));
    if (slot < t.slots.length) {
      t.slots[slot]!.push(id);
      if (num(row, 'passedAt') === 0 && levelUp.has(id)) t.numRequiredForLevelUp[slot]!++;
    }
  }

  const [date, count] = nextLongTermReviews(db, maxLevel, topOfHour(cutoff));
  t.longTermUpcomingReviewDate = date;
  t.numLongTermUpcomingReviews = date === 0 ? 0 : count;
  return t;
}
