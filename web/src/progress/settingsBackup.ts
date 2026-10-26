/**
 * "Backup your settings" / "Restore your settings" (`activities/BackupActivity`,
 * `GlobalSettings.getAllSettings` / `setAllSettings`): every stored setting in the Java app's file
 * format, so a backup made by the Java app restores here and the other way round.
 *
 * The file is Gson's `Map<String, Map<String, String>>`: per key `{"value": value.toString(),
 * "type": value.getClass().getSimpleName()}`, e.g.
 * `{"show_timeline":{"value":"true","type":"Boolean"},"max_review_session_size":{"value":"50","type":"String"}}`.
 * Types are Integer, Boolean, Float, Long and String (`SharedPreferences` has no others the app
 * uses). Restoring writes every entry (keys not in the file stay as they are) and fails as a whole
 * on the first entry Java can't convert, like `handlePickFileResult` (its exception is only logged).
 *
 * File name: `"smouldering_durtles_" + yyyy-MM-dd + ".json"` (the device's date), as the Java app names it.
 */
import type { Preferences, PreferenceValue } from '../core/settings';

export type JavaPrefType = 'Integer' | 'Boolean' | 'Float' | 'Long' | 'String';

interface Entry {
  value: string;
  type: JavaPrefType;
}

const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

const pad = (n: number): string => String(n).padStart(2, '0');

/** `BackupActivity.generateBackupFilename` in the device's time zone (`now` for tests). */
export function settingsBackupFileName(now: Date = new Date()): string {
  return `smouldering_durtles_${String(now.getFullYear()).padStart(4, '0')}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** Java's `Float.toString` for the values a setting can hold ("1.0", "0.5"). */
function floatText(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}

/**
 * The Java class a stored value has. Numbers: AndroidX stores ints (SeekBarPreference), the app a few
 * longs; a whole number in int range is an Integer, a larger one a Long, a fraction a Float.
 */
function entryOf(value: PreferenceValue): Entry | null {
  if (typeof value === 'boolean') return { value: String(value), type: 'Boolean' };
  if (typeof value === 'string') return { value, type: 'String' };
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (!Number.isInteger(value)) return { value: floatText(value), type: 'Float' };
    return { value: String(value), type: value >= INT_MIN && value <= INT_MAX ? 'Integer' : 'Long' };
  }
  return null; // null / undefined: not stored
}

/** `handleSaveFileResult`: the backup file text. */
export function settingsBackupText(prefs: Preferences): string {
  const out: Record<string, Entry> = {};
  for (const [key, value] of Object.entries(prefs)) {
    const e = entryOf(value);
    if (e) out[key] = e;
  }
  return JSON.stringify(out);
}

/** A backup the Java code would reject (not JSON, not a map of maps, an unknown type, a bad number). */
export class SettingsBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsBackupError';
  }
}

/** Java `Integer.valueOf` / `Long.valueOf`: an optional sign and decimal digits, in range. */
function javaInteger(text: string, min: number, max: number, type: string): number {
  if (!/^[+-]?\d+$/.test(text)) throw new SettingsBackupError(`For input string: "${text}" (${type})`);
  const n = Number(text);
  if (n < min || n > max || !Number.isSafeInteger(n)) throw new SettingsBackupError(`Value out of range: "${text}" (${type})`);
  return n;
}

/** Java `Float.valueOf` (decimal and exponent forms, NaN/Infinity rejected as unusable settings). */
function javaFloat(text: string): number {
  const t = text.trim().replace(/[fFdD]$/, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) throw new SettingsBackupError(`For input string: "${text}" (Float)`);
  return Math.fround(Number(t));
}

/** `handlePickFileResult`: the settings in the file. Throws `SettingsBackupError`. */
export function parseSettingsBackup(text: string): Record<string, PreferenceValue> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new SettingsBackupError(`Not a settings backup: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new SettingsBackupError('Not a settings backup.');
  const out: Record<string, PreferenceValue> = {};
  for (const [key, raw] of Object.entries(json as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SettingsBackupError(`Bad entry for ${key}`);
    const { value, type } = raw as { value?: unknown; type?: unknown };
    // `Objects.requireNonNull(entry.getValue().get("value"))`; Gson reads numbers/booleans as strings too.
    if (value === undefined || value === null || type === undefined || type === null) throw new SettingsBackupError(`Bad entry for ${key}`);
    const v = String(value);
    switch (String(type)) {
      case 'Integer': out[key] = javaInteger(v, INT_MIN, INT_MAX, 'Integer'); break;
      case 'Long': out[key] = javaInteger(v, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 'Long'); break;
      // `Boolean.valueOf`: "true" in any case is true, anything else false.
      case 'Boolean': out[key] = v.toLowerCase() === 'true'; break;
      case 'Float': out[key] = javaFloat(v); break;
      case 'String': out[key] = v; break;
      default: throw new SettingsBackupError(`Unsupported type: ${String(type)}`);
    }
  }
  return out;
}
