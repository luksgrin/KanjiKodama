import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { App } from './App';
import { createAppController } from './app/appController';
import { loadBrowserContent } from './app/contentLoader';
import { handleBack } from './app/back';
import { createHashLocation } from './app/router';
import { applyTheme, onThemeApplied, storedThemeChoice } from './app/theme';
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

  // Paint the remembered theme before anything else.
  applyTheme(storedThemeChoice());

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
      onThemeApplied((choice) => void bars.setTheme(choice).catch(() => undefined));
      void bars.setTheme(storedThemeChoice()).catch(() => undefined);
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
