/**
 * The activity log in the progress file: an optional `activity` list after `jumps`, one object per
 * study day with something done, oldest first:
 *
 *   "activity": [{"day": "2026-11-09", "lessons": 5, "reviews": 40, "correct": 36, "incorrect": 4, "selfStudy": 0}]
 *
 * Absent when the log is empty, so a file without study history is byte for byte what it was.
 * Reading is lenient: older files have no `activity`, and a malformed entry is skipped rather than
 * failing the restore (the history is a nicety, the progress is what matters).
 */

import { JSONArray, JSONObject, TypedNumber, parseJsonObject, type JsonValue } from '../progressFile/androidJson';
import { dayTotal, isDayKey, type ActivityDay, type ActivityLog } from './activity';

/** The progress file key. */
export const ACTIVITY_KEY = 'activity';

const COUNT_FIELDS = ['lessons', 'reviews', 'correct', 'incorrect', 'selfStudy'] as const;

/** The `activity` value for the file; null when there is nothing to save. */
export function activityJson(log: ActivityLog): JSONArray | null {
  const days = [...log.values()].filter((d) => isDayKey(d.day) && dayTotal(d) > 0)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (days.length === 0) return null;
  const out = new JSONArray();
  for (const d of days) {
    const o = new JSONObject();
    o.map.set('day', d.day);
    for (const f of COUNT_FIELDS) o.map.set(f, TypedNumber.int(d[f]));
    out.values.push(o);
  }
  return out;
}

/** A count field: absent is 0; anything but a whole number from 0 to a million is unreadable (null). */
function count(v: JsonValue | null | undefined): number | null {
  if (v === undefined) return 0;
  if (!(v instanceof TypedNumber)) return null;
  const n = v.doubleValue();
  return Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : null;
}

/** The `activity` of a progress file's text: [] when absent or unreadable. */
export function readActivity(json: string): ActivityDay[] {
  let list: JsonValue | undefined;
  try {
    list = parseJsonObject(json).map.get(ACTIVITY_KEY);
  } catch {
    return [];
  }
  if (!(list instanceof JSONArray)) return [];
  const out: ActivityDay[] = [];
  for (const o of list.values) {
    if (!(o instanceof JSONObject)) continue;
    const day = o.map.get('day');
    if (typeof day !== 'string' || !isDayKey(day)) continue;
    const c = COUNT_FIELDS.map((f) => count(o.map.get(f)));
    if (c.some((n) => n === null)) continue;
    const [lessons, , correct, incorrect, selfStudy] = c as number[];
    // Right + wrong decide the review count (they can't disagree in a file the app wrote).
    out.push({ day, lessons: lessons!, reviews: correct! + incorrect!, correct: correct!, incorrect: incorrect!, selfStudy: selfStudy! });
  }
  return out;
}
