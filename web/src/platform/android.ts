// Android (Capacitor) implementation of the platform interface.
// Loaded only when Capacitor.isNativePlatform() is true (see ./index.ts).
import { registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { AutoBackupEntry, Capabilities, FilesApi, OpenedText, Platform, SaveResult } from './index';
import { androidAudio } from './androidAudio';
import { androidBackgroundSync } from './androidBackgroundSync';
import { androidSecrets } from './androidSecrets';
import { androidWidget } from './androidWidget';
import { androidHttp } from './httpAndroid';
import { androidHaptics, androidLifecycle, androidSystemBars } from './androidLifecycle';
import { androidNotifications } from './androidNotifications';
import { browserStorage } from './browserStorage';
import { openTextViaInput } from './web';
import { AUTO_BACKUP_DIR, AUTO_BACKUP_KEEP, autoBackupName, parseAutoBackupName, planRotation, sortBackupsNewestFirst } from '../progress/backup';

/**
 * Local native plugin in web/android (app/src/main/java/app/kanjikodama/wk/DocumentPlugin.java, registered in
 * MainActivity) wrapping the Storage Access Framework: ACTION_CREATE_DOCUMENT / ACTION_OPEN_DOCUMENT.
 * The system picker lists Drive, Downloads and other document providers, like the Java app.
 * No installed Capacitor plugin offers a create-document picker (@capacitor/filesystem writes only
 * to app/public dirs, @capacitor/share is a share sheet), hence this plugin.
 */
export interface DocumentPlugin {
  save(options: { filename: string; text: string; mimeType?: string }): Promise<{ saved: boolean; uri?: string }>;
  open(options?: { mimeTypes?: string[] }): Promise<{ text?: string; name?: string; cancelled: boolean }>;
}
export const Document = registerPlugin<DocumentPlugin>('Document');

const capabilities: Capabilities = {
  notifications: true,
  audio: true,
  audioPlayback: true,
  audioDownload: true,
  haptics: true, // navigator.vibrate in the WebView (androidLifecycle.ts)
  backgroundSync: true, // BackgroundSyncWorker (WorkManager), server mode
  widget: true, // SessionWidgetProvider
  cleartextHttp: true,
  legacyMigration: false, // step 6
  autoBackup: true,
};

/** The native Document plugin is missing (e.g. an APK built before it existed). */
function isUnimplemented(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return code === 'UNIMPLEMENTED' || (typeof message === 'string' && /not implemented/i.test(message));
}

function isShareCancel(err: unknown): boolean {
  const message = typeof err === 'object' && err !== null ? (err as { message?: unknown }).message : undefined;
  return typeof message === 'string' && /cancel/i.test(message);
}

/** Fallback when the Document plugin is missing: write to the cache dir and open the share sheet. */
async function saveViaShare(name: string, text: string): Promise<SaveResult> {
  const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: name, files: [uri], dialogTitle: name });
    return 'saved';
  } catch (err) {
    if (isShareCancel(err)) return 'cancelled';
    throw err;
  }
}

async function saveText(name: string, text: string): Promise<SaveResult> {
  try {
    const result = await Document.save({ filename: name, text, mimeType: 'application/json' });
    return result.saved ? 'saved' : 'cancelled';
  } catch (err) {
    if (isUnimplemented(err)) return saveViaShare(name, text);
    throw err;
  }
}

async function openText(): Promise<OpenedText | null> {
  try {
    const result = await Document.open({ mimeTypes: ['application/json', 'text/plain', 'application/octet-stream'] });
    if (result.cancelled || result.text === undefined) return null;
    return { name: result.name ?? '', text: result.text };
  } catch (err) {
    // Native plugin missing: fall back to <input type=file>, which Capacitor's WebChromeClient
    // routes to the system picker.
    if (isUnimplemented(err)) return openTextViaInput();
    throw err;
  }
}

/** files/backups/ (Directory.Data is Context.getFilesDir()). */
async function listAutoBackups(): Promise<AutoBackupEntry[]> {
  let listed;
  try {
    listed = await Filesystem.readdir({ path: AUTO_BACKUP_DIR, directory: Directory.Data });
  } catch {
    return []; // directory does not exist yet
  }
  const entries: AutoBackupEntry[] = [];
  for (const f of listed.files) {
    if (f.type !== 'file') continue;
    const at = parseAutoBackupName(f.name);
    if (at === null) continue; // only ever touch our own files
    entries.push({ name: f.name, at });
  }
  return sortBackupsNewestFirst(entries);
}

async function writeAutoBackup(text: string, now: Date = new Date()): Promise<AutoBackupEntry> {
  const name = autoBackupName(now);
  await Filesystem.writeFile({
    path: `${AUTO_BACKUP_DIR}/${name}`,
    data: text,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  const entry: AutoBackupEntry = { name, at: now.getTime() };
  const existing = await listAutoBackups();
  const all = existing.some((e) => e.name === name) ? existing : [...existing, entry];
  const { remove } = planRotation(all, AUTO_BACKUP_KEEP);
  for (const old of remove) {
    // A failed delete only leaves an extra file; the next rotation retries it.
    await Filesystem.deleteFile({ path: `${AUTO_BACKUP_DIR}/${old.name}`, directory: Directory.Data }).catch(() => undefined);
  }
  return entry;
}

const files: FilesApi = { saveText, openText, writeAutoBackup, listAutoBackups };

export const androidPlatform: Platform = {
  name: 'android',
  capabilities,
  notifications: androidNotifications,
  audio: androidAudio,
  haptics: androidHaptics,
  lifecycle: androidLifecycle,
  systemBars: androidSystemBars,
  files,
  storage: browserStorage,
  http: androidHttp,
  secrets: androidSecrets,
  widget: androidWidget,
  backgroundSync: androidBackgroundSync,
};
