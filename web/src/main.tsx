import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from './App';
import { createAppController } from './app/appController';
import { loadBrowserContent } from './app/contentLoader';
import { handleBack } from './app/back';
import { createHashLocation } from './app/router';
import { appliedThemeKind, applyTheme, onThemeApplied, storedThemePrefs } from './app/theme';
import { getPlatform } from './platform';
import { db } from './storage/db';
import './ui/theme/index.css';

// Android background sync (BackgroundSyncWorker): a headless WebView loads index.html?kk-background-sync;
// it runs one sync (src/sync/background.ts) and nothing else.
const BACKGROUND_SYNC = new URLSearchParams(location.search).has('kk-background-sync');
if (BACKGROUND_SYNC) {
  void import('./sync/background').then((m) => m.runFromBridge());
} else {
  // Service worker only for the PWA; the Capacitor build serves files from the APK.
  if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
    void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  }

  // The Android WebView is resized by the keyboard (adjustResize), so the session layout needs no keyboard
  // allowance there (session.css).
  if (Capacitor.getPlatform() === 'android') document.documentElement.classList.add('kk-viewport-resizes');

  // Paint the remembered theme before anything else.
  applyTheme(storedThemePrefs());

  const app = createAppController({ db, platform: getPlatform, loadContent: loadBrowserContent });
  const location = createHashLocation();
  void app.start();

  // Android back button: dialogs and sessions first (useBackHandler), then the app's history; at the
  // first screen the platform moves the app to the background.
  // Android system bars follow the theme.
  void getPlatform().then((p) => {
    p.lifecycle?.onBackButton?.(() => handleBack(() => location.back()));
    if (p.systemBars) {
      const bars = p.systemBars;
      onThemeApplied((kind) => void bars.setTheme(kind).catch(() => undefined));
      void bars.setTheme(appliedThemeKind()).catch(() => undefined);
    }
  });

  const root = document.getElementById('root');
  if (!root) throw new Error('#root missing');
  createRoot(root).render(
    <StrictMode>
      <App app={app} location={location} />
    </StrictMode>,
  );
}
