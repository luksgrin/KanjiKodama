/**
 * Platform seam: everything that differs between the PWA (web.ts) and the Capacitor Android
 * build (android.ts) goes through this interface. The implementation is chosen at runtime.
 */
import { Capacitor } from '@capacitor/core';

export type PlatformName = 'web' | 'android';

export interface NotificationsApi {
  /** False on the web build: schedule() then rejects and the UI shows "unsupported". */
  readonly supported: boolean;
  requestPermission(): Promise<boolean>;
  schedule(at: Date, title: string, body: string): Promise<void>;
  cancelAll(): Promise<void>;
}

export interface FilesApi {
  /** Hand a text file to the user (download, share sheet or save dialog). Resolves when handed over or cancelled. */
  saveText(name: string, text: string): Promise<void>;
  /** Let the user pick a text file; null when cancelled. */
  openText(): Promise<string | null>;
}

export interface StorageApi {
  /** Ask the browser to keep our IndexedDB data (navigator.storage.persist()); true when granted. */
  persist(): Promise<boolean>;
}

export interface Platform {
  readonly name: PlatformName;
  readonly notifications: NotificationsApi;
  readonly files: FilesApi;
  readonly storage: StorageApi;
}

let cached: Promise<Platform> | undefined;

export function getPlatform(): Promise<Platform> {
  cached ??= Capacitor.isNativePlatform()
    ? import('./android').then((m) => m.androidPlatform)
    : import('./web').then((m) => m.webPlatform);
  return cached;
}
