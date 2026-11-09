/**
 * The study activity log: per study day, how many lessons, reviews (right / wrong) and self-study
 * items were finished. Counts only, no subjects and no times: the study calendar ("garden"), the
 * streaks and the totals are built from it.
 *
 * A study day is a calendar date, `YYYY-MM-DD`, in the device's time zone, starting at the
 * `study_day_start_hour` (default 4 AM) instead of midnight, so a late-night session counts for the
 * evening it began. The caller passes the time zone as the offset at that moment (minutes east of
 * UTC, `-Date#getTimezoneOffset()`), so a day keeps its key across daylight-saving changes.
 *
 * Local only: never uploaded in server mode, never imported from WaniKani. It travels in the
 * progress file (`activity`, optional; see `activityJson` / `readActivity`).
 */

import type { ReportType } from '../srs';
import { DAY, HOUR, MINUTE } from '../time';
import type { Preferences } from '../settings';

/** One study day's counts. */
export interface ActivityDay {
  /** `YYYY-MM-DD`. */
  readonly day: string;
  readonly lessons: number;
  /** Finished reviews: `correct + incorrect`. */
  readonly reviews: number;
  /** Reviews answered without a wrong answer. */
  readonly correct: number;
  /** Reviews with at least one wrong answer. */
  readonly incorrect: number;
  readonly selfStudy: number;
}

/** The log, by `day`. */
export type ActivityLog = ReadonlyMap<string, ActivityDay>;

/** `study_day_start_hour` default: a new study day starts at 4 AM. */
export const DEFAULT_DAY_START_HOUR = 4;

/** `study_day_start_hour` (a list setting, stored as a string): 0–23, default 4. */
export function studyDayStartHour(prefs: Preferences): number {
  const v = prefs.study_day_start_hour;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,2}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : DEFAULT_DAY_START_HOUR;
}

/** `show_study_garden`, default true: the garden panel on the dashboard. */
export function showStudyGarden(prefs: Preferences): boolean {
  const v = prefs.show_study_garden;
  return typeof v === 'boolean' ? v : true;
}

// --- Dates ---------------------------------------------------------------------------------------

/** Days since 1970-01-01 of a proleptic Gregorian date (month 1–12). */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.trunc((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.trunc(yoe / 4) - Math.trunc(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The date of a day number (`daysFromCivil`'s inverse). */
export function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.trunc((doe - Math.trunc(doe / 1460) + Math.trunc(doe / 36524) - Math.trunc(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.trunc(yoe / 4) - Math.trunc(yoe / 100));
  const mp = Math.trunc((5 * doy + 2) / 153);
  const d = doy - Math.trunc((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of a day number. */
export function dayKeyOfNumber(n: number): string {
  const { y, m, d } = civilFromDays(n);
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The day number of a `YYYY-MM-DD` key; NaN when it isn't a real date. */
export function dayNumber(key: string): number {
  const m = DAY_KEY.exec(key);
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  const n = daysFromCivil(y, mo, d);
  return dayKeyOfNumber(n) === key ? n : NaN;
}

/** Whether `key` is a real `YYYY-MM-DD` date. */
export function isDayKey(key: string): boolean {
  return !Number.isNaN(dayNumber(key));
}

/** `key` moved by `n` days. */
export function addDays(key: string, n: number): string {
  return dayKeyOfNumber(dayNumber(key) + n);
}

/**
 * The study day of the moment `ts` (epoch ms): the local date (`offsetMinutes` east of UTC) of
 * `ts - startHour` hours.
 */
export function studyDay(ts: number, offsetMinutes: number, startHour: number): string {
  const local = ts + offsetMinutes * MINUTE - startHour * HOUR;
  return dayKeyOfNumber(Math.floor(local / DAY));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(key: string): number {
  return (((dayNumber(key) + 4) % 7) + 7) % 7;
}

// --- Recording -----------------------------------------------------------------------------------

/** A day with nothing done. */
export function emptyDay(day: string): ActivityDay {
  return { day, lessons: 0, reviews: 0, correct: 0, incorrect: 0, selfStudy: 0 };
}

/** What one finished session item adds to its day. */
export function countReport(day: ActivityDay, type: ReportType, wrongAnswers: number): ActivityDay {
  switch (type) {
    case 'LESSON':
      return { ...day, lessons: day.lessons + 1 };
    case 'REVIEW':
      return wrongAnswers > 0
        ? { ...day, reviews: day.reviews + 1, incorrect: day.incorrect + 1 }
        : { ...day, reviews: day.reviews + 1, correct: day.correct + 1 };
    case 'SELF_STUDY':
      return { ...day, selfStudy: day.selfStudy + 1 };
  }
}

/** Everything done that day. */
export function dayTotal(day: ActivityDay | undefined): number {
  return day === undefined ? 0 : day.lessons + day.reviews + day.selfStudy;
}

/**
 * Two logs joined, each count the larger of the two (a restore merges the file's log into the
 * device's: restoring the same file twice counts nothing twice, and days only one side knows stay).
 */
export function mergeActivity(a: ActivityLog, b: Iterable<ActivityDay>): Map<string, ActivityDay> {
  const out = new Map(a);
  for (const d of b) {
    const x = out.get(d.day);
    // The reviews come from the side with more of them, so right + wrong still add up.
    const r = x === undefined || d.reviews > x.reviews ? d : x;
    out.set(d.day, x === undefined ? d : {
      day: d.day,
      lessons: Math.max(x.lessons, d.lessons),
      reviews: r.reviews,
      correct: r.correct,
      incorrect: r.incorrect,
      selfStudy: Math.max(x.selfStudy, d.selfStudy),
    });
  }
  return out;
}
