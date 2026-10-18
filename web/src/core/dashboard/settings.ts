/**
 * The dashboard settings the computations read. Java: `GlobalSettings.Dashboard`.
 */

import { prefBoolean, type Preferences } from '../settings';
import { DEFAULT_TIME_LINE_SIZE } from './timeLine';

/** `Integer.parseInt(value, 10)`: optional sign, ASCII digits, int range; else null. */
function javaParseInt(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[+-]?[0-9]+$/.test(value)) return null;
  const n = Number(value);
  return n >= -2147483648 && n <= 2147483647 ? n : null;
}

/** `getTimeLineChartSize`: `timeline_chart_size` (a string), default and fallback 24. */
export function timeLineChartSize(prefs: Preferences): number {
  const v = prefs.timeline_chart_size;
  return javaParseInt(v ?? '24') ?? DEFAULT_TIME_LINE_SIZE;
}

/** `getShowOverLevelProgression`: `show_over_level_progression`, default false. */
export function showOverLevelProgression(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'show_over_level_progression', false);
}

/** `getLimitPreviousLevelProgression`: `previous_level_progression_limit`, default false. */
export function limitPreviousLevelProgression(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'previous_level_progression_limit', false);
}

/** `getPreviousLevelProgressionLimitedAmount`: `previous_level_progression_limit_amount`, default and fallback 1. */
export function previousLevelProgressionLimitedAmount(prefs: Preferences): number {
  const v = prefs.previous_level_progression_limit_amount;
  return javaParseInt(v ?? '1') ?? 1;
}
