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
