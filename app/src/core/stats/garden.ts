/**
 * The study garden: streaks, the calendar's cells and the totals, from the activity log
 * (`activity.ts`). A day "counts" when anything was finished (a lesson, a review or a self-study
 * item); each cell grows with the day's total: soil → sprout → sapling → tree → blossoming tree.
 */

import { addDays, dayNumber, dayTotal, daysFromCivil, dayKeyOfNumber, weekday, type ActivityDay, type ActivityLog } from './activity';

/** 0 soil (nothing), 1 sprout, 2 sapling, 3 tree, 4 blossoming tree. */
export type GardenLevel = 0 | 1 | 2 | 3 | 4;

/** The smallest day total of levels 1–4. */
export const GARDEN_THRESHOLDS: readonly [number, number, number, number] = [1, 20, 60, 150];

export const GARDEN_LEVEL_NAMES: readonly string[] = ['Soil', 'Sprout', 'Sapling', 'Tree', 'Blossoming tree'];

/** How far a day with this total has grown. */
export function gardenLevel(total: number): GardenLevel {
  let level: GardenLevel = 0;
  for (let i = 0; i < GARDEN_THRESHOLDS.length; i++) if (total >= GARDEN_THRESHOLDS[i]!) level = (i + 1) as GardenLevel;
  return level;
}

export interface Streaks {
  /**
   * Days in a row with study, up to today; when nothing is done yet today, up to yesterday (today
   * can still keep it going). 0 when neither day has study.
   */
  current: number;
  /** The longest run ever (at least `current`). */
  best: number;
  studiedToday: boolean;
}

/** The streaks on `today` (a `YYYY-MM-DD` study day). Days after `today` are ignored. */
export function streaks(log: ActivityLog, today: string): Streaks {
  const t = dayNumber(today);
  const days = [...log.values()]
    .filter((d) => dayTotal(d) > 0)
    .map((d) => dayNumber(d.day))
    .filter((n) => !Number.isNaN(n) && n <= t)
    .sort((a, b) => a - b);
  const studied = new Set(days);
  let best = 0;
  let run = 0;
  let prev = NaN;
  for (const n of days) {
    run = n === prev + 1 ? run + 1 : 1;
    prev = n;
    if (run > best) best = run;
  }
  const studiedToday = studied.has(t);
  let current = 0;
  for (let n = studiedToday ? t : t - 1; studied.has(n); n--) current++;
  return { current, best: Math.max(best, current), studiedToday };
}

export interface GardenCell {
  day: string;
  total: number;
  level: GardenLevel;
  isToday: boolean;
  /** After today: drawn empty, never soil. */
  isFuture: boolean;
}

/** A month: weeks of seven cells, Sunday first; days of the neighbouring months are null. */
export interface GardenMonth {
  year: number;
  /** 1–12. */
  month: number;
  weeks: (GardenCell | null)[][];
}

function cell(log: ActivityLog, day: string, today: string): GardenCell {
  const total = dayTotal(log.get(day));
  const isFuture = dayNumber(day) > dayNumber(today);
  return { day, total, level: isFuture ? 0 : gardenLevel(total), isToday: day === today, isFuture };
}

/** `month` (1–12) of `year` as a calendar. */
export function gardenMonth(log: ActivityLog, year: number, month: number, today: string): GardenMonth {
  const first = daysFromCivil(year, month, 1);
  const next = month === 12 ? daysFromCivil(year + 1, 1, 1) : daysFromCivil(year, month + 1, 1);
  const weeks: (GardenCell | null)[][] = [];
  let week: (GardenCell | null)[] = new Array<GardenCell | null>(weekday(dayKeyOfNumber(first))).fill(null);
  for (let n = first; n < next; n++) {
    week.push(cell(log, dayKeyOfNumber(n), today));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push([...week, ...new Array<GardenCell | null>(7 - week.length).fill(null)]);
  return { year, month, weeks };
}

/** The twelve months of `year`. */
export function gardenYear(log: ActivityLog, year: number, today: string): GardenMonth[] {
  return Array.from({ length: 12 }, (_, i) => gardenMonth(log, year, i + 1, today));
}

/** The `n` days up to and including `today`, oldest first (the dashboard's strip). */
export function recentDays(log: ActivityLog, today: string, n: number): GardenCell[] {
  return Array.from({ length: n }, (_, i) => cell(log, addDays(today, i - n + 1), today));
}

export interface ActivityTotals {
  /** Days with any study. */
  studyDays: number;
  lessons: number;
  reviews: number;
  correct: number;
  incorrect: number;
  selfStudy: number;
  /** Reviews answered right, in % (rounded down); null without reviews. */
  accuracy: number | null;
}

/** The totals of the days from `from` to `to` (inclusive keys); both null: everything. */
export function activityTotals(log: ActivityLog, from: string | null = null, to: string | null = null): ActivityTotals {
  const lo = from === null ? -Infinity : dayNumber(from);
  const hi = to === null ? Infinity : dayNumber(to);
  const t = { studyDays: 0, lessons: 0, reviews: 0, correct: 0, incorrect: 0, selfStudy: 0 };
  for (const d of log.values()) {
    const n = dayNumber(d.day);
    if (Number.isNaN(n) || n < lo || n > hi) continue;
    if (dayTotal(d) > 0) t.studyDays++;
    t.lessons += d.lessons;
    t.reviews += d.reviews;
    t.correct += d.correct;
    t.incorrect += d.incorrect;
    t.selfStudy += d.selfStudy;
  }
  return { ...t, accuracy: t.reviews > 0 ? Math.floor((t.correct * 100) / t.reviews) : null };
}

/** The busiest day (the earliest of equals); null when nothing was done. */
export function busiestDay(log: ActivityLog): ActivityDay | null {
  let best: ActivityDay | null = null;
  for (const d of [...log.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    if (dayTotal(d) > 0 && (best === null || dayTotal(d) > dayTotal(best))) best = d;
  }
  return best;
}
