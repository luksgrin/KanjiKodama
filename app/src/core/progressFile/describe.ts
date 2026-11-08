/**
 * The quick validity check and one-line summary shown before a restore.
 */

import {
  TypedError,
  optInt,
  optJSONArray,
  optLong,
  optString,
  parseJsonObject,
  type JSONObject,
} from './androidJson';
import { FORMAT, LEGACY_FORMAT, VERSION } from './format';

/** How the date in the summary is printed: the device's locale and time zone. */
export interface DateStyle {
  /** Only `en-US`: medium date, short time, "Oct 17, 2025 12:00 AM". */
  locale: 'en-US';
  /** An IANA time zone, such as `UTC` or `Asia/Tokyo`. */
  timeZone: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * A medium date and short time in `en-US`, as Android 16 prints them:
 * `MMM d, y h:mm a`.
 */
export function formatSavedAt(ms: number, style: DateStyle): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: style.timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    era: 'short',
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour24 = Number(get('hour'));
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const month = MONTHS[Number(get('month')) - 1] ?? '';
  return `${month} ${Number(get('day'))}, ${Number(get('year'))} ${hour12}:${get('minute').padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

/** The checks `describe` makes; throws typed errors. */
export function checkHeader(root: JSONObject): void {
  const format = optString(root, 'format');
  if (format !== FORMAT && format !== LEGACY_FORMAT) {
    throw new TypedError('IllegalArgumentException', 'This is not a KanjiKodama progress file.');
  }
  if (optInt(root, 'version') > VERSION) {
    throw new TypedError('IllegalArgumentException', 'This progress file was made by a newer KanjiKodama.');
  }
}

/**
 * The summary: "Saved Oct 17, 2025 12:00 AM, WaniKani order, level 3, 2 items
 * with progress." Throws a `TypedError` (`org.json.JSONException`,
 * `IllegalArgumentException`, or `NullPointerException` when `subjects` is
 * missing or not an array) with Android's message.
 */
export function describe(json: string, style: DateStyle): string {
  const root = parseJsonObject(json);
  checkHeader(root);
  const subjects = optJSONArray(root, 'subjects');
  const saved = formatSavedAt(Number(optLong(root, 'exportedAt')), style);
  const order = optString(root, 'curriculum') === 'JLPT' ? ', JLPT order' : ', WaniKani order';
  const level = `, level ${optInt(root, 'userLevel', 1)}`;
  if (subjects === null) {
    throw new TypedError(
      'NullPointerException',
      "Attempt to invoke virtual method 'int org.json.JSONArray.length()' on a null object reference",
    );
  }
  return `Saved ${saved}${order}${level}, ${subjects.values.length} items with progress.`;
}
