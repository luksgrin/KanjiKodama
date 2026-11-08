/** Small display formatters ported from the Java app's text helpers. */
import { DAY, HOUR, MINUTE } from '../core/time';

/** `ObjectSupport.getWaitTimeAsInformalString`: "now", "in 5 min", "in 3 hours", "in 2 days". */
export function waitTimeInformal(waitTime: number): string {
  if (waitTime <= 0) return 'now';
  if (waitTime < HOUR * 2) return `in ${Math.trunc((waitTime + MINUTE / 2) / MINUTE)} min`;
  if (waitTime < DAY * 2) return `in ${Math.trunc((waitTime + HOUR / 2) / HOUR)} hours`;
  return `in ${Math.trunc((waitTime + DAY / 2) / DAY)} days`;
}

/** `ObjectSupport.getShortWaitTimeAsInformalString`: "now", "5m", "3h", "2d". */
export function waitTimeShort(waitTime: number): string {
  if (waitTime <= 0) return 'now';
  if (waitTime < HOUR) return `${Math.trunc((waitTime + MINUTE / 2) / MINUTE)}m`;
  if (waitTime < DAY * 2) return `${Math.trunc((waitTime + HOUR / 2) / HOUR)}h`;
  return `${Math.trunc((waitTime + DAY / 2) / DAY)}d`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Whether the device uses a 24-hour clock (the Java app asks `DateFormat.is24HourFormat`). */
export function uses24HourClock(locale?: string): boolean {
  try {
    const hc = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hc === 'h23' || hc === 'h24';
  } catch {
    return false;
  }
}

/** `TextUtil.formatShortTimeForDisplay`: "14:00" or "2pm" / "2.30pm", optionally with the weekday. */
export function shortTime(ts: number, includeDayOfWeek: boolean, h24: boolean = uses24HourClock()): string {
  const d = new Date(ts);
  const hour = d.getHours();
  const minute = d.getMinutes();
  let s: string;
  if (h24) {
    s = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  } else {
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const ampm = hour >= 12 ? 'pm' : 'am';
    s = minute === 0 ? `${hour12}${ampm}` : `${hour12}.${String(minute).padStart(2, '0')}${ampm}`;
  }
  return includeDayOfWeek ? `${WEEKDAYS[d.getDay()]} ${s}` : s;
}

/** A date and time for settings rows ("Oct 25, 2026, 14:05"). */
export function dateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function megabytes(bytes: number): string {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

/** `TextUtil.formatTimestampForDisplay`: medium date and short time in the user's locale; "" for 0. (Same as components/subject `formatTimestamp`; this one keeps the dashboard bundle small.) */
export function formatTimestamp(ms: number): string {
  if (ms === 0) return '';
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { dateStyle: 'medium' })} ${d.toLocaleTimeString(undefined, { timeStyle: 'short' })}`;
}
