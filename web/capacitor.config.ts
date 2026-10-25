import type { CapacitorConfig } from '@capacitor/cli';

// Side-by-side identity until the cutover (issue #3, step 6 preconditions): installs as
// app.kanjikodama.wk.web next to the Java app (app.kanjikodama.wk / .debug) without touching its
// data. The Gradle applicationId is app.kanjikodama.wk plus the ".web" suffix (android/app/build.gradle).
// Step 6 ("Same identity"): appId 'app.kanjikodama.wk' and drop the release suffix there.
const config: CapacitorConfig = {
  appId: 'app.kanjikodama.wk.web',
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
      // Status-bar icon of the Java app (durtles/tools/make_logo.py → res/drawable/ic_stat_name.xml).
      smallIcon: 'ic_stat_name',
    },
  },
};

export default config;
