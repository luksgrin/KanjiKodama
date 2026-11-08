import { describe, expect, it, vi } from 'vitest';
import { createAndroidUpdater, toUpdaterError, type UpdaterPlugin } from './androidUpdater';
import { UpdaterError } from './index';

function plugin(overrides: Partial<UpdaterPlugin> = {}) {
  const listeners = new Map<string, (e: unknown) => void>();
  const removed: string[] = [];
  const p = {
    info: vi.fn(async () => ({ appId: 'app.kanjikodama.wk', versionCode: 7001, versionName: '0.6.1', canInstall: true, testReleaseUrl: null })),
    download: vi.fn(async () => {
      listeners.get('downloadProgress')?.({ received: 5, total: 10 });
      return { path: '/cache/updates/update.apk', versionCode: 7002 };
    }),
    openInstallSettings: vi.fn(async () => ({ canInstall: true })),
    install: vi.fn(async () => undefined),
    cleanup: vi.fn(async () => undefined),
    addListener: vi.fn(async (event: string, cb: (e: unknown) => void) => {
      listeners.set(event, cb);
      return { remove: async () => { removed.push(event); listeners.delete(event); } };
    }),
    ...overrides,
  } as unknown as UpdaterPlugin;
  return { p, listeners, removed };
}

describe('androidUpdater', () => {
  it('passes progress events through and removes the listener after the download', async () => {
    const { p, removed } = plugin();
    const progress: [number, number][] = [];
    const res = await createAndroidUpdater(p).download('https://x.test/a.apk', 'a'.repeat(64), (r, t) => progress.push([r, t]));
    expect(res).toEqual({ path: '/cache/updates/update.apk', versionCode: 7002 });
    expect(p.download).toHaveBeenCalledWith({ url: 'https://x.test/a.apk', sha256: 'a'.repeat(64) });
    expect(progress).toEqual([[5, 10]]);
    expect(removed).toEqual(['downloadProgress']);
  });

  it('turns the plugin\'s rejections into UpdaterErrors with our codes', async () => {
    const { p } = plugin({ download: vi.fn(async () => { throw Object.assign(new Error('bad sum'), { code: 'CHECKSUM' }); }) });
    const err = await createAndroidUpdater(p).download('u', 'a'.repeat(64)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpdaterError);
    expect(err).toMatchObject({ code: 'CHECKSUM', message: 'bad sum' });
    expect(toUpdaterError({ code: 'WHATEVER', message: 'x' })).toMatchObject({ code: 'UNKNOWN', message: 'x' });
    expect(toUpdaterError('plain')).toMatchObject({ code: 'UNKNOWN', message: 'plain' });
  });

  it('delivers install statuses until unsubscribed', async () => {
    const { p, listeners } = plugin();
    const u = createAndroidUpdater(p);
    const seen: unknown[] = [];
    const off = u.onInstallStatus((s) => seen.push(s));
    await Promise.resolve();
    listeners.get('installStatus')?.({ status: 'confirming' });
    off();
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([{ status: 'confirming' }]);
    expect(listeners.has('installStatus')).toBe(false);
    expect(await u.openInstallSettings()).toBe(true);
  });
});
