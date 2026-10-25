/**
 * Persistent storage on start: ask the platform to keep our IndexedDB data (iOS and browsers may
 * otherwise evict it) and record the result in `meta` for Settings → About.
 *
 * Depends only on the small interface below, which the platform's storage API satisfies
 * (`navigator.storage.persist()`/`persisted()` on the web; always granted on Android).
 */
import type { KkDb } from './db';

export interface PersistApi {
  persist(): Promise<boolean>;
  persisted(): Promise<boolean>;
}

/** What `meta.persistence` holds. */
export interface PersistenceInfo {
  /** Whether the data is persistent now. */
  persisted: boolean;
  /** True when this check had to ask (`persist()`), false when it was already granted. */
  requested: boolean;
  /** Epoch ms of the check. */
  checkedAt: number;
  /** Set when the platform call failed (then `persisted` is false). */
  error?: string;
}

export const PERSISTENCE_META_KEY = 'persistence';

/** Checks `persisted()`, asks `persist()` if needed, and stores the result. Never throws for a platform error. */
export async function ensurePersistence(api: PersistApi, kk: KkDb, now = Date.now()): Promise<PersistenceInfo> {
  let info: PersistenceInfo;
  try {
    if (await api.persisted()) {
      info = { persisted: true, requested: false, checkedAt: now };
    } else {
      info = { persisted: await api.persist(), requested: true, checkedAt: now };
    }
  } catch (e) {
    info = { persisted: false, requested: true, checkedAt: now, error: e instanceof Error ? e.message : String(e) };
  }
  await kk.meta.put({ key: PERSISTENCE_META_KEY, value: info });
  return info;
}

/** The last recorded result, for Settings → About. */
export async function getPersistenceInfo(kk: KkDb): Promise<PersistenceInfo | undefined> {
  return (await kk.meta.get(PERSISTENCE_META_KEY))?.value as PersistenceInfo | undefined;
}
