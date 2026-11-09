// @vitest-environment jsdom
// Text size and font (`text_size`, `ui_font`): the setting values, <html>'s attributes and the
// remembered copy, the AppearancePicker on its settings screen, and the CSS rules that keep every text
// size scalable and ligatures off.
import 'fake-indexeddb/auto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { appearanceFrom, applyAppearance, storedAppearance } from '../../src/app/theme';
import { createMemoryLocation } from '../../src/app/router';
import { DEFAULT_TEXT_SIZE, TEXT_SIZES, UI_FONTS, textScale, textSize, uiFont } from '../../src/ui/theme/appearance';
import { clearToasts } from '../../src/ui/shell/toast';
import { makeApp } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const html = document.documentElement;

beforeEach(() => {
  (globalThis as { matchMedia?: unknown }).matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  localStorage.clear();
  html.removeAttribute('data-text-size');
  html.removeAttribute('data-ui-font');
});

describe('the settings', () => {
  it('reads the size and font, unknown values as the defaults', () => {
    expect(textSize({})).toBe(DEFAULT_TEXT_SIZE);
    expect(textScale({})).toBe(1);
    expect(textScale({ text_size: '150' })).toBe(1.5);
    expect(textScale({ text_size: '85' })).toBe(0.85);
    expect(textScale({ text_size: '200' })).toBe(1);
    expect(textScale({ text_size: 150 })).toBe(1);
    expect(uiFont({})).toBe('PIXELIFY_SANS');
    expect(uiFont({ ui_font: 'DOTGOTHIC16' })).toBe('DOTGOTHIC16');
    expect(uiFont({ ui_font: 'COMIC_SANS' })).toBe('PIXELIFY_SANS');
  });

  it('offers 85 to 150 % and three fonts', () => {
    expect(TEXT_SIZES.map(([v]) => v)).toEqual(['85', '100', '115', '130', '150']);
    expect(UI_FONTS.map((f) => f.value)).toEqual(['PIXELIFY_SANS', 'DOTGOTHIC16', 'ZEN_MARU_GOTHIC']);
  });

  it('puts them on <html> and remembers them for the next start', () => {
    applyAppearance(appearanceFrom({ text_size: '130', ui_font: 'ZEN_MARU_GOTHIC' }));
    expect(html.dataset.textSize).toBe('130');
    expect(html.dataset.uiFont).toBe('ZEN_MARU_GOTHIC');
    expect(storedAppearance()).toEqual({ scale: 1.3, font: 'ZEN_MARU_GOTHIC' });
    applyAppearance(appearanceFrom({}));
    expect(html.dataset.textSize).toBeUndefined();
    expect(html.dataset.uiFont).toBeUndefined();
    expect(storedAppearance()).toEqual({ scale: 1, font: 'PIXELIFY_SANS' });
  });

  it('falls back to the defaults when nothing (or garbage) is remembered', () => {
    expect(storedAppearance()).toEqual({ scale: 1, font: 'PIXELIFY_SANS' });
    localStorage.setItem('kk-appearance', '{nope');
    expect(storedAppearance()).toEqual({ scale: 1, font: 'PIXELIFY_SANS' });
  });
});

describe('Display settings → Text size and font', () => {
  let root: Root | undefined;
  let container: HTMLElement | undefined;
  afterEach(() => {
    clearToasts();
    act(() => root?.unmount());
    container?.remove();
    root = undefined;
  });
  const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });
  const $ = (testId: string) => container!.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  async function click(el: HTMLElement | null) {
    if (!el) throw new Error('nothing to click');
    await act(async () => { el.click(); });
    await flush();
  }

  it('opens from Display settings; a pick is saved and applied at once', async () => {
    const h = makeApp();
    await h.app.start();
    container = document.createElement('div');
    document.body.append(container);
    const location = createMemoryLocation('/settings?screen=display_settings');
    await act(async () => {
      root = createRoot(container!);
      root.render(<App app={h.app} location={location} />);
    });
    await flush();
    expect($('setting-appearance')!.textContent).toContain('Bigger or smaller text, and an easier-to-read font');
    await click($('setting-appearance'));
    expect(location.get()).toBe('/settings?screen=appearance');
    expect($('appearance-preview')!.textContent).toBe('fins · 漢字 · Kanji meaning');
    expect($('text-size-100')!.getAttribute('aria-checked')).toBe('true');
    expect($('ui-font-PIXELIFY_SANS')!.getAttribute('aria-checked')).toBe('true');
    // Each size labelled at its own size, each font named in its own font.
    expect($('text-size-150')!.querySelector<HTMLElement>('.kk-appearance-choice-label')!.style.fontSize).toBe('24px');
    expect($('ui-font-DOTGOTHIC16')!.querySelector<HTMLElement>('.kk-appearance-choice-label')!.style.fontFamily).toContain('DotGothic16');

    await click($('text-size-150'));
    await click($('ui-font-DOTGOTHIC16'));
    expect(h.app.get().prefs.text_size).toBe('150');
    expect(h.app.get().prefs.ui_font).toBe('DOTGOTHIC16');
    expect(html.dataset.textSize).toBe('150');
    expect(html.dataset.uiFont).toBe('DOTGOTHIC16');
    expect($('text-size-150')!.getAttribute('aria-checked')).toBe('true');
    expect($('text-size-100')!.getAttribute('aria-checked')).toBe('false');

    await click($('text-size-100'));
    await click($('ui-font-PIXELIFY_SANS'));
    expect(html.dataset.textSize).toBeUndefined();
    expect(html.dataset.uiFont).toBeUndefined();
    h.app.dispose();
  });
});

describe('the CSS', () => {
  const src = join(process.cwd(), 'src');
  const cssFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
  const read = (p: string) => readFileSync(join(src, p), 'utf8');

  it('turns ligatures off on every element', () => {
    expect(read('ui/theme/base.css')).toContain('*, *::before, *::after { box-sizing: border-box; font-variant-ligatures: none; }');
  });

  it('maps every text size to a factor and every other font in every theme', () => {
    const tokens = read('ui/theme/tokens.css');
    for (const [v] of TEXT_SIZES.filter(([v]) => v !== '100')) {
      expect(tokens).toContain(`:root[data-text-size="${v}"] { --kk-ts: ${Number(v) / 100}; }`);
    }
    const block = (font: string) => tokens.slice(tokens.indexOf(`:root[data-ui-font="${font}"]`)).split('}')[0]!;
    for (const f of UI_FONTS.filter((f) => f.value !== 'PIXELIFY_SANS')) {
      expect(block(f.value)).toContain(`--font-body: ${f.family} !important;`);
    }
    // Zen Maru Gothic replaces Silkscreen too (toolbar, menus); DotGothic16 keeps it.
    expect(block('ZEN_MARU_GOTHIC')).toContain("--font-display: 'Zen Maru Gothic', var(--font-ja) !important;");
    expect(block('DOTGOTHIC16')).not.toContain('--font-display');
  });

  it('writes text sizes as calc(<px> * var(--kk-ts)), but for the fixed quiz parts and glyph tiles', () => {
    // [file, the rule's text] that keep a px size on purpose.
    const fixed = new Set([
      'ui/components/subject/subject.css: font-size: 64px;', // the item title tile (its inline size wins)
      'ui/components/subject/subject.css: .kk-link-chars { text-shadow: var(--text-shadow-3px-glyph); margin-top: 4px; font-size: 24px; line-height: 1; } /* a glyph: not scaled */',
      'ui/screens/browse/browse.css: font-size: 24px;', // browse card glyphs (fitted to the card), parts search's kanji in the bar
      'ui/screens/browse/browse.css: font-size: 22px;', // parts search: the part tiles (40 px glyph tiles)
      'ui/screens/onboarding/onboarding.css: font-size: 24px;', // the guide's subject-colour glyph swatches (48 px tall)
      'ui/screens/themeCustomization/themeCustomization.css: .kk-tc-cell.subject .kk-tc-sample { height: 38px; font-size: 26px; line-height: 38px; }',
      'ui/screens/dashboard/dashboard.css: font-size: 34px;', // SRS counts in their 84 px tiles
      'ui/screens/dashboard/dashboard.css: .kk-srs-count { font-size: 32px; line-height: 72px; }',
      'ui/screens/settings/fonts.css: .kk-font-sample-dialog { margin: 0; padding: 0 0 16px; /* the 16 dp top padding sits in the space the dialog keeps above a message */ text-align: center; font-family: var(--font-ja); font-size: 36px; }',
      'ui/theme/base.css: .kk-startup .kk-logo { font-family: var(--font-ja); font-size: 64px; line-height: 1; margin-bottom: var(--space-3); }',
    ]);
    const offenders: string[] = [];
    for (const file of cssFiles(src)) {
      const rel = relative(src, file);
      let text = readFileSync(file, 'utf8');
      // The quiz itself (question view, type banner, answer, quick actions, Anki bar) and the keyboard keeper.
      if (rel === 'ui/components/session/session.css') text = text.slice(text.indexOf('/* Session fragment slides')).replace(/\.kk-keyboard-keeper \{[^}]*\}/, '');
      for (const line of text.split('\n')) {
        if (/font-size: *\d+(\.\d+)?px/.test(line) && !fixed.has(`${rel}: ${line.trim()}`)) offenders.push(`${rel}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
