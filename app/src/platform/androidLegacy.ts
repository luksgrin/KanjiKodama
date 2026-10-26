/**
 * The Java app's leftovers on Android (`platform.legacy`): the local `LegacyMigration` plugin
 * (app/android/.../LegacyMigrationPlugin.java). The Capacitor app installs over the Java app with the
 * same id and key, so the Java app's Room database, preferences and encrypted API token are still in
 * the app's private storage; src/progress/legacyMigration.ts moves them once.
 */
import { registerPlugin } from '@capacitor/core';
import type { LegacyApi, LegacyProbe, LegacySettings } from './index';

export interface LegacyMigrationPlugin {
  probe(): Promise<LegacyProbe>;
  exportProgress(): Promise<{ json: string; roomVersion: number }>;
  exportSettings(): Promise<{ found: boolean; text?: string; skipped?: number; serverMode?: boolean; baseUrl?: string | null }>;
  readToken(): Promise<{ token: string | null; error: string | null }>;
  removeOldData(): Promise<{ database: boolean; settings: boolean; encryptedSettings: boolean; masterKey: boolean }>;
  moveAudio(): Promise<{ files: number; bytes: number; failed: number }>;
}

export const LegacyMigration = registerPlugin<LegacyMigrationPlugin>('LegacyMigration');

export function createAndroidLegacy(plugin: LegacyMigrationPlugin = LegacyMigration): LegacyApi {
  return {
    async probe() {
      const p = await plugin.probe();
      return { database: p.database === true, settings: p.settings === true, encryptedSettings: p.encryptedSettings === true };
    },
    async exportProgress() {
      return (await plugin.exportProgress()).json;
    },
    async exportSettings(): Promise<LegacySettings | null> {
      const s = await plugin.exportSettings();
      if (!s.found || typeof s.text !== 'string') return null;
      return {
        text: s.text,
        skipped: s.skipped ?? 0,
        serverMode: s.serverMode === true,
        baseUrl: typeof s.baseUrl === 'string' && s.baseUrl !== '' ? s.baseUrl : null,
      };
    },
    async readToken() {
      const { token } = await plugin.readToken();
      return typeof token === 'string' && token !== '' ? token : null;
    },
    async removeOldData() {
      await plugin.removeOldData();
    },
    async moveAudio() {
      const r = await plugin.moveAudio();
      return { files: r.files ?? 0, bytes: r.bytes ?? 0 };
    },
  };
}

export const androidLegacy: LegacyApi = createAndroidLegacy();
