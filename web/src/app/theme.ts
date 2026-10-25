/**
 * Theme choice: follow the system, or force light / dark. Applied as `data-theme` on <html>
 * (`ui/theme/tokens.css` reads it) and mirrored in localStorage so the next start paints the right
 * theme before the database is open. The status bar / browser UI colour follows the toolbar.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** `settings` key of the theme choice. */
export const THEME_PREF_KEY = 'kk_theme';
const STORAGE_KEY = 'kk-theme';

/** Toolbar colours of Pixel Forest (`toolbarColorBackground`): light mmInkLight, dark mmWindowDark. */
const TOOLBAR = { light: '#2E4756', dark: '#1E3139' } as const;

export function parseThemeChoice(v: unknown): ThemeChoice {
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function storedThemeChoice(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function effectiveTheme(choice: ThemeChoice): 'light' | 'dark' {
  return choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice;
}

/** Called after every theme change (Android: system bar icon colours). */
let onApplied: ((choice: ThemeChoice) => void) | null = null;
export function onThemeApplied(cb: ((choice: ThemeChoice) => void) | null): void {
  onApplied = cb;
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // private mode: the setting still applies for this session
  }
  const color = TOOLBAR[effectiveTheme(choice)];
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.removeAttribute('media');
    meta.content = color;
  }
  onApplied?.(choice);
}
