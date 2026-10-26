/**
 * One-time move from the Java app on Android (issue #3, step 6, option B).
 *
 * The release APK installs over the Java app (same id `app.kanjikodama.wk`, same key), so Android
 * keeps the Java app's private data: the Room database `databases/wanikani`, its settings
 * (SharedPreferences) and the API token (EncryptedSharedPreferences). On the first start
 * `findLegacyData` asks `platform.legacy` (LegacyMigrationPlugin.java) for `ProgressStore.export()`
 * of the old database (read from a copy, the original is never written) and validates it with the
 * normal import (`previewImport`): the dashboard then shows the summary and asks. `moveLegacyData`
 * runs the normal restore (`app.restoreProgress`: one transaction), restores the settings like
 * "Restore your settings" (`parseSettingsBackup`, the Java backup format) and stores the API token in
 * `platform.secrets` when it could be decrypted. Removing the old data is offered afterwards and
 * only done when the learner asks (`removeLegacyData`).
 *
 * A marker in the `state` table (`legacyMigration`) stops the offer once the move is done, the old
 * data is removed or kept, or the learner said "Don't ask again". "Not now" leaves it unset.
 */
import type { PreferenceValue } from '../core/settings';
import type { LegacyApi, LegacySettings } from '../platform';
import type { KkDb } from '../storage/db';
import { KEYS, type TokenStore } from '../sync/store';
import { previewImport } from './importFile';
import { parseSettingsBackup } from './settingsBackup';

export const LEGACY_MARKER_KEY = 'legacyMigration';

export type LegacyMarker = 'moved' | 'removed' | 'kept' | 'skipped';

/** The parts of the app controller the migration uses. */
export interface LegacyHost {
  readonly db: KkDb;
  restoreProgress(text: string): Promise<string>;
  setPreference(key: string, value: PreferenceValue): Promise<void>;
  tokenStore(): TokenStore;
}

export type LegacyOffer =
  | {
    kind: 'ready';
    /** The old app's progress file text. */
    text: string;
    /** `ProgressStore.describe`: "Saved …, WaniKani order, level N, M items with progress." */
    summary: string;
    settings: LegacySettings | null;
  }
  | { kind: 'error'; message: string };

export async function legacyMarker(kk: KkDb): Promise<LegacyMarker | null> {
  const v = (await kk.state.get(LEGACY_MARKER_KEY))?.value as { status?: unknown } | undefined;
  const s = v?.status;
  return s === 'moved' || s === 'removed' || s === 'kept' || s === 'skipped' ? s : null;
}

export async function setLegacyMarker(kk: KkDb, status: LegacyMarker, now: number = Date.now()): Promise<void> {
  await kk.state.put({ key: LEGACY_MARKER_KEY, value: { status, at: now } });
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * What to offer at start-up: null when there is nothing to do (not Android, already handled, server
 * mode, no old database), otherwise the validated old progress or the reason it can't be read.
 */
export async function findLegacyData(host: LegacyHost, legacy: LegacyApi | undefined, opts: { serverMode: boolean }): Promise<LegacyOffer | null> {
  if (!legacy || opts.serverMode) return null;
  if ((await legacyMarker(host.db)) !== null) return null;
  const probe = await legacy.probe();
  if (!probe.database) return null;
  try {
    const text = await legacy.exportProgress();
    const { summary } = previewImport(text);
    let settings: LegacySettings | null = null;
    try {
      settings = await legacy.exportSettings();
    } catch {
      settings = null; // progress still moves; settings can be restored from a backup file
    }
    return { kind: 'ready', text, summary, settings };
  } catch (e) {
    return { kind: 'error', message: errorText(e) };
  }
}

export interface LegacyMoveResult {
  userLevel: string;
  /** The text for the "done" dialog. */
  message: string;
  settingsMoved: number;
  tokenMoved: boolean;
}

/** Moves progress (one transaction, as "Restore progress"), then settings and the API token. */
export async function moveLegacyData(host: LegacyHost, legacy: LegacyApi, offer: Extract<LegacyOffer, { kind: 'ready' }>, now: number = Date.now()): Promise<LegacyMoveResult> {
  // "Progress restored, level N." — throws (and changes nothing) when the restore fails.
  const restored = await host.restoreProgress(offer.text);
  const level = /level (\d+)/.exec(restored)?.[1] ?? '1';
  const lines = [`Progress moved from the old app, level ${level}.`];

  let settingsMoved = 0;
  if (offer.settings) {
    try {
      const values = parseSettingsBackup(offer.settings.text); // all or nothing, like "Restore your settings"
      for (const [key, value] of Object.entries(values)) {
        await host.setPreference(key, value);
        settingsMoved++;
      }
      lines.push('Settings moved.');
    } catch {
      lines.push('The settings could not be moved; restore a settings backup or set them again.');
    }
  }

  let tokenMoved = false;
  try {
    const token = await legacy.readToken();
    if (token !== null) {
      await host.tokenStore().set(token);
      tokenMoved = true;
    }
  } catch {
    tokenMoved = false;
  }
  const baseUrl = offer.settings?.baseUrl ?? null;
  if (baseUrl !== null && (await host.db.state.get(KEYS.baseUrl)) === undefined) {
    await host.db.state.put({ key: KEYS.baseUrl, value: baseUrl });
  }
  if (offer.settings?.serverMode) {
    lines.push(tokenMoved
      ? 'The old app used a server: connect again in Settings → Server connection (your API token was moved).'
      : 'The old app used a server: connect again in Settings → Server connection and enter your API token.');
  } else if (tokenMoved) {
    lines.push('API token moved.');
  }

  await setLegacyMarker(host.db, 'moved', now);
  return { userLevel: level, message: lines.join('\n\n'), settingsMoved, tokenMoved };
}

/** "Remove old app data": the old database and preferences. Never automatic. */
export async function removeLegacyData(host: LegacyHost, legacy: LegacyApi, now: number = Date.now()): Promise<void> {
  await legacy.removeOldData();
  await setLegacyMarker(host.db, 'removed', now);
}

export const LEGACY_TEXTS = {
  offerTitle: 'Move progress from the old app?',
  offer: (summary: string) =>
    `The progress of the previous KanjiKodama app is still on this device:\n${summary}\n\n`
    + 'Moving it replaces the progress in this app, and also moves its settings. The old data is only read, never changed.',
  moving: 'Moving progress…',
  errorTitle: 'Could not read the old app’s progress',
  error: (message: string) =>
    `${message}\n\nRestore your saved progress file instead: Settings → Progress → Restore progress from a file.`,
  removeTitle: 'Remove old app data?',
  remove: 'The old app’s database and settings are no longer needed. Removing them frees space; '
    + 'progress files you saved are not affected. This can’t be undone.',
  removing: 'Removing old app data…',
  removed: 'Old app data removed.',
} as const;
