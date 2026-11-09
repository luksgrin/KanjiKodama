// @vitest-environment jsdom
// Display settings (themes, theme customisation, the session display rows), Keyboard input settings,
// Keyboard help and the dashboard's keyboard hints box.
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import type { Capabilities } from '../../src/platform';
import { answerKeyboard } from '../../src/platform/answerKeyboard';
import { SETTINGS_SCREENS } from '../../src/ui/screens/settings/schema';
import { hexToHsl, hslToHex } from '../../src/ui/screens/themeCustomization/HslColorPicker';
import {
  THEMES,
  THEME_OPTIONS,
  activeTheme,
  baseColor,
  hexToInt,
  intToHex,
  parseCustomizations,
  serializeCustomizations,
  themePrefsFrom,
  themeTokens,
  toolbarColor,
} from '../../src/ui/theme/themes';
import { clearToasts } from '../../src/ui/shell/toast';
import { fakePlatform, makeApp } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;
let dark = false;

beforeEach(() => {
  dark = false;
  (globalThis as { matchMedia?: unknown }).matchMedia = () => ({ matches: dark, addEventListener() {}, removeEventListener() {} });
});

afterEach(() => {
  clearToasts();
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

async function render(path: string, caps: Partial<Capabilities> = {}, prefs: Record<string, unknown> = {}) {
  const h = makeApp({ platform: fakePlatform({}, caps) });
  await h.app.start();
  for (const [k, v] of Object.entries(prefs)) await h.app.setPreference(k, v as never);
  container = document.createElement('div');
  document.body.append(container);
  const location = createMemoryLocation(path);
  await act(async () => {
    root = createRoot(container!);
    root.render(<App app={h.app} location={location} />);
  });
  await flush();
  return { ...h, location, el: container };
}

const $ = (el: HTMLElement, testId: string) => el.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });
async function click(el: HTMLElement | null) {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.click(); });
  await flush();
}
const rowTitles = (el: HTMLElement) => [...el.querySelectorAll('.kk-pref-title')].map((t) => t.textContent);

describe('Display settings', () => {
  it('lists the rows in order with their defaults', async () => {
    const { el, app } = await render('/settings?screen=display_settings');
    expect(rowTitles(el)).toEqual([
      'Light Theme', 'Dark Theme', 'Theme Customisation', 'Center caret in quiz answer box', 'Vertical size of the Anki mode buttons',
      'Fix height of main quiz question view', 'Swap the correct/incorrect Anki mode buttons',
      'Use slide animations to transition between quiz questions',
      'Stretch the question view to fill the screen when keyboard input is active',
    ]);
    expect($(el, 'setting-theme')!.textContent).toContain('KanjiKodama theme is currently selected');
    expect($(el, 'setting-nightTheme')!.textContent).toContain('KanjiKodama Dark is used in system wide dark mode');
    expect($(el, 'setting-theme_customization')!.textContent).toContain('Customise colors in the current theme');
    expect($(el, 'setting-anki_buttons_height')!.querySelector('input')!.value).toBe('50');
    expect($(el, 'setting-anki_buttons_height')!.querySelector('input')!.min).toBe('10');
    expect($(el, 'setting-quiz_question_view_height')!.textContent).toContain('Set to 0 to not force a fixed size');
    expect($(el, 'setting-slide_animations')!.getAttribute('aria-checked')).toBe('true');
    expect($(el, 'setting-center_caret')!.getAttribute('aria-checked')).toBe('false');
    app.dispose();
  });

  it('offers the nine themes in both lists and applies the night theme in dark mode', async () => {
    const { el, app } = await render('/settings?screen=display_settings');
    await click($(el, 'setting-nightTheme'));
    const choices = [...document.querySelectorAll('[data-testid^="choice-nightTheme-"]')].map((c) => c.textContent);
    expect(choices).toEqual(['KanjiKodama', 'KanjiKodama Dark', 'KanjiKodama Black', 'Wanikani', 'Wanikani Dark', 'Wanikani Black', 'Breeze', 'Black', 'Nord']);
    await click($(el, 'choice-nightTheme-NORD_POLAR_NIGHT'));
    expect(app.get().prefs.nightTheme).toBe('NORD_POLAR_NIGHT');
    expect($(el, 'setting-nightTheme')!.textContent).toContain('Nord is used in system wide dark mode');
    // Light system mode: still the Light Theme.
    expect(document.documentElement.dataset.kkTheme).toBe('KANJIKODAMA_LIGHT');
    expect(activeTheme(themePrefsFrom(app.get().prefs), true).id).toBe('NORD_POLAR_NIGHT');
    app.dispose();
  });

  it('slide animations off marks <html> so the session slides stop', async () => {
    const { el, app } = await render('/settings?screen=display_settings');
    expect(document.documentElement.dataset.slideAnimations).toBeUndefined();
    await click($(el, 'setting-slide_animations'));
    expect(app.get().prefs.slide_animations).toBe(false);
    expect(document.documentElement.dataset.slideAnimations).toBe('off');
    await click($(el, 'setting-slide_animations'));
    expect(document.documentElement.dataset.slideAnimations).toBeUndefined();
    app.dispose();
  });

  it('Theme Customisation opens the customisation screen; a picked colour is saved and applied', async () => {
    const { el, app, location } = await render('/settings?screen=display_settings');
    await click($(el, 'setting-theme_customization'));
    expect(location.get()).toBe('/settings/theme-customization');
    expect($(el, 'tc-description')!.textContent).toBe('The identifying colour for Radical subjects');
    expect($(el, 'tc-rgb')!.textContent).toBe('RGB values:#7FB2E6');
    expect(($(el, 'tc-reset') as HTMLButtonElement).disabled).toBe(true);
    await click($(el, 'tc-sample-5'));
    expect($(el, 'tc-description')!.textContent).toBe('The segment colour for Initiate items (not started yet)\nUsed on the timeline chart, the SRS breakdown, and the Post-60 progression bar');
    expect($(el, 'tc-sample-5')!.style.background).toBe('rgb(183, 201, 189)');

    // Drag the hue indicator to the left (cyan) and let go.
    const svg = $(el, 'color-picker')! as unknown as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const pointer = (type: string, x: number, y: number) => {
      const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }) as MouseEvent & { pointerId: number };
      Object.defineProperty(e, 'pointerId', { value: 1 });
      return e;
    };
    await act(async () => { svg.dispatchEvent(pointer("pointerdown", 150 - 132, 150)); });
    await act(async () => { svg.dispatchEvent(pointer("pointerup", 150 - 132, 150)); });
    await flush();
    const saved = parseCustomizations(app.get().prefs.theme_customizations_KANJIKODAMA_LIGHT);
    expect(saved).toHaveLength(33);
    expect(saved[5]).not.toBe(0);
    expect(hexToHsl(intToHex(saved[5]!)).h).toBeCloseTo(180, 0);
    expect(document.documentElement.style.getPropertyValue('--color-stage-initial')).toBe(intToHex(saved[5]!));
    expect(($(el, 'tc-reset') as HTMLButtonElement).disabled).toBe(false);

    await click($(el, 'tc-reset'));
    expect(parseCustomizations(app.get().prefs.theme_customizations_KANJIKODAMA_LIGHT)[5]).toBe(0);
    expect(document.documentElement.style.getPropertyValue('--color-stage-initial')).toBe('');
    app.dispose();
  });
});

describe('themes', () => {
  it('has the eight themes of @array/themeValues plus KanjiKodama Black', () => {
    expect(THEME_OPTIONS.map(([v]) => v)).toEqual([
      'KANJIKODAMA_LIGHT', 'KANJIKODAMA_DARK', 'KANJIKODAMA_BLACK', 'LIGHT', 'DARK_WANIKANI', 'BLACK_WANIKANI', 'DARK', 'BLACK_BREEZE', 'NORD_POLAR_NIGHT',
    ]);
    expect(Object.keys(THEMES)).toHaveLength(9);
  });

  it('maps the theme colours to tokens', () => {
    const wk = themeTokens(THEMES.LIGHT, parseCustomizations(null));
    expect(wk['--color-toolbar-bg']).toBe('#E80092');
    expect(wk['--color-bg']).toBe('#FFFFFF');
    expect(wk['--color-radical']).toBe('#0098F0');
    expect(wk['--color-on-subject']).toBe('#FFFFFF');
    expect(wk['--color-stage-guru']).toBe('#7D2893');
    const nord = themeTokens(THEMES.NORD_POLAR_NIGHT, parseCustomizations(null));
    expect(nord['--color-kanji']).toBe('#2E3440');
    expect(nord['--color-kanji-fg']).toBe('#B48EAD');
    expect(nord['--color-anki-answer-bg']).toBe('transparent');
    // The KanjiKodama themes are tokens.css: nothing inline without customisations.
    expect(themeTokens(THEMES.KANJIKODAMA_DARK, parseCustomizations(null))).toEqual({});
  });

  it('KanjiKodama Black: the dark theme on a pure black ground (AMOLED)', () => {
    const black = THEMES.KANJIKODAMA_BLACK;
    const dark = THEMES.KANJIKODAMA_DARK;
    expect(black.kind).toBe('dark');
    expect({ ...black, id: dark.id, tokens: {} }).toEqual(dark);
    const t = themeTokens(black, parseCustomizations(null));
    expect(t['--color-bg']).toBe('#000000');
    expect(t['--kk-ground']).toBe('#000000');
    // Surfaces and bars just above black; text, accents and subject colours stay the dark theme's.
    for (const k of ['--color-surface', '--color-toolbar-bg', '--color-dialog', '--color-divider']) {
      expect(luminance(t[k]!)).toBeGreaterThan(0);
      expect(luminance(t[k]!)).toBeLessThan(0.03);
    }
    for (const k of ['--color-text', '--color-accent', '--color-radical', '--color-stage-guru']) expect(t[k]).toBeUndefined();
    expect(toolbarColor(black)).toBe(t['--color-toolbar-bg']);
    // Customisations still apply on top.
    const custom = themeTokens(black, parseCustomizations(serializeCustomizations([hexToInt('#123456')])));
    expect(custom['--color-radical']).toBe('#123456');
    expect(custom['--color-bg']).toBe('#000000');
  });

  it('KanjiKodama Black keeps the dark theme text readable (WCAG AA) on its grounds', () => {
    const ink = '#E3F4EA', muted = '#A9C9BC', toned = '#7FA898', accent = '#8EE3C8';
    const t = themeTokens(THEMES.KANJIKODAMA_BLACK, parseCustomizations(null));
    for (const bg of [t['--color-bg']!, t['--color-surface']!, t['--color-toolbar-bg']!]) {
      for (const fg of [ink, muted, accent]) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(toned, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('customisations override as loadCustomizations does (ident vs text colours)', () => {
    const custom = parseCustomizations(serializeCustomizations([hexToInt('#123456'), 0, 0, 0, hexToInt('#ABCDEF')]));
    expect(custom[0]).toBe(0xFF123456 | 0);
    const kk = themeTokens(THEMES.KANJIKODAMA_LIGHT, custom);
    expect(kk['--color-radical']).toBe('#123456');
    expect(kk['--color-radical-strong']).toBe('#123456');
    expect(kk['--color-stage-locked']).toBe('#ABCDEF');
    const breeze = themeTokens(THEMES.DARK, custom);
    expect(breeze['--color-radical']).toBe('#232629');
    expect(breeze['--color-radical-fg']).toBe('#123456');
    expect(baseColor(THEMES.KANJIKODAMA_LIGHT, 0)).toBe('#7FB2E6');
    expect(baseColor(THEMES.KANJIKODAMA_LIGHT, 32)).toBe('#909000');
  });

  it('converts HSL like ColorUtils', () => {
    expect(hslToHex(hexToHsl('#7FB2E6'))).toBe('#7FB2E6');
    expect(hslToHex({ h: 0, s: 1, l: 0.5 })).toBe('#FF0000');
  });
});

describe('Keyboard input settings', () => {
  const ANDROID_ROWS = [
    'Tap here to read some hints for keyboard settings', 'Allow keyboard auto-correct for meanings', 'Allow keyboard auto-correct for readings',
    'Force ASCII keyboard for meanings', 'Force ASCII keyboard for readings', "Force 'visible password' setting for meanings",
    "Force 'visible password' setting for readings", 'Set keyboard language hint to English for meanings',
    'Set keyboard language hint to Japanese for readings', "Enable 'no personalized learning' option",
    'Delay in seconds to disable the next/submit button after typing an incorrect answer',
  ];

  it('sits between Lesson/review settings and Font settings', () => {
    const ids = SETTINGS_SCREENS.map((g) => g.id);
    expect(ids.indexOf('keyboard_settings')).toBe(ids.indexOf('review_settings') + 1);
    expect(ids.indexOf('font_settings')).toBe(ids.indexOf('keyboard_settings') + 1);
  });

  it('Android: all the rows; the hints row opens Keyboard help', async () => {
    const { el, app, location } = await render('/settings?screen=keyboard_settings', { imeFlags: true });
    expect(rowTitles(el)).toEqual(ANDROID_ROWS);
    // The XML default true is written when settings are shown (the getter defaults to false).
    expect(app.get().prefs.force_ascii_meaning).toBe(true);
    expect($(el, 'setting-enable_no_learning')!.getAttribute('aria-checked')).toBe('true');
    expect($(el, 'setting-next_button_delay')!.textContent).toContain('0');
    await click($(el, 'setting-keyboard_help'));
    expect(location.get()).toBe('/settings/keyboard-help');
    app.dispose();
  });

  it('web: only what a browser can honour (auto-correct, the delay)', async () => {
    const { el, app } = await render('/settings?screen=keyboard_settings');
    expect(rowTitles(el)).toEqual([ANDROID_ROWS[1], ANDROID_ROWS[2], ANDROID_ROWS[10]]);
    app.dispose();
  });

  it('answerKeyboard follows the keyboard settings', () => {
    expect(answerKeyboard({}, false)).toEqual({
      answerField: true, noPersonalizedLearning: true, forceAscii: false, autoCorrect: false, visiblePassword: false, hintLocale: '',
    });
    const p = { force_ascii_reading: true, enable_auto_correct_meaning: true, force_visible_password_reading: true, ime_hint_meaning: true, ime_hint_reading: true };
    expect(answerKeyboard(p, false)).toMatchObject({ forceAscii: false, autoCorrect: true, visiblePassword: false, hintLocale: 'en' });
    expect(answerKeyboard(p, true)).toMatchObject({ forceAscii: true, autoCorrect: false, visiblePassword: true, hintLocale: 'ja' });
  });
});

describe('Keyboard help', () => {
  it('shows the documents; Do it changes the settings and confirms', async () => {
    const { el, app, location } = await render('/settings/keyboard-help', { imeFlags: true });
    expect($(el, 'keyboard-help-0')!.textContent).toContain('Welcome to KanjiKodama!');
    expect($(el, 'keyboard-help-1')!.querySelector('h4')!.textContent).toBe('If you are using Swiftkey');
    expect([...$(el, 'keyboard-help-1')!.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      "Enable 'visible password' for both meanings and readings", "Don't allow auto-correct", "Disable 'no personalized learning'",
    ]);
    expect($(el, 'keyboard-help-5')!.textContent).toContain('it may work for you.');
    await click($(el, 'do-it-1'));
    expect(app.get().prefs).toMatchObject({
      force_visible_password_meaning: true, force_visible_password_reading: true,
      enable_auto_correct_meaning: false, enable_auto_correct_reading: false, enable_no_learning: false,
    });
    expect(el.querySelector('dialog[open]')!.textContent).toContain('Your settings have been updated.');
    await click([...el.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find((b) => b.textContent === 'OK')!);
    await click($(el, 'do-it-4'));
    expect(app.get().prefs.force_ascii_meaning).toBe(false);
    await click([...el.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find((b) => b.textContent === 'OK')!);
    await click($(el, 'keyboard-settings-3'));
    expect(location.get()).toBe('/settings?screen=keyboard_settings');
    app.dispose();
  });
});

describe('dashboard keyboard hints box', () => {
  it('Android: shown until Dismiss; View opens Keyboard help', async () => {
    const { el, app, location } = await render('/', { imeFlags: true });
    const banner = $(el, 'keyboard-help-banner')!;
    expect(banner.textContent).toContain('Please take a moment to review some hints for your keyboard settings');
    // First on the dashboard.
    expect(el.querySelector('.kk-dashboard')!.firstElementChild).toBe(banner);
    await click($(el, 'keyboard-help-view'));
    expect(location.get()).toBe('/settings/keyboard-help');
    await act(async () => location.navigate('/'));
    await flush();
    await click($(el, 'keyboard-help-dismiss'));
    expect(app.get().prefs.keyboard_help_dismissed).toBe(true);
    expect($(el, 'keyboard-help-banner')).toBeNull();
    app.dispose();
  });

  it('web: not shown (the keyboard settings it explains are Android ones)', async () => {
    const { el, app } = await render('/');
    expect($(el, 'keyboard-help-banner')).toBeNull();
    app.dispose();
  });
});

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
