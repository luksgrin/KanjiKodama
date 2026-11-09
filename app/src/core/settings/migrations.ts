/**
 * One-time changes to stored settings, run once per device at start-up (`appController`). Each one
 * has a marker key that records it ran, so a value the user changes afterwards stays. Restoring a
 * settings backup doesn't run them again: restored values are the user's choice (and the marker,
 * written before, stays as the restore only writes the backup's keys).
 */
import type { Preferences, PreferenceValue } from './index';

/** Marker: `indicate_kanji_reading_type` was switched on once (it became a default-on setting). */
export const READING_KIND_ON_APPLIED = 'kanjikodama_reading_kind_on_applied';

/**
 * The settings to write so every one-time change has run: empty when all ran before. Turns
 * `indicate_kanji_reading_type` on once, even where it is stored as off (the old default).
 */
export function settingsMigrations(prefs: Preferences): Record<string, PreferenceValue> {
  const writes: Record<string, PreferenceValue> = {};
  if (prefs[READING_KIND_ON_APPLIED] !== true) {
    writes.indicate_kanji_reading_type = true;
    writes[READING_KIND_ON_APPLIED] = true;
  }
  return writes;
}
