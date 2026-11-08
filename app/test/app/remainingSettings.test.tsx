// @vitest-environment jsdom
// Font settings (quiz font selection / import, the size sliders), notification details, search
// engines 1-5 and the title long press, "Request audio focus", the post-60 progression panel.
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import { computePost60Breakdown } from '../../src/core/dashboard';
import { createLearnerDb, updateProgress } from '../../src/core/progression';
import type { Capabilities } from '../../src/platform';
import { searchEngines, searchUrl, javaUrlEncode } from '../../src/ui/components/subject/searchEngines';
import { SETTINGS_SCREENS } from '../../src/ui/screens/settings/schema';
import { isLightColor, post60Segments, segmentLabel } from '../../src/ui/screens/dashboard/Post60Progress';
import { hasGlyphs, readGlyphCoverage } from '../../src/ui/theme/fontCmap';
import { fontFits, selectedFonts, withFontSelected } from '../../src/ui/theme/quizFonts';
import { clearToasts } from '../../src/ui/shell/toast';
import { smallContent, subject } from '../progress-storage/helpers';
import type { ContentSubject } from '../../src/core/content';
import { Headline } from '../../src/ui/components/subject/SubjectSections';
import { fakePlatform, makeApp } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  document.documentElement.classList.remove('kk-action-mode');
});

async function render(path: string, caps: Partial<Capabilities> = {}) {
  const h = makeApp({ platform: fakePlatform({}, caps) });
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

const $ = (el: ParentNode, testId: string) => el.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });
async function click(el: HTMLElement | null) {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.click(); });
  await flush();
}
function dialogButton(el: ParentNode, label: string): HTMLButtonElement {
  const b = [...el.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find((x) => x.textContent === label);
  if (!b) throw new Error(`no dialog button ${label}`);
  return b;
}

const ANDROID: Partial<Capabilities> = { audio: true, audioPlayback: true, audioDownload: true, notifications: true, audioFocus: true, imeFlags: true };

describe('schema: every visible preferences.xml row, in XML order', () => {
  const xml = readFileSync(join(process.cwd(), 'test/fixtures/java/preferences.xml'), 'utf8');
  // Hidden in Java too (isPreferenceVisible=false / LocalMode), or asked on their own screens.
  const NOT_LISTED = ['api_key_help', 'api_key', 'audio_location', 'web_password', 'not_always_hide_wk_mnemonic'];
  for (const g of SETTINGS_SCREENS) {
    it(g.id, () => {
      const start = xml.indexOf(`app:key="${g.id}"`);
      const end = xml.indexOf('</PreferenceScreen>', start);
      const javaKeys = [...xml.slice(start, end).matchAll(/(?:app|android):key="(\w+)"/g)].map((m) => m[1]!).slice(1)
        .filter((k) => !NOT_LISTED.includes(k));
      expect(g.rows.map((r) => r.key)).toEqual(javaKeys);
    });
  }
});

describe('Font settings', () => {
  it('lists the Java rows; the selection page toggles selected_fonts as a JSON list', async () => {
    const { el, app } = await render('/settings?screen=font_settings');
    const rows = [...el.querySelectorAll('[data-testid^="setting-"]')].map((e) => e.getAttribute('data-testid'));
    expect(rows).toEqual([
      'setting-font_selection', 'setting-font_import', 'setting-max_font_size_lesson', 'setting-max_font_size_quiz',
      'setting-max_font_size_browse', 'setting-max_font_size_quiz_text', 'setting-font_size_question_edit',
      'setting-font_size_subject_info', 'setting-font_size_live_subject_table', 'setting-font_size_anki_answer',
    ]);
    expect($(el, 'setting-max_font_size_lesson')!.textContent).toContain('Set to 0 to hide the title');
    await click($(el, 'setting-font_selection'));
    expect($(el, 'font-selection')!.textContent).toContain('one will be chosen at random for each item');
    expect([...el.querySelectorAll('.kk-font-name')].map((e) => e.textContent)).toEqual([
      'Android default', 'Sawarabi Mincho', 'Sawarabi Gothic', 'M⁺ P Type-1', 'Kosugi', 'Kosugi Maru', 'Otsutome', '851 Gochikakutto',
    ]);
    await click($(el, 'font-switch-3'));
    await click($(el, 'font-switch-7'));
    expect(app.get().prefs.selected_fonts).toBe('["3","7"]');
    expect($(el, 'font-switch-3')!.getAttribute('aria-checked')).toBe('true');
    await click($(el, 'font-switch-3'));
    expect(app.get().prefs.selected_fonts).toBe('["7"]');
    expect($(el, 'toolbar')!.textContent).toContain('Font selection');
    app.dispose();
  });

  it('imports, overwrites (asking first) and deletes font files', async () => {
    const { el, app } = await render('/settings?screen=font_import');
    expect($(el, 'font-import')!.textContent).toContain('Click import to select a TTF font file to import.');
    const input = $(el, 'import-font-input') as HTMLInputElement;
    const pick = async (name: string) => {
      const file = new File([new Uint8Array([0, 1, 0, 0])], name);
      // jsdom's File has no arrayBuffer in some versions.
      (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer ??= async () => new Uint8Array([0, 1, 0, 0]).buffer;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
      await flush();
    };
    await pick('My Font.ttf');
    expect($(el, 'imported-font-My Font.ttf')!.textContent).toBe('My Font.ttfSampleDelete');
    expect(document.body.textContent).toContain('File imported');
    await pick('My Font.ttf');
    expect(el.querySelector('dialog[open]')!.textContent).toContain("A file named 'My Font.ttf' already exists. Do you want to overwrite it?");
    await click(dialogButton(el, 'Yes'));
    await click([...el.querySelectorAll<HTMLButtonElement>('.kk-borderless')].find((b) => b.textContent === 'Delete')!);
    expect(el.querySelector('dialog[open]')!.textContent).toContain("Are you sure you want to delete 'My Font.ttf'");
    await click(dialogButton(el, 'Yes'));
    expect($(el, 'imported-font-My Font.ttf')).toBeNull();
    app.dispose();
  });

  it('reads selected_fonts like GlobalSettings.Font (JSON or space-separated)', () => {
    expect(selectedFonts({})).toEqual([]);
    expect(selectedFonts({ selected_fonts: '["2","x.ttf"]' })).toEqual(['2', 'x.ttf']);
    expect(selectedFonts({ selected_fonts: '2  5' })).toEqual(['2', '5']);
    expect(withFontSelected({ selected_fonts: '2 5' }, '5', false)).toBe('["2"]');
    expect(withFontSelected({}, '4', true)).toBe('["4"]');
  });

  it('reads glyph coverage from the font file (SessionItem.tryAddTypefaceConfiguration)', () => {
    const file = (n: string) => { const b = readFileSync(join(process.cwd(), n)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    const kosugi = readGlyphCoverage(file('public/fonts/quiz/kosugi_regular.ttf'))!;
    const pixel = readGlyphCoverage(file('src/assets/fonts/pixelify_sans.ttf'))!;
    expect(hasGlyphs(kosugi, '日本語の書体')).toBe(true);
    expect(hasGlyphs(pixel, 'abc')).toBe(true);
    expect(hasGlyphs(pixel, '日')).toBe(false);
    expect(fontFits({ id: 'p', family: 'p', padTop: 0, coverage: pixel }, '日')).toBe(false);
    expect(readGlyphCoverage(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
  });
});

describe('Notifications and other settings', () => {
  it('Android: the notification rows and the five search engines with the Java defaults', async () => {
    const { el, app } = await render('/settings?screen=other_settings', ANDROID);
    expect($(el, 'setting-notification_update_frequency')!.textContent).toBe('Notification update frequencyOnly for new reviews');
    expect($(el, 'setting-notification_priority')!.textContent).toBe('Notification priorityDefault');
    expect($(el, 'setting-notification_category')!.textContent).toBe('Notification categoryRecommendation (default)');
    expect($(el, 'setting-search_engine_1')!.textContent).toBe('Search engine 1Wiktionary');
    expect($(el, 'setting-search_engine_2')!.textContent).toBe('Search engine 2Jisho');
    expect($(el, 'setting-search_engine_3')!.textContent).toBe('Search engine 3');
    await click($(el, 'setting-notification_priority'));
    await click($(el, 'choice-notification_priority-HIGH'));
    expect(app.get().prefs.notification_priority).toBe('HIGH');

    await click($(el, 'setting-search_engine_3'));
    const d = el.querySelector('dialog[open]')!;
    expect(d.textContent).toContain('Search engines are shown when long-pressing on a subject title.');
    (d.querySelector('[data-testid="search_engine_3-name"]') as HTMLInputElement).value = 'Weblio';
    (d.querySelector('[data-testid="search_engine_3-url"]') as HTMLInputElement).value = 'https://www.weblio.jp/content/%s';
    await click(dialogButton(el, 'OK'));
    expect(app.get().prefs.search_engine_3_tag).toBe('Weblio');
    expect(app.get().prefs.search_engine_3).toBe('https://www.weblio.jp/content/%s');
    expect($(el, 'setting-search_engine_3')!.textContent).toBe('Search engine 3Weblio');
    app.dispose();
  });

  it('web: no notification rows (no notifications), the search engines stay', async () => {
    const { el, app } = await render('/settings?screen=other_settings', { audioPlayback: true });
    expect($(el, 'setting-notification_priority')).toBeNull();
    expect($(el, 'setting-search_engine_1')).not.toBeNull();
    app.dispose();
  });

  it('search engine slots, URLs and the encoding (URLEncoder)', () => {
    expect(searchEngines({}).map((e) => e.name)).toEqual(['Wiktionary', 'Jisho']);
    expect(searchEngines({ search_engine_1_tag: '', search_engine_4_tag: 'A', search_engine_4: 'u%s' }).map((e) => e.name)).toEqual(['Jisho', 'A']);
    expect(javaUrlEncode('a b~!')).toBe('a+b%7E%21');
    expect(searchUrl(searchEngines({})[1]!, '日本')).toBe('https://jisho.org/search/%E6%97%A5%E6%9C%AC');
  });
});

describe('title long press (SubjectInfoButtonView)', () => {
  const longPress = async (el: HTMLElement) => {
    await act(async () => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  };
  const headline = async (s: ContentSubject, maxFontSize = 64) => {
    container = document.createElement('div');
    document.body.append(container);
    await act(async () => {
      root = createRoot(container!);
      root.render(<Headline subject={s} prefs={{}} maxFontSize={maxFontSize} />);
    });
    return container;
  };

  it('opens the action mode with Copy title and the search engines; Done closes it', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 411, configurable: true });
    const el = await headline(subject(10, 'kanji', 1, [], '一'));
    await longPress($(el, 'subject-tile')!);
    const bar = $(document.body, 'title-action-mode')!;
    expect(bar).not.toBeNull();
    expect(document.documentElement.classList.contains('kk-action-mode')).toBe(true);
    // 411 dp: 3 slots, one for the overflow (ActionMenuPresenter).
    expect([...bar.querySelectorAll('.kk-action-mode-item')].map((b) => b.textContent)).toEqual(['Copy title', 'Wiktionary']);
    await click($(bar, 'action-mode-overflow'));
    expect($(bar, 'action-search-2')!.textContent).toBe('Jisho');
    await click($(bar, 'action-mode-done'));
    expect($(document.body, 'title-action-mode')).toBeNull();
    expect(document.documentElement.classList.contains('kk-action-mode')).toBe(false);
  });

  it('an image-only radical gets the Java toast instead', async () => {
    const el = await headline(subject(1, 'radical', 1));
    await longPress($(el, 'subject-tile')!);
    expect($(document.body, 'title-action-mode')).toBeNull();
    expect(document.body.textContent).toContain("This radical has no text character. Can't copy or search for an image-only radical.");
  });

  it('max font size 0 hides the title', async () => {
    const el = await headline(subject(10, 'kanji', 1, [], '一'), 0);
    expect($(el, 'subject-tile')).toBeNull();
  });
});

describe('Audio settings', () => {
  it('"Request audio focus" only where the build can (Android)', async () => {
    const a = await render('/settings?screen=audio_settings', ANDROID);
    expect($(a.el, 'setting-use_audio_focus')!.textContent).toContain('Asks other player apps to pause or lower their volume when playing vocab audio');
    a.app.dispose();
    act(() => root?.unmount());
    const w = await render('/settings?screen=audio_settings', { audioPlayback: true });
    expect($(w.el, 'setting-use_audio_focus')).toBeNull();
    w.app.dispose();
  });
});

describe('post-60 progression', () => {
  it('counts every visible subject by shallow / deep bucket', () => {
    const db = createLearnerDb(smallContent(), new Map());
    updateProgress(db, 10, { srsStage: 1, unlockedAt: 1 });
    updateProgress(db, 11, { srsStage: 5, unlockedAt: 1 });
    updateProgress(db, 20, { srsStage: 9, unlockedAt: 1 });
    const shallow = computePost60Breakdown(db, false);
    const deep = computePost60Breakdown(db, true);
    expect(shallow.reduce((a, b) => a + b)).toBe(7);
    expect(shallow[2]).toBe(1); // apprentice
    expect(shallow[3]).toBe(1); // guru
    expect(shallow[6]).toBe(1); // burned
    expect(deep).toHaveLength(11);
    expect(deep[2]).toBe(1); // Apprentice I
    expect(deep[6]).toBe(1); // Guru I
    expect(deep[10]).toBe(1);
  });

  it('labels, reversal and text colours as Post60ProgressBarView', () => {
    const w = (s: string) => s.length * 6;
    expect(segmentLabel(1, 3, 100, w, 2)).toBe('33.3%');
    expect(segmentLabel(1, 3, 20, w, 2)).toBe('33%');
    expect(segmentLabel(1, 3, 10, w, 2)).toBeNull();
    expect(post60Segments([1, 2, 3], ['#a', '#b', '#c'], true)).toEqual({ values: [3, 2, 1], colors: ['#c', '#b', '#a'] });
    expect(isLightColor('#EEEEEE')).toBe(true);
    expect(isLightColor('#444444')).toBe(false);
  });

  it('shows the panel on the dashboard when switched on', async () => {
    const { el, app } = await render('/');
    expect($(el, 'post60-progress')).toBeNull();
    await act(async () => { await app.setPreference('show_post60_progression', true); });
    expect($(el, 'post60-progress')!.textContent).toBe('Post-60 progression');
    app.dispose();
  });
});
