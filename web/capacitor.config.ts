import type { CapacitorConfig } from '@capacitor/cli';

// Spike build: separate applicationId so it installs next to the existing
// debug app (app.kanjikodama.wk.debug) without touching its data.
const config: CapacitorConfig = {
  appId: 'app.kanjikodama.spike',
  appName: 'KanjiKodama Spike',
  webDir: 'dist',
  android: {
    // Content is served from https://localhost inside the WebView (Capacitor default).
    allowMixedContent: false,
  },
};

export default config;
