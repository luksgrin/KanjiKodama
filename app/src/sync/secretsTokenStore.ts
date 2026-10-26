/**
 * The server token in the platform's `SecretsApi` (Android Keystore, web IndexedDB of its own)
 * instead of the progress database's `state` table. A token stored there by an earlier build
 * (`server.token`) is moved on first read, and every write clears the old copy.
 */
import type { SecretsApi } from '../platform';
import type { KkDb } from '../storage/db';
import { KEYS, stateTokenStore, type TokenStore } from './store';

/** The key in the secrets store. */
export const TOKEN_SECRET_KEY = 'server.token';

export function secretsTokenStore(secrets: SecretsApi, kk: KkDb): TokenStore {
  const legacy = stateTokenStore(kk);
  let migrated: Promise<void> | null = null;
  const migrate = (): Promise<void> => (migrated ??= (async () => {
    const old = await legacy.get();
    if (old === null) {
      // Also drop an empty leftover.
      if (kk.isOpen() && (await kk.state.get(KEYS.token)) !== undefined) await kk.state.delete(KEYS.token);
      return;
    }
    if ((await secrets.get(TOKEN_SECRET_KEY)) === null) await secrets.set(TOKEN_SECRET_KEY, old);
    await legacy.set(null);
  })().catch((e: unknown) => {
    migrated = null; // try again next time
    throw e;
  }));
  return {
    async get() {
      await migrate();
      const v = await secrets.get(TOKEN_SECRET_KEY);
      return v === null || v === '' ? null : v;
    },
    async set(token) {
      await migrate();
      await secrets.set(TOKEN_SECRET_KEY, token === null || token === '' ? null : token);
    },
  };
}
