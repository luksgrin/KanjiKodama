/**
 * Server-mode settings, flags and cursors in the Dexie `state` table (keys `mode` and `server.*`),
 * and the downloaded data written into the progress tables.
 *
 * The token is stored in `state` too until the platform has a `SecretsApi` (plan: Platform sketch);
 * `TokenStore` is the seam to move it.
 */
import {
  type CollectionName,
  type SyncCursors,
} from '../core/server';
import type { KkDb, StateRecord } from '../storage/db';

export type AppMode = 'local' | 'server';

export const KEYS = {
  mode: 'mode',
  baseUrl: 'server.baseUrl',
  token: 'server.token',
  userId: 'server.userId',
  username: 'server.username',
  maxLevelGranted: 'server.maxLevelGranted',
  maxLevelCheckedAt: 'server.maxLevelCheckedAt',
  vacation: 'server.vacation',
  rejected: 'server.apiKeyRejected',
  inError: 'server.apiInError',
  lastError: 'server.lastError',
  lastApiSuccess: 'server.lastApiSuccess',
  lastUserSync: 'server.lastUserSync',
  srsSystems: 'server.srsSystems',
  validators: 'server.validators',
} as const;

const CURSOR_PREFIX = 'server.cursor.';
/** Every `state` key server mode owns (cleared by a reset), as a prefix. */
export const SERVER_PREFIX = 'server.';

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

/** HTTP validators for a URL (conditional GETs on the native build). */
export interface Validators { etag?: string; lastModified?: string }

export class ServerStore {
  constructor(readonly kk: KkDb, readonly tokens: TokenStore = stateTokenStore(kk)) {}

  async get<T>(key: string): Promise<T | undefined> {
    return (await this.kk.state.get(key))?.value as T | undefined;
  }
  async set(key: string, value: unknown): Promise<void> {
    await this.kk.state.put({ key, value });
  }
  async putMany(values: Record<string, unknown>): Promise<void> {
    await this.kk.state.bulkPut(Object.entries(values).map(([key, value]): StateRecord => ({ key, value })));
  }
  private async num(key: string): Promise<number> {
    const v = await this.get<unknown>(key);
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }
  private async flag(key: string): Promise<boolean> {
    return (await this.get<unknown>(key)) === true;
  }

  async mode(): Promise<AppMode> {
    return (await this.get<unknown>(KEYS.mode)) === 'server' ? 'server' : 'local';
  }
  async baseUrl(): Promise<string | null> {
    const v = await this.get<unknown>(KEYS.baseUrl);
    return typeof v === 'string' && v !== '' ? v : null;
  }
  token(): Promise<string | null> {
    return this.tokens.get();
  }

  async flags() {
    const [token, rejected, inError, lastApiSuccess, lastUserSync] = await Promise.all([
      this.token(), this.flag(KEYS.rejected), this.flag(KEYS.inError), this.num(KEYS.lastApiSuccess), this.num(KEYS.lastUserSync),
    ]);
    return { hasToken: token !== null && token !== '', rejected, inError, lastApiSuccess, lastUserSync };
  }
  async setRejected(rejected: boolean): Promise<void> {
    await this.putMany({ [KEYS.rejected]: rejected, [KEYS.inError]: rejected });
  }
  async setInError(inError: boolean, message: string | null = null): Promise<void> {
    await this.putMany({ [KEYS.inError]: inError, [KEYS.lastError]: inError ? message : null });
  }
  async lastError(): Promise<string | null> {
    const v = await this.get<unknown>(KEYS.lastError);
    return typeof v === 'string' ? v : null;
  }
  async markApiSuccess(now: number): Promise<void> {
    await this.set(KEYS.lastApiSuccess, now);
  }

  async cursors(): Promise<SyncCursors> {
    const rows = await this.kk.state.where('key').startsWith(CURSOR_PREFIX).toArray();
    const out: Partial<Record<CollectionName, number>> = {};
    for (const r of rows) if (typeof r.value === 'number') out[r.key.slice(CURSOR_PREFIX.length) as CollectionName] = r.value;
    return out;
  }
  async setCursor(name: CollectionName, at: number): Promise<void> {
    await this.set(CURSOR_PREFIX + name, at);
  }

  async validators(url: string): Promise<Validators | undefined> {
    const all = (await this.get<Record<string, Validators>>(KEYS.validators)) ?? {};
    return all[url];
  }
  async setValidators(url: string, v: Validators | undefined): Promise<void> {
    const all = { ...((await this.get<Record<string, Validators>>(KEYS.validators)) ?? {}) };
    if (v === undefined || (v.etag === undefined && v.lastModified === undefined)) delete all[url];
    else all[url] = v;
    await this.set(KEYS.validators, all);
  }

  async maxLevel(): Promise<{ stored: number; checkedAt: number }> {
    return { stored: await this.num(KEYS.maxLevelGranted), checkedAt: await this.num(KEYS.maxLevelCheckedAt) };
  }

  /** Every `server.*` key except the connection (base URL, token): what "Reset database" clears. */
  async clearSyncState(): Promise<void> {
    const keep = new Set<string>([KEYS.baseUrl, KEYS.token]);
    const keys = (await this.kk.state.where('key').startsWith(SERVER_PREFIX).primaryKeys()).filter((k) => !keep.has(k));
    await this.kk.state.bulkDelete(keys);
  }
}

/** The token in `state` (`server.token`). */
export function stateTokenStore(kk: KkDb): TokenStore {
  return {
    async get() {
      const v = (await kk.state.get(KEYS.token))?.value;
      return typeof v === 'string' && v !== '' ? v : null;
    },
    async set(token) {
      if (token === null) await kk.state.delete(KEYS.token);
      else await kk.state.put({ key: KEYS.token, value: token });
    },
  };
}
