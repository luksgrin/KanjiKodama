// @vitest-environment jsdom
/**
 * Settings → "Other actions" (Data import / export, Reset database, Backup / Restore your settings)
 * and the WaniKani import's saved token, as the Java `PreferencesFragment`, `DataImportExportActivity`,
 * `BackupActivity` and `ProgressPreferences.askToken`.
 */
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import type { Capabilities, FilesApi } from '../../src/platform';
import { updateProgress } from '../../src/core/progression';
import { clearToasts } from '../../src/ui/shell/toast';
import { FakeHttp, json } from '../sync/helpers';
import { fakePlatform, makeApp } from './fixtures';

const http = new FakeHttp('fetch');
vi.mock('../../src/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/platform')>()),
  getHttp: async () => http,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const javaBackup = readFileSync(join(process.cwd(), 'test/progress-storage/fixtures/java-settings-backup.json'), 'utf8');
const ANDROID: Partial<Capabilities> = {
  notifications: true, audio: true, audioPlayback: true, audioDownload: true, haptics: true, backgroundSync: true, widget: true,
  cleartextHttp: true, autoBackup: true,
};

let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(() => {
  (globalThis as { matchMedia?: unknown }).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});

afterEach(() => {
  clearToasts();
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

async function render(path: string, opts: { caps?: Partial<Capabilities>; files?: Partial<FilesApi> } = {}) {
  const platform = fakePlatform(opts.files ?? {}, opts.caps);
  const h = makeApp({ platform });
  await h.app.start();
  container = document.createElement('div');
  document.body.append(container);
  const location = createMemoryLocation(path);
  await act(async () => {
    root = createRoot(container!);
    root.render(<App app={h.app} location={location} />);
  });
  return { ...h, location, el: container };
}

const $ = (el: HTMLElement, testId: string) => el.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const flush = () => act(async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); });
const toastText = () => document.querySelector('[data-testid="toast"]')?.textContent ?? null;

async function click(el: HTMLElement | null) {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.click(); });
  await flush();
}

async function waitFor(testId: string, el: HTMLElement): Promise<HTMLElement> {
  for (let i = 0; i < 200; i++) {
    const found = $(el, testId);
    if (found && (found.tagName !== 'DIALOG' || (found as HTMLDialogElement).open || found.hasAttribute('open'))) return found;
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
  throw new Error(`${testId} did not appear`);
}

function dialogButton(el: HTMLElement, label: string): HTMLButtonElement {
  const b = [...el.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find((x) => x.textContent === label);
  if (!b) throw new Error(`no dialog button ${label}`);
  return b;
}

const rowTitles = (el: HTMLElement) => [...$(el, 'category-about')!.querySelectorAll('.kk-pref-title')].map((t) => t.textContent);

describe('Other actions', () => {
  it("has Java's rows in Java's order, on every build", async () => {
    const web = await render('/settings');
    expect(rowTitles(web.el)).toEqual([
      'About this app', 'Data import / export', 'Reset UI confirmations and tutorials', 'Reset database',
      'Backup your settings', 'Restore your settings',
    ]);
    expect($(web.el, 'reset-database')!.textContent).toContain('Clear all data in the app');
    expect($(web.el, 'backup-settings')!.textContent).toContain('Backup your settings to a file');
    expect($(web.el, 'restore-settings')!.textContent).toContain('Restore from a backup of your settings file');
    web.app.dispose();
    act(() => root?.unmount());

    const android = await render('/settings', { caps: ANDROID });
    expect(rowTitles(android.el)).not.toContain('Known limitations');
    android.app.dispose();
  });

  it('Reset database: the Java warning, No keeps everything, Yes starts over and goes to the dashboard', async () => {
    const { el, app, location } = await render('/settings');
    await app.write((ldb, now) => updateProgress(ldb, 1, { startedAt: now, srsStage: 5, passedAt: now }));
    await app.db.meta.put({ key: 'starRatings', value: { 1: 4 } });
    await click($(el, 'reset-database'));
    const d = await waitFor('dialog-reset-database', el);
    expect(d.querySelector('h2')!.textContent).toBe('Reset database?');
    expect(d.querySelector('.kk-alert-icon')).not.toBeNull();
    expect(d.querySelector('b')!.textContent).toBe('Warning:');
    expect($(el, 'reset-database-message')!.textContent).toMatch(/clear all content from the app's database except for your settings\./);
    await click(dialogButton(el, 'No'));
    expect(app.get().learner!.progress.subjects.get(1)?.srsStage).toBe(5);

    await click($(el, 'reset-database'));
    await waitFor('dialog-reset-database', el);
    await click(dialogButton(el, 'Yes'));
    for (let i = 0; i < 50 && location.get() !== '/'; i++) await flush();
    expect(location.get()).toBe('/');
    expect(app.get().learner!.progress.subjects.get(1)?.srsStage ?? 0).toBe(0);
    expect(app.get().learner!.progress.userLevel).toBe(1);
    expect(await app.db.meta.get('starRatings')).toBeUndefined();
    app.dispose();
  });

  it('Backup your settings: asks, saves the Java file format, toasts', async () => {
    const saveText = vi.fn(async () => 'saved' as const);
    const { el, app } = await render('/settings', { files: { saveText } });
    await app.setPreference('show_legacy', true);
    await click($(el, 'backup-settings'));
    const d = await waitFor('dialog-backup-settings', el);
    expect(d.querySelector('h2')!.textContent).toBe('Backup settings?');
    expect(d.querySelector('.kk-alert-message')!.textContent).toBe('Are you sure you want to backup your settings?');
    await click(dialogButton(el, 'Yes'));
    expect(saveText).toHaveBeenCalledTimes(1);
    const [name, text] = saveText.mock.calls[0] as unknown as [string, string];
    expect(name).toMatch(/^smouldering_durtles_\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(text).show_legacy).toEqual({ value: 'true', type: 'Boolean' });
    expect(toastText()).toBe('Settings backed up successfully.');
    app.dispose();
  });

  it('Restore your settings: a backup made by the Java app restores here', async () => {
    const openText = vi.fn(async () => ({ name: 'smouldering_durtles_2026-10-26.json', text: javaBackup }));
    const { el, app } = await render('/settings', { files: { openText } });
    await click($(el, 'restore-settings'));
    const d = await waitFor('dialog-restore-settings', el);
    expect(d.querySelector('h2')!.textContent).toBe('Restore settings?');
    await click(dialogButton(el, 'Yes'));
    for (let i = 0; i < 20 && toastText() === null; i++) await flush();
    expect(toastText()).toBe('Settings restored successfully.');
    expect(app.get().prefs.show_legacy).toBe(true);
    expect(app.get().prefs.stroke_order_size).toBe(250);
    expect(app.get().prefs.max_review_session_size).toBe('100');
    app.dispose();
  });

  it('Restore your settings: a file Java cannot read changes nothing', async () => {
    const openText = vi.fn(async () => ({ name: 'x.json', text: '{"show_legacy":{"value":"true","type":"Boolean"},"x":{"value":"1","type":"HashSet"}}' }));
    const { el, app } = await render('/settings', { files: { openText } });
    await click($(el, 'restore-settings'));
    await waitFor('dialog-restore-settings', el);
    await click(dialogButton(el, 'Yes'));
    expect(app.get().prefs.show_legacy).toBeUndefined();
    expect(toastText()).toBeNull();
    app.dispose();
  });
});

describe('Data import/export', () => {
  it("is the Java screen: title, texts and four buttons; exports and imports the Java JSON", async () => {
    const saveText = vi.fn(async () => 'saved' as const);
    const openText = vi.fn(async () => ({ name: 'star_ratings.json', text: '{"stars2":[1,999],"stars5":[10]}' }));
    const { el, app } = await render('/settings', { files: { saveText, openText } });
    await click($(el, 'link-data-import-export'));
    const page = $(el, 'data-import-export')!;
    expect(document.querySelector('.kk-toolbar-title')?.textContent).toContain('Data import/export');
    expect(page.textContent).toContain('Here you can import or export some data that is not stored on the WK servers.');
    expect(page.textContent).toContain("Note that imports will add to or overwrite existing data, but won't remove existing data.");
    expect([...page.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
      'Export search presets', 'Import search presets', 'Export star ratings', 'Import star ratings',
    ]);

    await click($(el, 'import-star-ratings'));
    expect(toastText()).toBe('Import finished');
    expect((await app.db.meta.get('starRatings'))?.value).toEqual({ 1: 2, 10: 5 }); // 999: no such subject

    await click($(el, 'export-star-ratings'));
    const [name, text] = saveText.mock.calls.at(-1) as unknown as [string, string];
    expect(name).toBe('star_ratings.json');
    expect(JSON.parse(text)).toEqual({ stars1: [], stars2: [1], stars3: [], stars4: [], stars5: [10] });

    openText.mockResolvedValueOnce({ name: 'search_presets.json', text: '{"namedPresets":[{"name":"Fire","type":1,"data":"fire"}],"selfStudyPreset":null}' });
    await click($(el, 'import-search-presets'));
    expect(toastText()).toBe('Import finished');
    await click($(el, 'export-search-presets'));
    const [pname, ptext] = saveText.mock.calls.at(-1) as unknown as [string, string];
    expect(pname).toBe('search_presets.json');
    expect(JSON.parse(ptext)).toEqual({ namedPresets: [{ name: 'Fire', type: 1, data: 'fire' }], selfStudyPreset: null });

    openText.mockResolvedValueOnce({ name: 'bad.json', text: 'not json' });
    await click($(el, 'import-search-presets'));
    expect(toastText()).toBe('Import failed');
    app.dispose();
  });

  it('uses the share sheet when the platform has one (Java ACTION_SEND)', async () => {
    const shareText = vi.fn(async () => 'saved' as const);
    const saveText = vi.fn(async () => 'saved' as const);
    const { el, app } = await render('/settings?screen=data_import_export', { files: { shareText, saveText } });
    await click($(el, 'export-star-ratings'));
    expect(shareText).toHaveBeenCalledWith('star_ratings.json', expect.any(String));
    expect(saveText).not.toHaveBeenCalled();
    app.dispose();
  });
});

describe('WaniKani import token', () => {
  const WK = 'https://api.wanikani.com';

  it('shows the saved token and saves a token WaniKani accepts', async () => {
    http.on('GET', `${WK}/v2/user`, json(200, { object: 'user', data: { id: 'u', username: 'kodama', level: 2, max_level_granted_by_subscription: 60, started_at: '2020-01-01T00:00:00.000000Z', vacation_started_at: null } }));
    const { el, app } = await render('/settings');
    await app.tokenStore().set('saved token');
    await click($(el, 'link-import'));
    await waitFor('dialog-import', el);
    const field = $(el, 'import-token') as HTMLInputElement;
    expect(field.value).toBe('savedtoken'); // getApiKey() removes blanks
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, ' new-token ');
    await click($(el, 'import-next'));
    await waitFor('dialog-import-confirm', el);
    expect(await app.tokenStore().get()).toBe('new-token');
    app.dispose();
  });

  it('keeps the old token when WaniKani rejects the new one', async () => {
    http.on('GET', `${WK}/v2/user`, json(401, { error: 'Unauthorized. Nice try.', code: 401 }));
    const { el, app } = await render('/settings');
    await app.tokenStore().set('old');
    await click($(el, 'link-import'));
    await waitFor('dialog-import', el);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call($(el, 'import-token'), 'bad');
    await click($(el, 'import-next'));
    await waitFor('alert-message', el);
    expect(await app.tokenStore().get()).toBe('old');
    app.dispose();
  });
});
