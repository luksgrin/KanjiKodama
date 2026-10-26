import type { StorageApi } from './index';

/** navigator.storage wrappers, shared by both builds (the Android WebView keeps IndexedDB too). */
export const browserStorage: StorageApi = {
  async persist() {
    const s = globalThis.navigator?.storage;
    if (!s?.persist) return false;
    if (s.persisted && (await s.persisted())) return true;
    return s.persist();
  },
  async persisted() {
    const s = globalThis.navigator?.storage;
    if (!s?.persisted) return false;
    return s.persisted();
  },
  async estimate() {
    const s = globalThis.navigator?.storage;
    if (!s?.estimate) return null;
    const e = await s.estimate();
    if (e.usage === undefined || e.quota === undefined) return null;
    return { usage: e.usage, quota: e.quota };
  },
};
