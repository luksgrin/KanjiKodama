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
import { ADVANCED_GROUPS, MAIN_GROUPS, storedKeys } from '../../src/ui/screens/settings/schema';
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

async function render(path: string, opts: { caps?: Partial<Capabilities>; jlpt?: boolean; dbName?: string; content?: Content } = {}) {
  const platform = fakePlatform({}, opts.caps);
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
const input = (el: HTMLElement, testId: string) => $(el, testId)!.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')!;
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function waitFor(testId: string, el: HTMLElement): Promise<HTMLElement> {
  for (let i = 0; i < 200; i++) {
    const found = $(el, testId);
    if (found) return found;
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
  throw new Error(`${testId} did not appear`);
}

async function click(el: HTMLElement | null) {
  await act(async () => { el!.click(); });
  await flush();
}

function dialogButton(el: HTMLElement, label: string): HTMLButtonElement {
  const b = [...el.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find((x) => x.textContent === label);
  if (!b) throw new Error(`no dialog button ${label}`);
  return b;
}

describe('settings schema', () => {
  it('has the 58 advanced keys (18 as min/max ranges) and no duplicate keys within a page', () => {
    const advanced = ADVANCED_GROUPS.flatMap((g) => g.rows).filter((r) => r.type !== 'info' && r.type !== 'heading');
    expect(advanced).toHaveLength(58);
    expect(advanced.filter((r) => r.type === 'range')).toHaveLength(18);
    expect(new Set(storedKeys(ADVANCED_GROUPS)).size).toBe(76);
    const main = MAIN_GROUPS.flatMap((g) => g.rows).filter((r) => r.type !== 'info' && r.type !== 'heading').map((r) => r.key);
    expect(new Set(main).size).toBe(main.length);
  });
});

describe('settings screen', () => {
  it('changes a basic setting with the Java key and type', async () => {
    const { el, app } = await render('/settings');
    const field = input(el, 'setting-max_lesson_session_size') as HTMLInputElement;
    expect(field.value).toBe('5');
    await act(async () => { setValue(field, '12'); field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    await flush();
    expect(app.get().prefs.max_lesson_session_size).toBe('12');
    expect(maxSessionSize(app.get().prefs, 'LESSON')).toBe(12);

    const lightning = input(el, 'setting-enable_lightning_mode') as HTMLInputElement;
    expect(lightning.checked).toBe(true);
    await click(lightning);
    expect(app.get().prefs.enable_lightning_mode).toBe(false);

    await act(async () => setValue(input(el, 'setting-close_enough_action'), 'REJECT'));
    await flush();
    expect(app.get().prefs.close_enough_action).toBe('REJECT');
    // hide_sentence_translations: the XML default (true) is written when the screen shows it, like AndroidX.
    expect(app.get().prefs.hide_sentence_translations).toBe(true);
    app.dispose();
  });

  it('gates the advanced settings behind enable_advanced, with the Java warning', async () => {
    const { el, app, location } = await render('/settings');
    const anki = input(el, 'setting-anki_mode_review_meaning') as HTMLInputElement;
    expect(anki.disabled).toBe(true);
    await act(async () => location.navigate('/settings/advanced'));
    expect($(el, 'advanced-off')).not.toBeNull();
    expect($(el, 'group-advanced_lesson_settings')).toBeNull();

    // Turning it on asks first; "No" keeps it off.
    await click(input(el, 'setting-enable_advanced') as HTMLInputElement);
    expect(el.querySelector('dialog[open]')?.textContent).toContain('Enable advanced settings?');
    await click(dialogButton(el, 'No'));
    expect(app.get().prefs.enable_advanced).toBe(false);

    await click(input(el, 'setting-enable_advanced') as HTMLInputElement);
    await click(dialogButton(el, 'Yes'));
    expect(app.get().prefs.enable_advanced).toBe(true);
    expect($(el, 'group-advanced_other_settings')).not.toBeNull();

    await act(async () => setValue(input(el, 'setting-lesson_order'), 'TYPE_THEN_LEVEL'));
    await flush();
    expect(app.get().prefs.lesson_order).toBe('TYPE_THEN_LEVEL');
    expect(lessonOrder(app.get().prefs)).toBe('TYPE_THEN_LEVEL');

    // A range row stores <key>_min / <key>_max ints.
    const min = $(el, 'setting-lesson_subjects_kanji')!.querySelector('input')!;
    await act(async () => { setValue(min, '3'); min.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    await flush();
    expect(app.get().prefs.lesson_subjects_kanji_min).toBe(3);
    expect($(el, 'setting-lesson_subjects_kanji')!.textContent).toContain('Min 3');

    // Off again: the stored values stay, the getters use the defaults.
    await click(input(el, 'setting-enable_advanced') as HTMLInputElement);
    expect(app.get().prefs.enable_advanced).toBe(false);
    expect(app.get().prefs.lesson_order).toBe('TYPE_THEN_LEVEL');
    expect(lessonOrder(app.get().prefs)).toBe('LEVEL_THEN_TYPE');

    await act(async () => location.navigate('/settings'));
    await click(input(el, 'setting-enable_advanced') as HTMLInputElement);
    await click(dialogButton(el, 'Yes'));
    const anki2 = input(el, 'setting-anki_mode_review_meaning') as HTMLInputElement;
    expect(anki2.disabled).toBe(false);
    await click(anki2);
    expect(ankiMode(app.get().prefs, 'REVIEW', 'WANIKANI_RADICAL_NAME')).toBe(true);
    app.dispose();
  });

  it('shows platform rows by capability and hides local-only links in server mode', async () => {
    const web = await render('/settings', { caps: { audioPlayback: true } });
    // Online audio on the web build: autoplay and voice, but no downloads.
    expect($(web.el, 'setting-voice_preference')).not.toBeNull();
    expect($(web.el, 'setting-auto_download_audio')).toBeNull();
    expect($(web.el, 'link-audio')).toBeNull();
    expect($(web.el, 'setting-enable_notifications')).toBeNull();
    expect($(web.el, 'setting-delay_result_upload')).toBeNull();
    expect($(web.el, 'link-curriculum')).not.toBeNull();
    web.app.dispose();
    act(() => root?.unmount());

    const android = await render('/settings', { caps: { audio: true, audioPlayback: true, audioDownload: true, notifications: true, haptics: true, autoBackup: true } });
    expect($(android.el, 'setting-voice_preference')).not.toBeNull();
    expect($(android.el, 'setting-auto_download_audio')).not.toBeNull();
    expect($(android.el, 'link-audio')).not.toBeNull();
    expect($(android.el, 'setting-enable_notifications')).not.toBeNull();
    expect($(android.el, 'setting-enable_haptic_feedback_success')).not.toBeNull();
    expect($(android.el, 'install-hint')).toBeNull();
    android.app.dispose();
  });
});

describe('curriculum and fast travel', () => {
  it('switches to JLPT order after the confirmation, then fast travels', async () => {
    const { el, app, location } = await render('/settings/curriculum', { jlpt: true });
    expect($(el, 'curriculum-summary')!.textContent).toBe('WaniKani order. Tap to switch; progress on every item is kept.');
    await click($(el, 'curriculum-JLPT'));
    expect(el.querySelector('dialog[open] h2')?.textContent).toBe('Switch to JLPT order?');
    expect($(el, 'curriculum-confirm')!.textContent).toMatch(/^You would be placed on level 1 \(N5.*\): the first level where you have mastered less than 60% of the kanji\./);
    // Cancel changes nothing.
    await click(dialogButton(el, 'Cancel'));
    expect(app.get().learner!.progress.curriculum).toBe('WANIKANI');

    await click($(el, 'curriculum-JLPT'));
    await click(dialogButton(el, 'Switch'));
    expect(app.get().learner!.progress.curriculum).toBe('JLPT');
    expect($(el, 'curriculum-status')!.textContent).toMatch(/^You are now in JLPT order, on level 1 \(N5.*\)\.$/);

    await act(async () => location.navigate('/settings/fast-travel'));
    expect(el.querySelector('.kk-panel h2')?.textContent).toMatch(/^Fast travel from level 1/);
    const option = $(el, 'fast-travel-2')!;
    expect(option.textContent).toMatch(/^Level 2( \(.+\))?: \d+ to prove, about \d+ min a day$/);
    await click(option);
    expect(el.querySelector('dialog[open] h2')?.textContent).toBe('Travel to level 2?');
    await click(dialogButton(el, 'Travel'));
    expect(app.get().learner!.progress.userLevel).toBe(2);
    expect($(el, 'fast-travel-message')!.textContent).toMatch(/^Welcome to level 2.*\. \d+ probation items are waiting in your reviews\.$/);
    // Probation pending: blocked now.
    expect($(el, 'fast-travel-blocked')!.textContent).toMatch(/remaining probation reviews/);
    app.dispose();
  });

  it('blocks fast travel in WaniKani order', async () => {
    const { el, app } = await render('/settings/fast-travel');
    expect($(el, 'fast-travel-blocked')!.textContent).toBe('Fast travel is only available in JLPT order. Switch in Settings, Progress, Curriculum order.');
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

  it('checks the token, confirms and replaces local progress', async () => {
    const { el, app } = await render('/settings/import');
    const field = $(el, 'import-token') as HTMLInputElement;
    await act(async () => setValue(field, '  secret-token  '));
    await click($(el, 'import-next'));
    expect(http.calls('GET', `${WK}/v2/user`).at(-1)?.headers?.Authorization).toBe('Bearer secret-token');
    expect(el.querySelector('dialog[open] h2')?.textContent).toBe('Override local progress?');
    expect($(el, 'import-confirm')!.textContent).toMatch(/^WaniKani account kodama is at level 2\.\s+Importing downloads that account's progress\. This replaces ALL progress/);
    await click(dialogButton(el, 'Import and override'));
    expect((await waitFor('import-message', el)).textContent).toMatch(/^Imported level 2: \d+ items, \d+ review statistics, \d+ notes\./);
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
    await act(async () => setValue($(el, 'import-token') as HTMLInputElement, 'secret-token'));
    await click($(el, 'import-next'));
    await click(dialogButton(el, 'Import and override'));
    await waitFor('import-message', el);
    expect(JSON.parse(app.exportProgressFile().text).subjects.some((x: { id: number }) => x.id === 11)).toBe(false);
    const kk = new KkDb(dbName);
    expect(await kk.subjects.get(11)).toBeUndefined();
    kk.close();
    app.dispose();
  });

  it('shows the Java message for a rejected token and changes nothing', async () => {
    http.on('GET', `${WK}/v2/user`, json(401, fixture('error-401')));
    const { el, app } = await render('/settings/import');
    await act(async () => setValue($(el, 'import-token') as HTMLInputElement, 'bad'));
    await click($(el, 'import-next'));
    expect((await waitFor('import-message', el)).textContent).toBe('WaniKani rejected this API token.');
    expect(el.querySelector('dialog[open]')).toBeNull();
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
});
