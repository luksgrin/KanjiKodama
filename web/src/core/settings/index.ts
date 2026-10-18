/**
 * The user's settings as the logic reads them: the Android app's `SharedPreferences` values by key
 * (`GlobalSettings`). Getters take the preferences as an argument, apply the Java defaults and, where
 * Java does, the `enable_advanced` gate. Only the settings the ported logic needs are here; other
 * modules add theirs next to these, named after the `GlobalSettings` getter they port.
 *
 * Java: `GlobalSettings`. Fixtures: `answers/matching-kanji-device.json`, `anki/mode-settings.json`.
 */

/** A preference value as `SharedPreferences` stores it. Absent keys use the getter's default. */
export type PreferenceValue = boolean | number | string | null | undefined;

/** The preferences by key, like `SharedPreferences.getAll()`. */
export type Preferences = Readonly<Record<string, PreferenceValue>>;

/** `SharedPreferences.getBoolean(key, defaultValue)`: the default when absent (or null). */
export function prefBoolean(prefs: Preferences, key: string, defaultValue: boolean): boolean {
  const v = prefs[key];
  return typeof v === 'boolean' ? v : defaultValue;
}

/** `GlobalSettings.getAdvancedEnabled`: `enable_advanced`, default false. */
export function advancedEnabled(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_advanced', false);
}

/** `GlobalSettings.AdvancedOther.getShakeOnMatchingKanji`: `shake_on_matching_kanji` (default true), advanced only. */
export function shakeOnMatchingKanji(prefs: Preferences): boolean {
  return advancedEnabled(prefs) && prefBoolean(prefs, 'shake_on_matching_kanji', true);
}

/** `SessionType`. `NONE` reads the self-study settings where Java falls through to them. */
export type SessionType = 'LESSON' | 'REVIEW' | 'SELF_STUDY' | 'NONE';
