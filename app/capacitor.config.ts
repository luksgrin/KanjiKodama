import type { CapacitorConfig } from '@capacitor/cli';

// The app's id. The Gradle build types set the installed id: release app.kanjikodama.wk, debug
// app.kanjikodama.wk.debug, and app.kanjikodama.wk.web for both with -PsideBySide
// (android/app/build.gradle).
const config: CapacitorConfig = {
  appId: 'app.kanjikodama.wk',
  appName: 'KanjiKodama',
  webDir: 'dist',
  android: {
    // Content is served from https://localhost inside the WebView (Capacitor default).
    allowMixedContent: false,
  },
  plugins: {
    // Edge-to-edge (targetSdk 36 enforces it on Android 15+): Capacitor keeps the WebView inside
    // the system bars unless the page sets viewport-fit=cover, and always injects the insets as
    // --safe-area-inset-* CSS variables. Bar icon colour follows the theme (platform.systemBars).
    SystemBars: {
      insetsHandling: 'css',
      style: 'DEFAULT',
    },
    LocalNotifications: {
      // Status-bar icon (tools/make_logo.py → res/drawable/ic_stat_name.xml).
      smallIcon: 'ic_stat_name',
    },
  },
};

export default config;
