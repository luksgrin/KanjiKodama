/**
 * Platform seam: everything that differs between the PWA (web.ts) and the Capacitor Android
 * build (android.ts) goes through this interface. The implementation is chosen at runtime.
 * See ./README.md for what each build does and its limitations.
 */
import { Capacitor } from '@capacitor/core';

export type PlatformName = 'web' | 'android';

/** Drives what the UI shows; screens check these instead of `name === 'android'`. */
export interface Capabilities {
  notifications: boolean;
  audio: boolean;
  haptics: boolean;
  backgroundSync: boolean;
  widget: boolean;
  cleartextHttp: boolean;
  legacyMigration: boolean;
  /** Rolling automatic progress backup after each session (Android). False: show the "last saved" reminder. */
  autoBackup: boolean;
}

export interface NotificationsApi {
  /** False on the web build: schedule() then rejects and the UI shows "unsupported". */
  readonly supported: boolean;
  requestPermission(): Promise<boolean>;
  // Spike API; step 5 replaces it with permission() + scheduleReviews(times).
  schedule(at: Date, title: string, body: string): Promise<void>;
  cancelAll(): Promise<void>;
}

export type SaveResult = 'saved' | 'cancelled';

export interface OpenedText {
  /** File name as reported by the picker ('' when unknown). */
  name: string;
  text: string;
}

export interface AutoBackupEntry {
  name: string;
  /** Backup time in ms since the epoch (from the file name, else the file's mtime). */
  at: number;
}

export interface FilesApi {
  /**
   * Hand a text file to the user. Android: system create-document picker (Drive offered);
   * web: share sheet with a file where supported, else a download. Resolves 'cancelled' when the
   * user dismissed the picker/sheet; write errors reject. A download always reports 'saved'
   * (browsers give no signal whether the user kept it).
   */
  saveText(name: string, text: string): Promise<SaveResult>;
  /** Let the user pick a text file; null when cancelled. */
  openText(): Promise<OpenedText | null>;
  /** Android only: write `text` to files/backups/ with a timestamped name and keep the newest 5. */
  writeAutoBackup?(text: string, now?: Date): Promise<AutoBackupEntry>;
  /** Android only: the auto backups, newest first. */
  listAutoBackups?(): Promise<AutoBackupEntry[]>;
}

export interface StorageApi {
  /** Ask the browser to keep our IndexedDB data (navigator.storage.persist()); true when granted. */
  persist(): Promise<boolean>;
  /** Whether persistence is already granted (navigator.storage.persisted()). */
  persisted(): Promise<boolean>;
  /** Origin storage usage and quota in bytes; null when the browser can't tell. */
  estimate(): Promise<{ usage: number; quota: number } | null>;
}

export interface Platform {
  readonly name: PlatformName;
  readonly capabilities: Capabilities;
  readonly storage: StorageApi;
  readonly notifications: NotificationsApi;
  readonly files: FilesApi;
}

let cached: Promise<Platform> | undefined;

export function getPlatform(): Promise<Platform> {
  cached ??= Capacitor.isNativePlatform()
    ? import('./android').then((m) => m.androidPlatform)
    : import('./web').then((m) => m.webPlatform);
  return cached;
}
