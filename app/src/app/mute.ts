/**
 * The toolbar's mute toggle (no audio plays while muted). Stored as a preference so it survives
 * restarts; the app controller checks it before
 * every `platform.audio.play`.
 */
import type { PreferenceValue } from '../core/settings';

export const MUTE_PREF = 'muted';

export function isMuted(prefs: Readonly<Record<string, PreferenceValue>> | null | undefined): boolean {
  return prefs?.[MUTE_PREF] === true;
}
