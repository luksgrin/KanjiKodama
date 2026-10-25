/**
 * `local/LocalMode`: which features belong to which mode. In server mode the server decides SRS,
 * unlocks and level-ups, so the local-only features (JLPT order, the extra kanji, fast travel, the
 * level test, restoring a progress file, the WaniKani import) are hidden; the sync actions only make
 * sense with a server. Screens ask `featureVisible(mode, feature)` instead of checking the mode.
 */

export type ModeName = 'local' | 'server';

/** `LocalMode.LOCAL_MENU_ITEMS` + `LOCAL_PREFERENCES`, and the extra kanji (`ExtraContent`). */
export const LOCAL_ONLY_FEATURES = [
  'curriculum', // progress_curriculum (JLPT order)
  'extraKanji',
  'fastTravel', // action_fast_travel, progress_fast_travel
  'levelTest', // action_level_test, progress_level_test
  'restore', // progress_restore
  'importWaniKani', // progress_import_wanikani
] as const;

/** `LocalMode.ONLINE_MENU_ITEMS` + `ONLINE_PREFERENCES` (the ones this app has). */
export const SERVER_ONLY_FEATURES = [
  'syncNow', // action_sync_now
  'flushTasks', // action_flush_tasks
  'backgroundSync', // enable_background_sync
  'syncOnOpen', // sync_on_open
  'delayResultUpload', // delay_result_upload
] as const;

export type LocalOnlyFeature = (typeof LOCAL_ONLY_FEATURES)[number];
export type ServerOnlyFeature = (typeof SERVER_ONLY_FEATURES)[number];
export type ModeFeature = LocalOnlyFeature | ServerOnlyFeature;

const LOCAL_ONLY = new Set<string>(LOCAL_ONLY_FEATURES);
const SERVER_ONLY = new Set<string>(SERVER_ONLY_FEATURES);

/** `LocalMode.applyToMenu` / `applyToPreferences` for one feature. */
export function featureVisible(mode: ModeName, feature: ModeFeature): boolean {
  if (LOCAL_ONLY.has(feature)) return mode === 'local';
  if (SERVER_ONLY.has(feature)) return mode === 'server';
  return true;
}

/** `LocalMode.applyToPreferences`: the title of the API section. */
export function apiSectionTitle(mode: ModeName): string {
  return mode === 'local' ? 'Audio download settings' : 'API and audio download settings';
}
