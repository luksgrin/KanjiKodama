/**
 * Home-screen install for the web build, without user-agent sniffing:
 * - "standalone": the app already runs from the home screen (`display-mode: standalone`, or iOS
 *   Safari's `navigator.standalone`);
 * - Chromium browsers fire `beforeinstallprompt`: we keep the event and offer an Install button;
 * - the manual steps are always listed: iOS Safari (Share → Add to Home Screen, no install API),
 *   Chrome's menu, Samsung Internet / Firefox "Add to Home screen".
 * The web build is the one without automatic backups (`capabilities.autoBackup`), the same test the
 * known limitations use.
 */
import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'react';
import type { Capabilities } from '../../../platform';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

/** The setting that remembers a dismissed install hint. */
export const INSTALL_HINT_DISMISSED_KEY = 'kk_install_hint_dismissed';

/** Manual steps per browser family (shown as a list; no user-agent sniffing, so all are shown). */
export const INSTALL_STEPS: readonly string[] = [
  'iPhone or iPad: open this page in Safari, tap Share, then Add to Home Screen.',
  'Android, Chrome: tap Install app below when it shows, or open the ⋮ menu and choose Install app (or Add to Home screen).',
  'Android, Samsung Internet or Firefox: open the menu and choose Add page to / Add to Home screen.',
];

/**
 * The Android app (APK) of the same release as this web build, from the GitHub release the release
 * workflow publishes (`v<version>/kanjikodama-<version>.apk`), so the two always match.
 */
export function androidApkUrl(version: string): string {
  return `https://github.com/luksgrin/KanjiKodama/releases/download/v${version}/kanjikodama-${version}.apk`;
}

export const ANDROID_APP_TEXT = 'On Android you can also install the app itself: it adds the home-screen widget, review notifications and automatic backups.';

export const INSTALL_BENEFIT = 'Installed, the web app opens full screen, works offline and its storage is less likely to be cleared.';

/** The PWA (not the Capacitor build). */
export function isWebBuild(c: Capabilities): boolean {
  return !c.autoBackup && !Capacitor.isNativePlatform();
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}

/** `{standalone, canPrompt, prompt}` for the install UI; re-renders when the browser offers or drops the prompt. */
export function useInstall(): { standalone: boolean; canPrompt: boolean; prompt: () => Promise<void> } {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return {
    standalone: isStandalone(),
    canPrompt: deferred !== null,
    prompt: async () => {
      const e = deferred;
      if (!e) return;
      deferred = null;
      await e.prompt();
      listeners.forEach((l) => l());
    },
  };
}
