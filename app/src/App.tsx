/**
 * The React root: binds the app controller and the router location to the UI shell, and keeps the
 * theme in sync with the stored choice and the system setting.
 */
import { useEffect } from 'react';
import type { AppController } from './app/appController';
import type { HashLocation } from './app/router';
import { appearanceFrom, applyAppearance, applySlideAnimations, applyTheme, isThemePrefKey, storedThemePrefs, themePrefsFrom } from './app/theme';
import { TEXT_SIZE_KEY, UI_FONT_KEY } from './ui/theme/appearance';
import { setAnswerKeyboardPrefs } from './platform/answerKeyboard';
import { AppProvider, useAppState } from './ui/hooks/useApp';
import { RouterProvider } from './ui/hooks/useRoute';
import { AppShell } from './ui/shell/AppShell';

/**
 * Light / Dark Theme and their customisations (app/theme.ts), re-applied when the system switches; the
 * slide animations, text size and font.
 */
function ThemeSync() {
  const state = useAppState();
  const prefs = state.prefs;
  // Until the settings are loaded, the theme painted from localStorage (main.tsx) stays.
  const loaded = state.status.kind === 'ready';
  const key = loaded ? JSON.stringify(Object.keys(prefs).filter(isThemePrefKey).sort().map((k) => [k, prefs[k]])) : null;
  const slide = prefs.slide_animations;
  useEffect(() => {
    const p = key === null ? storedThemePrefs() : themePrefsFrom(Object.fromEntries(JSON.parse(key) as [string, unknown][]));
    if (key !== null) applyTheme(p);
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(p);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [key]);
  useEffect(() => applySlideAnimations({ slide_animations: slide }), [slide]);
  // Text size and font (ui/theme/appearance.ts); until the settings are loaded, main.tsx's remembered ones stay.
  const textSize = prefs[TEXT_SIZE_KEY];
  const font = prefs[UI_FONT_KEY];
  useEffect(() => {
    if (loaded) applyAppearance(appearanceFrom({ [TEXT_SIZE_KEY]: textSize, [UI_FONT_KEY]: font }));
  }, [loaded, textSize, font]);
  // Keyboard input settings for the Android answer field's IME flags (platform/answerKeyboard.ts).
  useEffect(() => setAnswerKeyboardPrefs(prefs), [prefs]);
  return null;
}

export function App({ app, location }: { app: AppController; location: HashLocation }) {
  return (
    <AppProvider app={app}>
      <RouterProvider location={location}>
        <ThemeSync />
        <AppShell />
      </RouterProvider>
    </AppProvider>
  );
}
