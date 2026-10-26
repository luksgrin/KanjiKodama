// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import { ankiMode } from '../../src/core/anki/mode';
import { makeContent, type Content } from '../../src/core/content';
import { lessonOrder, maxSessionSize } from '../../src/core/settings';
import type { Capabilities } from '../../src/platform';
import { ADVANCED_GROUPS, SETTINGS_SCREENS, storedKeys } from '../../src/ui/screens/settings/schema';
import type { FilesApi } from '../../src/platform';
import { clearToasts } from '../../src/ui/shell/toast';
import { smallContent, smallSubjects, subject } from '../progress-storage/helpers';
import { updateProgress } from '../../src/core/progression';
import { KkDb } from '../../src/storage/db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeHttp, json } from '../sync/helpers';
import { fakePlatform, loaded, makeApp } from './fixtures';

const http = new FakeHttp('fetch');
// jsdom's import.meta.url is not a file URL: read the sync fixtures from the working directory (web/).
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(process.cwd(), 'test/sync/fixtures', `${name}.json`), 'utf8'));
vi.mock('../../src/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/platform')>()),
  getHttp: async () => http,
}));

// The real limiter spaces calls 1.1 s apart: give the client one whose clock jumps instead of sleeping.
vi.mock('../../src/sync/client', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../src/sync/client')>();
  let t = 0;
  const clock = { now: () => t, sleep: async (ms: number) => { t += ms; } };
  class FastApiClient extends m.ApiClient {
    constructor(o: ConstructorParameters<typeof m.ApiClient>[0]) {
      super({ ...o, clock, limiter: new m.RateLimiter(clock) });
    }
  }
  return { ...m, ApiClient: FastApiClient };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(() => {
  // jsdom has no <dialog> methods: ConfirmDialog falls back to the open attribute.
  (globalThis as { matchMedia?: unknown }).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});

afterEach(() => {
  clearToasts();
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

/** 60 N5 kanji and 60 N4 kanji on WaniKani levels 1–4, so JLPT order has several levels. */
function jlptContent(): { content: Content; jlpt: Map<string, number> } {
  const subjects = [subject(1, 'radical', 1)];
  const jlpt = new Map<string, number>();
  for (let i = 0; i < 120; i++) {
    const ch = String.fromCharCode(0x4e00 + i);
    subjects.push(subject(1000 + i, 'kanji', 1 + Math.floor(i / 30), [1], ch));
    jlpt.set(ch, i < 60 ? 5 : 4);
  }
  return { content: makeContent(subjects, []), jlpt };
}

async function render(path: string, opts: { caps?: Partial<Capabilities>; jlpt?: boolean; dbName?: string; content?: Content; files?: Partial<FilesApi> } = {}) {
  const platform = fakePlatform(opts.files ?? {}, opts.caps);
  const j = opts.jlpt ? jlptContent() : null;
  const h = makeApp({
    platform,
    ...(opts.dbName ? { dbName: opts.dbName } : {}),
    ...(opts.content ? { content: opts.content } : {}),
    ...(j ? { content: j.content, loadContent: async () => ({ ...loaded(j.content), jlptKanji: j.jlpt }) } : {}),
  });
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
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });
const openDialog = (el: HTMLElement) => el.querySelector<HTMLDialogElement>('dialog[open]');

function setValue(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function waitFor(testId: string, el: HTMLElement): Promise<HTMLElement> {
  for (let i = 0; i < 200; i++) {
    const found = $(el, testId);
    if (found && (found.tagName !== 'DIALOG' || (found as HTMLDialogElement).open || found.hasAttribute('open'))) return found;
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
  throw new Error(`${testId} did not appear`);
}

async function click(el: HTMLElement | null) {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.click(); });
  await flush();
}

function dialogButton(el: HTMLElement, label: string): HTMLButtonElement {
  const b = [...el.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find((x) => x.textContent === label);
  if (!b) throw new Error(`no dialog button ${label} in ${openDialog(el)?.textContent ?? '(no dialog)'}`);
  return b;
}

/** The open dialog's message once the busy dialog is gone. */
async function message(el: HTMLElement): Promise<string> {
  const d = await waitFor('alert-message', el);
  return d.querySelector('.kk-alert-message')!.textContent!;
}

const checked = (el: HTMLElement, key: string) => $(el, `setting-${key}`)!.getAttribute('aria-checked');

describe('settings schema', () => {
  it('has the 58 advanced keys (18 as min/max ranges) and no duplicate keys', () => {
    const advanced = ADVANCED_GROUPS.flatMap((g) => g.rows).filter((r) => r.type !== 'info');
    expect(advanced).toHaveLength(58);
    expect(advanced.filter((r) => r.type === 'range')).toHaveLength(18);
    expect(new Set(storedKeys(ADVANCED_GROUPS)).size).toBe(76);
    const main = SETTINGS_SCREENS.flatMap((g) => g.rows).filter((r) => r.type !== 'info').map((r) => r.key);
    expect(new Set(main).size).toBe(main.length);
  });

  it('has the dashboard settings the dashboard reads, with the Java keys and defaults', () => {
    const rows = new Map(SETTINGS_SCREENS.flatMap((g) => g.rows).filter((r) => r.type !== 'info' && r.type !== 'action').map((r) => [r.key, r]));
    for (const k of ['show_recent_unlocks', 'show_critical_condition', 'show_burned_items']) expect(rows.get(k)).toMatchObject({ type: 'bool', default: true });
    for (const k of ['show_jlpt_progress', 'show_joyo_progress', 'show_lesson_review_breakdown', 'show_waterfall_line']) expect(rows.get(k)).toMatchObject({ type: 'bool', default: false });
    expect(rows.get('timeline_chart_style')).toMatchObject({ type: 'list', default: 'SRS_STAGE' });
    expect(rows.get('timeline_chart_grid_style')).toMatchObject({ type: 'list', default: 'FOR_BARS' });
    expect(rows.get('timeline_chart_size_shown')).toMatchObject({ type: 'list', default: '24' });
    expect(rows.get('font_size_live_subject_table')).toMatchObject({ type: 'slider', default: 16, min: 10, max: 32 });
  });

  it('lists the sub-screens in preferences.xml order', () => {
    const xml = readFileSync(join(process.cwd(), '../durtles/app/src/main/res/xml/preferences.xml'), 'utf8');
    const javaOrder = [...xml.matchAll(/<PreferenceScreen\s+app:key="(\w+)"/g)].map((m) => m[1]!);
    const ours = [...SETTINGS_SCREENS, ...ADVANCED_GROUPS].map((g) => g.id);
    expect(javaOrder.filter((k) => ours.includes(k))).toEqual(ours);
  });
});

describe('settings screen', () => {
  it('shows the Java root: sub-screens, then Advanced settings, Progress and Other actions', async () => {
    const { el, app } = await render('/settings', { caps: { audioPlayback: true } });
    const rows = [...$(el, 'settings-root')!.querySelectorAll(':scope > li > .kk-pref .kk-pref-title')].map((t) => t.textContent);
    // The web build has nothing to download: no "Audio download settings".
    expect(rows).toEqual(['Display settings', 'Dashboard settings', 'Subject Info settings', 'Audio settings', 'Lesson/review settings', 'Keyboard input settings', 'Font settings', 'Notifications and other settings']);
    expect([...el.querySelectorAll('.kk-pref-category-title')].map((t) => t.textContent)).toEqual(['Advanced settings', 'Progress', 'Other actions']);
    expect($(el, 'category-progress')!.textContent).toContain('Save progress to a file');
    expect($(el, 'link-server')!.textContent).toContain('Local (offline). Tap to connect to a WaniKani-compatible server such as OpenKani.');
    expect($(el, 'link-curriculum')!.textContent).toContain('WaniKani order. Tap to switch; progress on every item is kept.');
    // No native selects or text fields on the settings pages.
    expect(el.querySelector('select')).toBeNull();
    app.dispose();
  });

  it('changes basic settings through the Java dialogs, with the Java keys and types', async () => {
    const { el, app, location } = await render('/settings');
    await click($(el, 'screen-review_settings'));
    expect(location.get()).toBe('/settings?screen=review_settings');
    expect($(el, 'settings-screen-review_settings')).not.toBeNull();

    // EditTextPreference: the value as summary, a dialog with the field, Cancel / OK.
    expect($(el, 'setting-max_lesson_session_size')!.textContent).toContain('5');
    await click($(el, 'setting-max_lesson_session_size'));
    const field = openDialog(el)!.querySelector('input')!;
    expect(field.value).toBe('5');
    await act(async () => setValue(field, '12'));
    await click(dialogButton(el, 'OK'));
    expect(app.get().prefs.max_lesson_session_size).toBe('12');
    expect(maxSessionSize(app.get().prefs, 'LESSON')).toBe(12);
    expect(openDialog(el)).toBeNull();

    // Switch: the whole row toggles.
    expect(checked(el, 'enable_lightning_mode')).toBe('true');
    await click($(el, 'setting-enable_lightning_mode'));
    expect(app.get().prefs.enable_lightning_mode).toBe(false);
    expect(checked(el, 'enable_lightning_mode')).toBe('false');

    // ListPreference: radio dialog, closes on a pick.
    expect($(el, 'setting-close_enough_action')!.textContent).toContain('Accept silently');
    await click($(el, 'setting-close_enough_action'));
    const d = openDialog(el)!;
    expect(d.querySelector('h2')!.textContent).toBe('Action for "close enough" answer');
    expect(d.querySelector('[role="radio"][aria-checked="true"]')!.textContent).toBe('Accept silently');
    expect(d.querySelectorAll('[role="radio"]')).toHaveLength(5);
    await click($(el, 'choice-close_enough_action-REJECT'));
    expect(app.get().prefs.close_enough_action).toBe('REJECT');
    expect(openDialog(el)).toBeNull();
    expect($(el, 'setting-close_enough_action')!.textContent).toContain('Reject');
    // Cancel changes nothing.
    await click($(el, 'setting-close_enough_action'));
    await click(dialogButton(el, 'Cancel'));
    expect(app.get().prefs.close_enough_action).toBe('REJECT');

    // hide_sentence_translations: the XML default (true) is written when settings show it, like AndroidX.
    expect(app.get().prefs.hide_sentence_translations).toBe(true);
    app.dispose();
  });

  it('EditLimitedIntPreference: disabled until its dependency is on, rejects out-of-range values with the Java toast', async () => {
    const { el, app } = await render('/settings?screen=dashboard_settings');
    const amount = $(el, 'setting-previous_level_progression_limit_amount') as HTMLButtonElement;
    expect(amount.disabled).toBe(true);
    await click($(el, 'setting-previous_level_progression_limit'));
    expect(amount.disabled).toBe(false);
    await click(amount);
    await act(async () => setValue(openDialog(el)!.querySelector('input')!, '99'));
    await click(dialogButton(el, 'OK'));
    expect(document.querySelector('[data-testid="toast"]')?.textContent).toBe('Please use a number between 0 and 60');
    expect(app.get().prefs.previous_level_progression_limit_amount).toBeUndefined();
    app.dispose();
  });

  it('SeekBarPreference stores an int; the theme is a radio list', async () => {
    const { el, app } = await render('/settings?screen=subject_info_settings');
    const bar = $(el, 'setting-stroke_order_size')!.querySelector('input')!;
    expect(bar.type).toBe('range');
    await act(async () => { setValue(bar, '300'); bar.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    await flush();
    expect(app.get().prefs.stroke_order_size).toBe(300);
    act(() => root?.unmount());
    app.dispose();

    const r2 = await render('/settings?screen=display_settings');
    expect($(r2.el, 'setting-theme')!.textContent).toContain('KanjiKodama theme is currently selected');
    await click($(r2.el, 'setting-theme'));
    await click($(r2.el, 'choice-theme-LIGHT'));
    expect(r2.app.get().prefs.theme).toBe('LIGHT');
    await flush();
    expect(document.documentElement.dataset.kkTheme).toBe('LIGHT');
    expect(document.documentElement.style.getPropertyValue('--color-toolbar-bg')).toBe('#E80092');
    await click($(r2.el, 'setting-theme'));
    await click($(r2.el, 'choice-theme-KANJIKODAMA_LIGHT'));
    await flush();
    expect(document.documentElement.dataset.kkTheme).toBe('KANJIKODAMA_LIGHT');
    expect(document.documentElement.style.getPropertyValue('--color-toolbar-bg')).toBe('');
    r2.app.dispose();
  });

  it('gates the advanced sub-screens behind enable_advanced, with the Java warning', async () => {
    const { el, app, location } = await render('/settings');
    expect($(el, 'screen-advanced_lesson_settings')).toBeNull();
    // A deep link while off shows the root.
    await act(async () => location.navigate('/settings?screen=advanced_lesson_settings'));
    expect($(el, 'settings-root')).not.toBeNull();
    await act(async () => location.navigate('/settings'));

    // Turning it on asks first; "No" keeps it off.
    expect(checked(el, 'enable_advanced')).toBe('false');
    await click($(el, 'setting-enable_advanced'));
    expect(openDialog(el)!.textContent).toContain('Enable advanced settings?');
    expect(openDialog(el)!.textContent).toContain('Are you sure you want to enable these settings?');
    await click(dialogButton(el, 'No'));
    expect(app.get().prefs.enable_advanced).toBe(false);
    expect($(el, 'screen-advanced_lesson_settings')).toBeNull();

    await click($(el, 'setting-enable_advanced'));
    await click(dialogButton(el, 'Yes'));
    expect(app.get().prefs.enable_advanced).toBe(true);
    for (const id of ['advanced_lesson_settings', 'advanced_review_settings', 'advanced_self_study_settings', 'advanced_other_settings']) {
      expect($(el, `screen-${id}`)).not.toBeNull();
    }

    await click($(el, 'screen-advanced_lesson_settings'));
    await click($(el, 'setting-lesson_order'));
    await click($(el, 'choice-lesson_order-TYPE_THEN_LEVEL'));
    expect(app.get().prefs.lesson_order).toBe('TYPE_THEN_LEVEL');
    expect(lessonOrder(app.get().prefs)).toBe('TYPE_THEN_LEVEL');

    // NumberRangePreference: the Min / Max dialog stores <key>_min / <key>_max ints.
    expect($(el, 'setting-lesson_subjects_kanji')!.textContent).toContain('Unlimited');
    await click($(el, 'setting-lesson_subjects_kanji'));
    expect(openDialog(el)!.textContent).toContain('Choose a minimum and maximum value for this category.');
    const [min] = [...openDialog(el)!.querySelectorAll('input')];
    await act(async () => setValue(min!, '3'));
    await click(dialogButton(el, 'OK'));
    expect(app.get().prefs.lesson_subjects_kanji_min).toBe(3);
    expect(app.get().prefs.lesson_subjects_kanji_max).toBeUndefined();
    expect($(el, 'setting-lesson_subjects_kanji')!.textContent).toContain('Min 3');

    await click($(el, 'setting-anki_mode_lesson_meaning'));
    expect(ankiMode(app.get().prefs, 'LESSON', 'WANIKANI_RADICAL_NAME')).toBe(true);

    // Off again: the stored values stay, the getters use the defaults.
    await act(async () => location.navigate('/settings'));
    await click($(el, 'setting-enable_advanced'));
    expect(app.get().prefs.enable_advanced).toBe(false);
    expect(app.get().prefs.lesson_order).toBe('TYPE_THEN_LEVEL');
    expect(lessonOrder(app.get().prefs)).toBe('LEVEL_THEN_TYPE');
    expect($(el, 'screen-advanced_lesson_settings')).toBeNull();
    app.dispose();
  });

  it('shows platform rows by capability', async () => {
    const web = await render('/settings?screen=audio_settings', { caps: { audioPlayback: true } });
    expect($(web.el, 'setting-voice_preference')).not.toBeNull();
    web.app.dispose();
    act(() => root?.unmount());
    const web2 = await render('/settings?screen=other_settings', { caps: { audioPlayback: true } });
    expect($(web2.el, 'setting-enable_notifications')).toBeNull();
    expect($(web2.el, 'setting-enable_star_ratings')).not.toBeNull();
    web2.app.dispose();
    act(() => root?.unmount());

    const caps = { audio: true, audioPlayback: true, audioDownload: true, notifications: true, haptics: true, autoBackup: true };
    const android = await render('/settings', { caps });
    expect($(android.el, 'screen-api_settings')!.textContent).toBe('Audio download settings');
    expect($(android.el, 'install-hint')).toBeNull();
    await click($(android.el, 'screen-api_settings'));
    expect($(android.el, 'setting-auto_download_audio')).not.toBeNull();
    expect($(android.el, 'setting-sync_on_open')).toBeNull();
    await act(async () => android.location.navigate('/settings?screen=other_settings'));
    expect($(android.el, 'setting-enable_notifications')).not.toBeNull();
    await act(async () => android.location.navigate('/settings?screen=review_settings'));
    expect($(android.el, 'setting-enable_haptic_feedback_success')).not.toBeNull();
    expect($(android.el, 'setting-delay_result_upload')).toBeNull();
    android.app.dispose();
  });

  it('resets UI confirmations and tutorials after the Java question', async () => {
    const { el, app } = await render('/settings');
    await app.setPreference('ui_confirm_abandon_session', false);
    await app.setPreference('start_self_study_dismissed', true);
    await click($(el, 'reset-tutorials'));
    expect(openDialog(el)!.textContent).toContain('This will re-enable all UI confirmations and reinstate all tutorial messages.');
    await click(dialogButton(el, 'Yes'));
    expect(app.get().prefs.ui_confirm_abandon_session).toBe(true);
    expect(app.get().prefs.start_self_study_dismissed).toBe(false);
    expect(document.querySelector('[data-testid="toast"]')?.textContent).toBe('Confirmations and tutorials reset');
    app.dispose();
  });
});

describe('progress: save and restore', () => {
  it('saves, then restores a file after "Override local progress?"', async () => {
    const seed = makeApp();
    await seed.app.start();
    const file = seed.app.exportProgressFile();
    seed.app.dispose();
    const saveText = vi.fn(async () => 'saved' as const);
    const openText = vi.fn(async () => ({ name: file.name, text: file.text }));
    const { el, app } = await render('/settings', { files: { saveText, openText } });
    expect($(el, 'progress-save')!.textContent).toContain('Save a copy of your progress');
    await click($(el, 'progress-save'));
    expect(saveText).toHaveBeenCalled();
    expect(await message(el)).toBe('Progress saved.');
    await click(dialogButton(el, 'OK'));

    await click($(el, 'progress-restore'));
    const d = await waitFor('dialog-restore', el);
    expect(d.querySelector('h2')!.textContent).toBe('Override local progress?');
    expect(d.textContent).toMatch(/^Override local progress\?Saved .+, WaniKani order, level 1, \d+ items with progress\.\s+This replaces ALL progress in KanjiKodama/);
    await click(dialogButton(el, 'Restore and override'));
    expect(await message(el)).toBe('Progress restored, level 1.');
    app.dispose();
  });

  it('shows "Something went wrong" for a file that is not a progress file', async () => {
    const openText = vi.fn(async () => ({ name: 'x.json', text: '{"hello":1}' }));
    const { el, app } = await render('/settings', { files: { openText } });
    await click($(el, 'progress-restore'));
    const d = await waitFor('alert-message', el);
    expect(d.querySelector('h2')!.textContent).toBe('Something went wrong');
    expect($(el, 'dialog-restore')?.hasAttribute('open') ?? false).toBe(false);
    app.dispose();
  });
});

describe('curriculum and fast travel', () => {
  it('switches to JLPT order through the Java dialogs, then fast travels', async () => {
    const { el, app } = await render('/settings', { jlpt: true });
    await click($(el, 'link-curriculum'));
    const choose = await waitFor('dialog-curriculum', el);
    expect(choose.querySelector('h2')!.textContent).toBe('Curriculum order');
    expect($(el, 'curriculum-WANIKANI')!.getAttribute('aria-checked')).toBe('true');
    expect($(el, 'curriculum-JLPT')!.textContent).toBe('JLPT order: N5, N4, N3, N2, N1, then Obscure (kanji on no JLPT list). Allows fast travel.');
    await click($(el, 'curriculum-JLPT'));
    const confirm = await waitFor('dialog-curriculum-confirm', el);
    expect(confirm.querySelector('h2')!.textContent).toBe('Switch to JLPT order?');
    expect(confirm.querySelector('.kk-alert-message')!.textContent).toMatch(/^You would be placed on level 1 \(N5.*\): the first level where you have mastered less than 60% of the kanji\./);
    // Cancel changes nothing.
    await click(dialogButton(el, 'Cancel'));
    expect(app.get().learner!.progress.curriculum).toBe('WANIKANI');
    expect(openDialog(el)).toBeNull();

    await click($(el, 'link-curriculum'));
    await click($(el, 'curriculum-JLPT'));
    await waitFor('dialog-curriculum-confirm', el);
    await click(dialogButton(el, 'Switch'));
    expect(await message(el)).toMatch(/^You are now in JLPT order, on level 1 \(N5.*\)\.$/);
    expect(app.get().learner!.progress.curriculum).toBe('JLPT');
    await click(dialogButton(el, 'OK'));
    expect($(el, 'link-curriculum')!.textContent).toContain('JLPT order. Tap to switch');

    await click($(el, 'link-fast-travel'));
    const list = await waitFor('dialog-fast-travel', el);
    expect(list.querySelector('h2')!.textContent).toMatch(/^Fast travel from level 1/);
    const option = $(el, 'fast-travel-2')!;
    expect(option.textContent).toMatch(/^Level 2( \(.+\))?: \d+ to prove, about \d+ min a day$/);
    await click(option);
    expect((await waitFor('dialog-fast-travel-confirm', el)).querySelector('h2')!.textContent).toBe('Travel to level 2?');
    await click(dialogButton(el, 'Travel'));
    expect(await message(el)).toMatch(/^Welcome to level 2.*\. \d+ probation items are waiting in your reviews\.$/);
    expect(app.get().learner!.progress.userLevel).toBe(2);
    await click(dialogButton(el, 'OK'));
    // Probation pending: blocked now.
    await click($(el, 'link-fast-travel'));
    expect(await message(el)).toMatch(/remaining probation reviews/);
    expect(openDialog(el)!.querySelector('h2')!.textContent).toBe('Fast travel');
    app.dispose();
  });

  it('the menu route shows the blocked message in WaniKani order, then goes back', async () => {
    const { el, app, location } = await render('/settings?screen=display_settings');
    await act(async () => location.navigate('/settings/fast-travel'));
    await flush();
    expect(await message(el)).toBe('Fast travel is only available in JLPT order. Switch in Settings, Progress, Curriculum order.');
    await click(dialogButton(el, 'OK'));
    expect(location.get()).toBe('/settings?screen=display_settings');
    app.dispose();
  });
});

describe('WaniKani import', () => {
  const WK = 'https://api.wanikani.com';
  beforeEach(() => {
    const withWkUrls = (name: string) => json(200, JSON.parse(JSON.stringify(fixture(name)).replaceAll('https://kk.example.test', WK)));
    http.on('GET', `${WK}/v2/user`, withWkUrls('user'));
    for (const c of ['assignments', 'review_statistics', 'study_materials', 'level_progressions']) http.on('GET', `${WK}/v2/${c}`, withWkUrls(c));
  });

  async function startImport(el: HTMLElement, token: string) {
    await click($(el, 'link-import'));
    const d = await waitFor('dialog-import', el);
    expect(d.querySelector('h2')!.textContent).toBe('Import from WaniKani');
    await act(async () => setValue($(el, 'import-token') as HTMLInputElement, token));
    await click($(el, 'import-next'));
  }

  it('checks the token, confirms and replaces local progress', async () => {
    const { el, app } = await render('/settings');
    await startImport(el, '  secret-token  ');
    expect(http.calls('GET', `${WK}/v2/user`).at(-1)?.headers?.Authorization).toBe('Bearer secret-token');
    const confirm = await waitFor('dialog-import-confirm', el);
    expect(confirm.querySelector('h2')!.textContent).toBe('Override local progress?');
    expect(confirm.querySelector('.kk-alert-message')!.textContent).toMatch(/^WaniKani account kodama is at level 2\.\s+Importing downloads that account's progress\. This replaces ALL progress/);
    await click(dialogButton(el, 'Import and override'));
    expect(await message(el)).toMatch(/^Imported level 2: \d+ items, \d+ review statistics, \d+ notes\./);
    expect(app.get().learner!.progress.userLevel).toBe(2);
    expect(app.get().learner!.progress.subjects.get(1)?.srsStage).toBe(5);
    app.dispose();
  });

  it('drops progress rows of subjects the content lacks, as Java\'s resetProgress does', async () => {
    // Subject 11 has progress, then a content update drops it: an orphan row the normal saves keep.
    const seed = makeApp();
    await seed.app.start();
    await seed.app.write((ldb, now) => updateProgress(ldb, 11, { unlockedAt: now, startedAt: now, srsStage: 3 }));
    seed.app.dispose();
    const v2 = smallContent(smallSubjects().filter((x) => x.id !== 11));
    const { el, app, dbName } = await render('/settings/import', { dbName: seed.dbName, content: v2 });
    expect(JSON.parse(app.exportProgressFile().text).subjects.some((x: { id: number }) => x.id === 11)).toBe(true);
    await waitFor('dialog-import', el);
    await act(async () => setValue($(el, 'import-token') as HTMLInputElement, 'secret-token'));
    await click($(el, 'import-next'));
    await waitFor('dialog-import-confirm', el);
    await click(dialogButton(el, 'Import and override'));
    await message(el);
    expect(JSON.parse(app.exportProgressFile().text).subjects.some((x: { id: number }) => x.id === 11)).toBe(false);
    const kk = new KkDb(dbName);
    expect(await kk.subjects.get(11)).toBeUndefined();
    kk.close();
    app.dispose();
  });

  it('shows the Java message for a rejected token and changes nothing', async () => {
    http.on('GET', `${WK}/v2/user`, json(401, fixture('error-401')));
    const { el, app } = await render('/settings');
    await startImport(el, 'bad');
    expect(await message(el)).toBe('WaniKani rejected this API token.');
    expect(openDialog(el)!.querySelector('h2')!.textContent).toBe('Something went wrong');
    expect(app.get().learner!.progress.userLevel).toBe(1);
    app.dispose();
  });
});

describe('about', () => {
  it('shows credits, licenses and the install steps on the web build', async () => {
    const { el, app } = await render('/settings/about');
    expect($(el, 'about-title')!.textContent).toContain('KanjiKodama');
    expect(el.textContent).toContain('Smouldering Durtles');
    expect(el.textContent).toContain('Flaming Durtles');
    expect(el.textContent).toContain('KanjiVG');
    expect(el.textContent).toContain('EDRDG');
    expect($(el, 'about-wanikani')).not.toBeNull();
    expect([...$(el, 'about-fonts')!.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toContain('/licenses/OFL-silkscreen.txt');
    expect($(el, 'install-steps')!.textContent).toContain('Add to Home Screen');
    expect(el.textContent).toContain('No review notifications.');
    expect($(el, 'storage-info')).not.toBeNull();
    app.dispose();
  });

  it('has no install section on Android and the hint can be dismissed on the web', async () => {
    const android = await render('/settings/about', { caps: { audio: true, audioPlayback: true, audioDownload: true, notifications: true, autoBackup: true, backgroundSync: true, cleartextHttp: true } });
    expect($(android.el, 'install-section')).toBeNull();
    expect(android.el.textContent).toContain('No known limitations in this build.');
    android.app.dispose();
    act(() => root?.unmount());

    const web = await render('/settings');
    expect($(web.el, 'install-hint')).not.toBeNull();
    await click($(web.el, 'install-hint-dismiss'));
    expect($(web.el, 'install-hint')).toBeNull();
    expect(web.app.get().prefs.kk_install_hint_dismissed).toBe(true);
    web.app.dispose();
  });

  it('lists the known limitations on their own settings screen', async () => {
    const { el, app } = await render('/settings');
    await click($(el, 'link-limitations'));
    expect($(el, 'settings-limitations')!.textContent).toContain('No review notifications.');
    app.dispose();
  });
});
