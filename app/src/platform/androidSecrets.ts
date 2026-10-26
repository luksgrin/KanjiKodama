/**
 * Secrets on the Android build: the local `Secrets` plugin (app/android/.../SecretsPlugin.java):
 * AES-GCM with a key that never leaves the Android Keystore, ciphertext in the app's private
 * SharedPreferences. The background sync worker reads the server token through the same store.
 *
 * Why a local plugin: one value (the API token) and no extra native dependency. A maintained
 * alternative exists (`@aparajita/capacitor-secure-storage` 8.0.1, Capacitor 8); EncryptedSharedPreferences
 * (androidx.security-crypto) is deprecated.
 */
import { registerPlugin } from '@capacitor/core';
import type { SecretsApi } from './index';

export interface SecretsPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

export const Secrets = registerPlugin<SecretsPlugin>('Secrets');

export function createAndroidSecrets(plugin: SecretsPlugin = Secrets): SecretsApi {
  return {
    kind: 'keystore',
    async get(key) {
      const { value } = await plugin.get({ key });
      return typeof value === 'string' ? value : null;
    },
    async set(key, value) {
      if (value === null) await plugin.remove({ key });
      else await plugin.set({ key, value });
    },
  };
}

export const androidSecrets: SecretsApi = createAndroidSecrets();
