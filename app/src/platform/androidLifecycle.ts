// Android app lifecycle (@capacitor/app), back button, haptics and system bars.
import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import type { HapticKind, HapticsApi, LifecycleApi, SystemBarsApi } from './index';
import { resyncAndroidSystemUi, startAndroidSystemUi } from './androidSystemUi';

type Unsubscribe = () => void;

/** addListener resolves a handle asynchronously; unsubscribing before that still removes it. */
function listen(event: 'resume' | 'pause', cb: () => void): Unsubscribe {
  let removed = false;
  const fire = () => {
    if (!removed) cb();
  };
  const handle = event === 'resume' ? App.addListener('resume', fire) : App.addListener('pause', fire);
  return () => {
    removed = true;
    void handle.then((h) => h.remove());
  };
}

// Back button: one native listener (registering it turns off Capacitor's default handling),
// handlers newest first.
const backHandlers: (() => boolean)[] = [];
let backListener: Promise<{ remove(): Promise<void> }> | undefined;

/** Runs the handlers; when none handles it, history back or move the app to the background. */
export function dispatchBackButton(canGoBack: boolean): 'handled' | 'history' | 'minimized' {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    if (backHandlers[i]!()) return 'handled';
  }
  if (canGoBack) {
    window.history.back();
    return 'history';
  }
  // Like the Java app's back on the main screen (Android 12+ moves a root activity to the
  // background instead of finishing it): the state stays as it is.
  void App.minimizeApp();
  return 'minimized';
}

function onBackButton(cb: () => boolean): Unsubscribe {
  backHandlers.push(cb);
  backListener ??= App.addListener('backButton', (e) => {
    dispatchBackButton(e.canGoBack);
  });
  return () => {
    const i = backHandlers.lastIndexOf(cb);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

export const androidLifecycle: LifecycleApi = {
  onResume: (cb) => listen('resume', cb),
  onPause: (cb) => listen('pause', cb),
  onBackButton,
};

/**
 * `util/HapticUtil`. On Android 11+ Java uses View.performHapticFeedback(CONFIRM / REJECT); below,
 * a one-shot vibration of 100 ms (correct), 300 ms (wrong), 200 ms (retry). The WebView's
 * navigator.vibrate (VIBRATE permission in the manifest) gives the latter on every version, so no
 * haptics plugin is needed. Both Java settings are off by default.
 */
const VIBRATE_MS: Record<HapticKind, number> = { correct: 100, wrong: 300, retry: 200, tap: 20 };

export const androidHaptics: HapticsApi = {
  get supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  },
  feedback(kind: HapticKind): void {
    try {
      navigator.vibrate(VIBRATE_MS[kind]);
    } catch {
      // no vibrator / blocked before the first user gesture: feedback is optional
    }
  },
};

/**
 * Edge-to-edge is configured in capacitor.config.ts (SystemBars.insetsHandling 'css'). The bar
 * colours then follow what the page shows at its top and bottom edge (androidSystemUi.ts, started
 * by the first call, which main.tsx makes at start-up); setStyle resets them, so they are re-sent.
 */
export const androidSystemBars: SystemBarsApi = {
  async setTheme(theme): Promise<void> {
    // SystemBarsStyle.Dark = light icons for a dark background.
    const style = theme === 'dark' ? SystemBarsStyle.Dark : theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Default;
    startAndroidSystemUi();
    await SystemBars.setStyle({ style });
    resyncAndroidSystemUi();
  },
};

/** Tests only. */
export function resetBackButtonForTests(): void {
  backHandlers.length = 0;
  backListener = undefined;
}
