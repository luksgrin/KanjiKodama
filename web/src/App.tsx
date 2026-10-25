/**
 * The React root: binds the app controller and the router location to the UI shell, and keeps the
 * theme in sync with the stored choice and the system setting.
 */
import { useEffect } from 'react';
import type { AppController } from './app/appController';
import type { HashLocation } from './app/router';
import { THEME_PREF_KEY, applyTheme, parseThemeChoice } from './app/theme';
import { AppProvider, useAppState } from './ui/hooks/useApp';
import { RouterProvider } from './ui/hooks/useRoute';
import { AppShell } from './ui/shell/AppShell';

function ThemeSync() {
  const pref = useAppState().prefs[THEME_PREF_KEY];
  useEffect(() => {
    const choice = parseThemeChoice(pref);
    if (pref !== undefined) applyTheme(choice);
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(choice);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);
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
