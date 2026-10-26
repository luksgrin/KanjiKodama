// @vitest-environment jsdom
// One-time move from the Java app (src/progress/legacyMigration.ts, ui/migration/LegacyMigrationPrompt).
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import type { LegacyApi, LegacySettings, Platform } from '../../src/platform';
import { findLegacyData, legacyMarker, moveLegacyData, removeLegacyData, setLegacyMarker } from '../../src/progress/legacyMigration';
import { KEYS } from '../../src/sync/store';
import { progressFile } from '../progress-storage/helpers';
import { fakePlatform, makeApp } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const JAVA_FILE = progressFile({ userLevel: 2, subjects: [{ id: 10, srsStage: 5, unlockedAt: 1, startedAt: 2, passedAt: 3 }] });
const SETTINGS: LegacySettings = {
  text: JSON.stringify({ show_timeline: { value: 'false', type: 'Boolean' }, max_review_session_size: { value: '25', type: 'String' } }),
  skipped: 0,
  serverMode: false,
  baseUrl: null,
};

function fakeLegacy(over: Partial<LegacyApi> = {}, database = true): LegacyApi & { removeOldData: ReturnType<typeof vi.fn> } {
  return {
    probe: vi.fn(async () => ({ database, settings: true, encryptedSettings: true })),
    exportProgress: vi.fn(async () => JAVA_FILE),
    exportSettings: vi.fn(async () => SETTINGS),
    readToken: vi.fn(async () => 'token-123'),
    removeOldData: vi.fn(async () => undefined),
    ...over,
  } as LegacyApi & { removeOldData: ReturnType<typeof vi.fn> };
}

describe('legacy migration flow', () => {
  it('offers nothing without the plugin, without an old database, in server mode or once handled', async () => {
    const h = makeApp();
    await h.app.start();
    expect(await findLegacyData(h.app, undefined, { serverMode: false })).toBeNull();
    expect(await findLegacyData(h.app, fakeLegacy({}, false), { serverMode: false })).toBeNull();
    expect(await findLegacyData(h.app, fakeLegacy(), { serverMode: true })).toBeNull();
    await setLegacyMarker(h.app.db, 'kept');
    expect(await findLegacyData(h.app, fakeLegacy(), { serverMode: false })).toBeNull();
    h.app.dispose();
  });

  it('moves progress, settings and the token through the normal restore, then marks it done', async () => {
    const h = makeApp();
    await h.app.start();
    const legacy = fakeLegacy();
    const offer = await findLegacyData(h.app, legacy, { serverMode: false });
    expect(offer?.kind).toBe('ready');
    if (offer?.kind !== 'ready') throw new Error('no offer');
    expect(offer.summary).toMatch(/WaniKani order, level 2, 1 items with progress\./);

    const res = await moveLegacyData(h.app, legacy, offer);
    expect(res.message).toBe('Progress moved from the old app, level 2.\n\nSettings moved.\n\nAPI token moved.');
    expect(h.app.get().learner?.progress.userLevel).toBe(2);
    expect(h.app.get().learner?.progress.subjects.get(10)?.srsStage).toBe(5);
    expect(h.app.get().prefs.show_timeline).toBe(false);
    expect(h.app.get().prefs.max_review_session_size).toBe('25');
    expect(await h.app.tokenStore().get()).toBe('token-123');
    expect(await legacyMarker(h.app.db)).toBe('moved');
    expect(await findLegacyData(h.app, legacy, { serverMode: false })).toBeNull();
    expect(legacy.removeOldData).not.toHaveBeenCalled(); // never automatic

    await removeLegacyData(h.app, legacy);
    expect(legacy.removeOldData).toHaveBeenCalledOnce();
    expect(await legacyMarker(h.app.db)).toBe('removed');
    h.app.dispose();
  });

  it('moves the downloaded audio and says so; a failing audio move does not stop the move', async () => {
    for (const [moveAudio, line] of [
      [vi.fn(async () => ({ files: 42, bytes: 420_000 })), '\n\nDownloaded audio moved (42 files).'],
      [vi.fn(async () => { throw new Error('disk'); }), ''],
    ] as const) {
      const h = makeApp();
      await h.app.start();
      const legacy = fakeLegacy({ moveAudio });
      const offer = await findLegacyData(h.app, legacy, { serverMode: false });
      if (offer?.kind !== 'ready') throw new Error('no offer');
      const res = await moveLegacyData(h.app, legacy, offer);
      expect(moveAudio).toHaveBeenCalledOnce();
      expect(res.message).toBe(`Progress moved from the old app, level 2.\n\nSettings moved.\n\nAPI token moved.${line}`);
      expect(await legacyMarker(h.app.db)).toBe('moved');
      h.app.dispose();
    }
  }, 30_000);

  it('server mode in the old app: keeps the server address and says how to connect', async () => {
    const h = makeApp();
    await h.app.start();
    const legacy = fakeLegacy({
      readToken: vi.fn(async () => null),
      exportSettings: vi.fn(async () => ({ ...SETTINGS, serverMode: true, baseUrl: 'http://192.168.1.2:8080/api/v2/' })),
    });
    const offer = await findLegacyData(h.app, legacy, { serverMode: false });
    if (offer?.kind !== 'ready') throw new Error('no offer');
    const res = await moveLegacyData(h.app, legacy, offer);
    expect(res.tokenMoved).toBe(false);
    expect(res.message).toMatch(/connect again in Settings → Server connection and enter your API token\.$/);
    expect((await h.app.db.state.get(KEYS.baseUrl))?.value).toBe('http://192.168.1.2:8080/api/v2/');
    h.app.dispose();
  });

  it('an unreadable old database is reported, nothing changes', async () => {
    const h = makeApp();
    await h.app.start();
    const before = h.app.exportProgressFile().text;
    const offer = await findLegacyData(h.app, fakeLegacy({ exportProgress: vi.fn(async () => '{"format":"other"}') }), { serverMode: false });
    expect(offer).toEqual({ kind: 'error', message: 'This is not a KanjiKodama progress file.' });
    expect(h.app.exportProgressFile().text).toBe(before);
    expect(await legacyMarker(h.app.db)).toBeNull();
    h.app.dispose();
  }, 30_000);
});

describe('LegacyMigrationPrompt', () => {
  let root: Root | undefined;
  let container: HTMLElement | undefined;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = undefined;
  });

  async function render(legacy: LegacyApi) {
    const base = fakePlatform({}, { legacyMigration: true });
    const platform = { ...base, legacy } as Platform;
    const h = makeApp({ platform });
    await h.app.start();
    container = document.createElement('div');
    document.body.append(container);
    await act(async () => {
      root = createRoot(container!);
      root.render(<App app={h.app} location={createMemoryLocation('/')} />);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return h;
  }
  const q = (id: string) => container!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  /** Waits (in act) until `check` holds: the move runs a Dexie transaction, slower under a loaded test run. */
  const until = async (check: () => boolean, timeoutMs = 10_000) => {
    const end = Date.now() + timeoutMs;
    while (!check() && Date.now() < end) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(check()).toBe(true);
  };
  const click = async (id: string) => {
    const el = q(id);
    if (!el) throw new Error(`no ${id}`);
    await act(async () => { el.click(); await new Promise((r) => setTimeout(r, 0)); });
  };

  it('asks, moves, shows the result, then offers (and only on request does) the removal', async () => {
    const legacy = fakeLegacy();
    const h = await render(legacy);
    await until(() => q('dialog-legacy-move') !== null);
    expect(q('dialog-legacy-move')?.textContent).toContain('Move progress from the old app?');
    expect(q('dialog-legacy-move')?.textContent).toContain('level 2, 1 items with progress.');
    await click('legacy-move');
    await until(() => (q('alert-message')?.textContent ?? '').includes('Progress moved'));
    expect(q('alert-message')?.textContent).toContain('Progress moved from the old app, level 2.');
    expect(h.app.get().learner?.progress.userLevel).toBe(2);
    await act(async () => { (container!.querySelector('[data-testid="alert-message"] .kk-alert-btn') as HTMLElement).click(); });
    await until(() => q('dialog-legacy-remove') !== null);
    expect(legacy.removeOldData).not.toHaveBeenCalled();
    await click('legacy-remove');
    await until(() => (q('alert-message')?.textContent ?? '').includes('Old app data removed.'));
    expect(legacy.removeOldData).toHaveBeenCalledOnce();
    expect(q('alert-message')?.textContent).toContain('Old app data removed.');
    h.app.dispose();
  }, 30_000);

  it('"Not now" changes nothing and asks again next time', async () => {
    const legacy = fakeLegacy();
    const h = await render(legacy);
    await until(() => q('legacy-not-now') !== null);
    await click('legacy-not-now');
    await until(() => q('dialog-legacy-move') === null);
    expect(h.app.get().learner?.progress.userLevel).toBe(1);
    expect(await legacyMarker(h.app.db)).toBeNull();
    h.app.dispose();
  }, 30_000);
});
