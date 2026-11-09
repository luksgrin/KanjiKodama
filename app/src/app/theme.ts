/**
 * The theme: the Light Theme (`theme`)
 * while the system is light, the Dark Theme (`nightTheme`) while it is dark, plus that theme's
 * customised colours (`theme_customizations_<THEME>`). `ui/theme/themes.ts` has the themes and puts
 * them on <html> (`data-theme`, `data-kk-theme`, inline tokens). The choice is mirrored in
 * localStorage so the next start paints the right theme before the database is open. The status
 * bar / browser UI colour follows the toolbar.
 *
 * Also `slide_animations` (Display settings): `data-slide-animations="off"` on <html> stops the
 * session question slides (`.kk-slide-rtl` / `.kk-slide-ltr`, ui/theme/base.css).
 *
 * And the text size and font (`text_size`, `ui_font`; ui/theme/appearance.ts): `data-text-size` and
 * `data-ui-font` on <html>, mirrored in localStorage like the theme.
 */
import {
  DARK_THEME_KEY,
  LIGHT_THEME_KEY,
  applyThemeTokens,
  customizationKey,
  themePrefsFrom,
  toolbarColor,
  type ThemePrefs,
} from '../ui/theme/themes';
import { DEFAULT_UI_FONT, textScale, uiFont, type UiFont } from '../ui/theme/appearance';

export type ThemeKind = 'light' | 'dark';
export type { ThemePrefs };

/** The `settings` keys that change the theme. */
export function isThemePrefKey(key: string): boolean {
  return key === LIGHT_THEME_KEY || key === DARK_THEME_KEY || key.startsWith('theme_customizations_');
}
export { LIGHT_THEME_KEY, DARK_THEME_KEY, customizationKey, themePrefsFrom };

const STORAGE_KEY = 'kk-theme';
const SLIDE_KEY = 'slide_animations';

export function storedThemePrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object') return themePrefsFrom(v as Record<string, unknown>);
  } catch {
    // unreadable: the defaults
  }
  return themePrefsFrom({});
}

/** Called after every theme change with the AppCompat kind of the active theme (Android: system bar icons). */
let onApplied: ((kind: ThemeKind) => void) | null = null;
export function onThemeApplied(cb: ((kind: ThemeKind) => void) | null): void {
  onApplied = cb;
}

let lastKind: ThemeKind = 'light';
export function appliedThemeKind(): ThemeKind {
  return lastKind;
}

export function applyTheme(p: ThemePrefs): ThemeKind {
  const t = applyThemeTokens(p);
  try {
    const stored: Record<string, string> = { [LIGHT_THEME_KEY]: p.light, [DARK_THEME_KEY]: p.dark };
    for (const [id, v] of Object.entries(p.customizations)) if (v !== undefined) stored[customizationKey(id as never)] = v;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // private mode: the setting still applies for this session
  }
  const color = toolbarColor(t);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.removeAttribute('media');
    meta.content = color;
  }
  lastKind = t.kind;
  onApplied?.(t.kind);
  return t.kind;
}

/** The `slide_animations` setting (default on). */
export function applySlideAnimations(prefs: Readonly<Record<string, unknown>>): void {
  const on = prefs[SLIDE_KEY] !== false;
  const root = document.documentElement;
  if (on) root.removeAttribute('data-slide-animations');
  else root.setAttribute('data-slide-animations', 'off');
}

const APPEARANCE_KEY = 'kk-appearance';

export interface Appearance {
  /** `text_size` as a factor. */
  scale: number;
  font: UiFont;
}

export function appearanceFrom(prefs: Readonly<Record<string, unknown>>): Appearance {
  return { scale: textScale(prefs), font: uiFont(prefs) };
}

/** The text size and font remembered from the last run (the defaults when there is none). */
export function storedAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object') {
      const o = v as { text_size?: unknown; ui_font?: unknown };
      return appearanceFrom({ text_size: o.text_size, ui_font: o.ui_font });
    }
  } catch {
    // unreadable: the defaults
  }
  return appearanceFrom({});
}

/** Puts the text size (`data-text-size`, tokens.css turns it into --kk-ts) and the font (`data-ui-font`) on <html> and remembers them. */
export function applyAppearance(a: Appearance): void {
  const root = document.documentElement;
  const percent = String(Math.round(a.scale * 100));
  if (a.scale === 1) root.removeAttribute('data-text-size');
  else root.setAttribute('data-text-size', percent);
  if (a.font === DEFAULT_UI_FONT) root.removeAttribute('data-ui-font');
  else root.setAttribute('data-ui-font', a.font);
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ text_size: percent, ui_font: a.font }));
  } catch {
    // private mode: the setting still applies for this session
  }
}
