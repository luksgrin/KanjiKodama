/**
 * The study day (core `stats/activity.ts`) of a moment on this device: its time zone at that moment
 * and the `study_day_start_hour` setting.
 */
import type { Preferences } from '../core/settings';
import { studyDay, studyDayStartHour } from '../core/stats/activity';

/** Minutes east of UTC at `ts` on this device. */
export function deviceOffsetMinutes(ts: number): number {
  return -new Date(ts).getTimezoneOffset();
}

/** `YYYY-MM-DD`: the study day `ts` belongs to. */
export function localStudyDay(ts: number, prefs: Preferences, offsetMinutes: (ts: number) => number = deviceOffsetMinutes): string {
  return studyDay(ts, offsetMinutes(ts), studyDayStartHour(prefs));
}
