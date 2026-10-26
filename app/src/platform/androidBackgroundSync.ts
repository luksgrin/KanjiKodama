/**
 * Background sync (Android, server mode, "Allow background sync"): the local `BackgroundSync` plugin
 * (app/android/.../BackgroundSyncPlugin.java) enqueues `BackgroundSyncWorker`, a periodic WorkManager
 * job like the Java app's (1 hour, flex 5 minutes, network connected, battery not low, random first
 * delay up to an hour). The worker loads this app in a headless WebView (same origin, same
 * IndexedDB) with `?kk-background-sync`, where `src/sync/background.ts` runs the sync engine and
 * hands the widget counts back. See src/platform/README.md.
 */
import { registerPlugin } from '@capacitor/core';
import type { BackgroundSyncApi } from './index';

export interface BackgroundSyncPlugin {
  configure(options: { enabled: boolean }): Promise<{ scheduled: boolean }>;
  status(): Promise<{ scheduled: boolean; lastRunAt: number; lastResult: string | null }>;
  /** One run after `delaySeconds`, outside the period (manual trigger, smoke test). */
  runNow(options?: { delaySeconds?: number }): Promise<void>;
}

export const BackgroundSync = registerPlugin<BackgroundSyncPlugin>('BackgroundSync');

export function createAndroidBackgroundSync(plugin: BackgroundSyncPlugin = BackgroundSync): BackgroundSyncApi {
  return {
    supported: true,
    async configure(enabled) {
      // Idempotent on the native side (unique work, KEEP): safe to call on every start and resume.
      await plugin.configure({ enabled });
    },
    status: () => plugin.status(),
  };
}

export const androidBackgroundSync: BackgroundSyncApi = createAndroidBackgroundSync();
