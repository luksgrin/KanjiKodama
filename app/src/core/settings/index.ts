/**
 * The user's settings as the logic reads them: stored values by key. Getters take the preferences as
 * an argument and apply the setting's default and, for advanced settings, the `enable_advanced` gate.
 * Modules add the getters they need next to these.
 *
 * Fixtures: `answers/matching-kanji-device.json`, `anki/mode-settings.json`.
 */

/** A stored preference value. Absent keys use the getter's default. */
export type PreferenceValue = boolean | number | string | null | undefined;

/** The preferences by key. */
export type Preferences = Readonly<Record<string, PreferenceValue>>;

/** A stored boolean: the default when absent (or null). */
export function prefBoolean(prefs: Preferences, key: string, defaultValue: boolean): boolean {
  const v = prefs[key];
  return typeof v === 'boolean' ? v : defaultValue;
}

/** `enable_advanced`, default false. */
export function advancedEnabled(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_advanced', false);
}

/** `shake_on_matching_kanji` (default true), advanced only. */
export function shakeOnMatchingKanji(prefs: Preferences): boolean {
  return advancedEnabled(prefs) && prefBoolean(prefs, 'shake_on_matching_kanji', true);
}

/** The session type. `NONE` reads the self-study settings. */
export type SessionType = 'LESSON' | 'REVIEW' | 'SELF_STUDY' | 'NONE';

export * from './session';
export * from './feedback';
