/**
 * Backup policy (pure where possible, platform passed in):
 * - Android: after each session, write the progress export as an auto backup in files/backups/
 *   with a timestamped name, keeping the newest AUTO_BACKUP_KEEP (5).
 * - PWA (no auto backup): a "last saved N days ago" reminder from the stored lastSavedAt,
 *   due after BACKUP_REMINDER_DAYS (7) days, or immediately when there is progress but no save yet.
 *   7 days: iOS may evict a site's storage after ~7 days without use, and a week of reviews is the
 *   most we are willing to lose.
 *
 * The export text and the lastSavedAt storage come from the caller (progress/exportFile.ts and the
 * Dexie `meta` table), so this module does not depend on them.
 */
import type { AutoBackupEntry, FilesApi, SaveResult } from '../platform';

export const AUTO_BACKUP_KEEP = 5;
export const AUTO_BACKUP_DIR = 'backups';
export const BACKUP_REMINDER_DAYS = 7;
const DAY_MS = 86_400_000;

const PREFIX = 'kanjikodama-autobackup-';
const SUFFIX = '.json';

/** e.g. kanjikodama-autobackup-2026-10-25T09-05-03-120Z.json (UTC, sorts by time, no ':' for file systems). */
export function autoBackupName(at: Date): string {
  return PREFIX + at.toISOString().replace(/[:.]/g, '-') + SUFFIX;
}

/** Inverse of autoBackupName; null for any other file name. */
export function parseAutoBackupName(name: string): number | null {
  const m = /^kanjikodama-autobackup-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/.exec(name);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Newest first; ties broken by name (descending) so the order is deterministic. */
export function sortBackupsNewestFirst(entries: readonly AutoBackupEntry[]): AutoBackupEntry[] {
  return [...entries].sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
}

/** Which backups to keep (newest `keep`, newest first) and which to delete. */
export function planRotation(
  entries: readonly AutoBackupEntry[],
  keep = AUTO_BACKUP_KEEP,
): { keep: AutoBackupEntry[]; remove: AutoBackupEntry[] } {
  const sorted = sortBackupsNewestFirst(entries);
  const n = Math.max(0, keep);
  return { keep: sorted.slice(0, n), remove: sorted.slice(n) };
}

/**
 * Call after each finished session. Writes the auto backup where the platform supports it
 * (Android); returns null on the PWA without calling `exportText`.
 */
export async function runAutoBackup(
  files: FilesApi,
  exportText: () => Promise<string>,
  now: Date = new Date(),
): Promise<AutoBackupEntry | null> {
  if (!files.writeAutoBackup) return null;
  const text = await exportText();
  return files.writeAutoBackup(text, now);
}

export type BackupReminderState = 'none' | 'never' | 'ok' | 'due';

export interface BackupReminder {
  /** none: no progress to lose; never: progress but never saved; ok: saved recently; due: saved too long ago. */
  state: BackupReminderState;
  /** Whole days since the last save (0 = today or clock skew); null when never saved. */
  daysAgo: number | null;
  /** True when the UI should show the reminder (never / due). */
  show: boolean;
}

export function backupReminder(
  lastSavedAt: number | null | undefined,
  now: number,
  opts: { hasProgress?: boolean; thresholdDays?: number } = {},
): BackupReminder {
  const { hasProgress = true, thresholdDays = BACKUP_REMINDER_DAYS } = opts;
  const daysAgo = lastSavedAt == null ? null : Math.max(0, Math.floor((now - lastSavedAt) / DAY_MS));
  if (!hasProgress) return { state: 'none', daysAgo, show: false };
  if (daysAgo === null) return { state: 'never', daysAgo, show: true };
  if (daysAgo >= thresholdDays) return { state: 'due', daysAgo, show: true };
  return { state: 'ok', daysAgo, show: false };
}

/** Where lastSavedAt lives (the Dexie `meta` table in practice). */
export interface LastSavedStore {
  getLastSavedAt(): Promise<number | null>;
  setLastSavedAt(at: number): Promise<void>;
}

/**
 * Manual save through the platform picker/share sheet; records lastSavedAt only when the file was
 * actually handed over ('saved'), not on cancel. Errors propagate and leave lastSavedAt untouched.
 */
export async function saveProgressFile(
  files: FilesApi,
  store: LastSavedStore,
  name: string,
  text: string,
  now: () => number = Date.now,
): Promise<SaveResult> {
  const result = await files.saveText(name, text);
  if (result === 'saved') await store.setLastSavedAt(now());
  return result;
}
