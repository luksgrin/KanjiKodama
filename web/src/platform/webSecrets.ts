/**
 * Secrets on the web build: a small IndexedDB database of its own (`kanjikodama-secrets`), apart from
 * the progress database so a progress file, backup or reset never carries the token.
 *
 * Limitation (PWA): browsers have no secure store for a page. The token is origin-scoped and not
 * readable by other sites, but it is not encrypted at rest: anyone with access to the unlocked
 * device's browser profile can read it, as with any web app's login.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { SecretsApi } from './index';

interface SecretRow { key: string; value: string }

class SecretsDb extends Dexie {
  secrets!: EntityTable<SecretRow, 'key'>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ secrets: 'key' });
  }
}

export const WEB_SECRETS_DB = 'kanjikodama-secrets';

export function createWebSecrets(name: string = WEB_SECRETS_DB): SecretsApi {
  let db: SecretsDb | null = null;
  const open = (): SecretsDb => (db ??= new SecretsDb(name));
  return {
    kind: 'indexeddb',
    async get(key) {
      return (await open().secrets.get(key))?.value ?? null;
    },
    async set(key, value) {
      if (value === null) await open().secrets.delete(key);
      else await open().secrets.put({ key, value });
    },
  };
}

export const webSecrets: SecretsApi = createWebSecrets();
