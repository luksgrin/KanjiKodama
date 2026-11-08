/**
 * The dashboard settings the computations read.
 */

import { prefBoolean, type Preferences } from '../settings';
import { DEFAULT_TIME_LINE_SIZE } from './timeLine';

/** Optional sign, ASCII digits, int range; else null. */
function parseIntOrNull(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[+-]?[0-9]+$/.test(value)) return null;
  const n = Number(value);
  return n >= -2147483648 && n <= 2147483647 ? n : null;
}

/** `getTimeLineChartSize`: `timeline_chart_size` (a string), default and fallback 24. */
export function timeLineChartSize(prefs: Preferences): number {
  const v = prefs.timeline_chart_size;
  return parseIntOrNull(v ?? '24') ?? DEFAULT_TIME_LINE_SIZE;
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
  return parseIntOrNull(v ?? '1') ?? 1;
}

/** `show_timeline`, default true. */
export function showTimeLine(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'show_timeline', true);
}

/** `show_srs_breakdown`, default true. */
export function showSrsBreakdown(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'show_srs_breakdown', true);
}

/** `show_level_progression`, default true. */
export function showLevelProgression(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'show_level_progression', true);
}
