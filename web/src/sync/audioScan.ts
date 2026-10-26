/**
 * "Auto-download audio for upcoming reviews" (`auto_download_audio`, Java default true) on Android:
 * which subjects' audio to fetch, as the Java app picks them.
 *
 * - `LiveTimeLine.updateLocal`, at most every 12 hours: the available lessons and the reviews due
 *   within the timeline chart size (the `scanSubjects` of `computeTimeLine`), then every subject of
 *   the learner's level; `AudioUtil.scheduleDownloadTasks(…, 100)`.
 * - `Session.startNewSession`: the new session's subjects, also at most 100.
 *
 * Downloads run only on a connection the "Network access rule" allows
 * (`OnlineStatus.canDownloadAudio`: unmetered always, metered only with ALWAYS; the default is
 * Wi-Fi only). The web build never downloads (it streams while online, owner decision).
 */
import { availableLessonIds, timeLineChartSize, upcomingReviewIds } from '../core/dashboard';
import type { LearnerDb } from '../core/progression';
import { prefBoolean, type Preferences } from '../core/settings';

export const AUTO_DOWNLOAD_AUDIO_PREF = 'auto_download_audio';
export const NETWORK_RULE_PREF = 'network_rule';
/** `AudioUtil.scheduleDownloadTasks(…, 100)`. */
export const AUDIO_SCAN_MAX = 100;
/** `DAY/2` between timeline scans. */
export const AUDIO_SCAN_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** `meta` key of `PropertiesDao.getLastAudioScanDate`. */
export const LAST_AUDIO_SCAN_META_KEY = 'lastAudioScanDate';

const HOUR = 60 * 60 * 1000;

/** `GlobalSettings.Api.getAutoDownloadAudio`. */
export function autoDownloadAudio(prefs: Preferences): boolean {
  return prefBoolean(prefs, AUTO_DOWNLOAD_AUDIO_PREF, true);
}

export type NetworkRule = 'ALWAYS' | 'DOWNLOAD_WIFI_ONLY' | 'WIFI_ONLY';

/** `GlobalSettings.Api.getNetworkRule` (default DOWNLOAD_WIFI_ONLY; an unknown value too). */
export function networkRule(prefs: Preferences): NetworkRule {
  const v = prefs[NETWORK_RULE_PREF];
  return v === 'ALWAYS' || v === 'WIFI_ONLY' ? v : 'DOWNLOAD_WIFI_ONLY';
}

/**
 * `OnlineStatus.canDownloadAudio`. `connection` is the Network Information API's `type` (the
 * Android WebView has it): 'none' is no connection, 'cellular' metered, 'wifi'/'ethernet' unmetered;
 * unknown counts as unmetered (the WebView reports a type, so this is only other browsers).
 */
export function canDownloadAudio(prefs: Preferences, connection: string | undefined, online = true): boolean {
  if (!online || connection === 'none') return false;
  if (connection === 'cellular' || connection === 'wimax') return networkRule(prefs) === 'ALWAYS';
  return true;
}

/** The scan's subjects, in Java's order: lessons, upcoming reviews, then the current level. */
export function timelineScanSubjects(db: LearnerDb, prefs: Preferences, now: number, o: { maxLevel: number; vacationMode: boolean }): number[] {
  const out: number[] = [];
  if (!o.vacationMode) {
    out.push(...availableLessonIds(db, o.maxLevel));
    out.push(...upcomingReviewIds(db, o.maxLevel, now + timeLineChartSize(prefs) * HOUR));
  }
  const level = db.progress.userLevel;
  for (const s of db.content.subjects) if (db.table.get(s.id)?.level === level) out.push(s.id);
  return out;
}

/** True when the last timeline scan was more than 12 hours ago (or never). */
export function audioScanDue(lastScan: number, now: number): boolean {
  return lastScan === 0 || now - lastScan > AUDIO_SCAN_INTERVAL_MS;
}
