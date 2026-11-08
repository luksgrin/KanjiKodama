/**
 * Time in core: epoch milliseconds, always passed in as `now` (never read from a clock here), like
 * the Java app's `local/Clock` pinned in tests.
 */

/** Constants.SECOND … WEEK, in ms. */
export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

/** `ObjectSupport.getTopOfHour`: `ts - (ts % HOUR)` (Java `%`, truncating; ts is never negative). */
export function topOfHour(ts: number): number {
  return ts - (ts % HOUR);
}
