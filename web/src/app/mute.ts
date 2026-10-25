/**
 * Java's mute toggle (toolbar action_mute, PropertiesDao.isMuted; AudioUtil.playAudio does nothing
 * while muted). Stored as a preference so it survives restarts; the app controller checks it before
 * every `platform.audio.play`.
 */
import type { PreferenceValue } from '../core/settings';

export const MUTE_PREF = 'muted';

export function isMuted(prefs: Readonly<Record<string, PreferenceValue>> | null | undefined): boolean {
  return prefs?.[MUTE_PREF] === true;
}
