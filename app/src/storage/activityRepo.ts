/**
 * The study activity log (core `stats/activity.ts`) in the `activity` table: one row per study day.
 */
import { mergeActivity, type ActivityDay } from '../core/stats/activity';
import type { KkDb } from './db';

/** The whole log, by day. */
export async function loadActivity(kk: KkDb): Promise<Map<string, ActivityDay>> {
  const rows = await kk.activity.toArray();
  return new Map(rows.map((r) => [r.day, { day: r.day, lessons: r.lessons, reviews: r.reviews, correct: r.correct, incorrect: r.incorrect, selfStudy: r.selfStudy }]));
}

/** Writes these days (whole rows). */
export async function saveActivityDays(kk: KkDb, days: Iterable<ActivityDay>): Promise<void> {
  const rows = [...days];
  if (rows.length > 0) await kk.activity.bulkPut(rows);
}

/**
 * Merges `days` (a progress file's log) into the stored one, each count the larger of the two
 * (`mergeActivity`). Returns the merged log.
 */
export async function mergeActivityDays(kk: KkDb, days: readonly ActivityDay[]): Promise<Map<string, ActivityDay>> {
  const merged = mergeActivity(await loadActivity(kk), days);
  const touched = new Set(days.map((d) => d.day));
  await saveActivityDays(kk, [...merged.values()].filter((d) => touched.has(d.day)));
  return merged;
}
