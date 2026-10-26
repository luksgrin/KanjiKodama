/**
 * Known limitations per build (plan, "Known limitations"). Each applies when the platform lacks the
 * capability; on Android none apply and `ANDROID_NOTE` is shown instead.
 */
import type { Capabilities } from '../../../platform';

export interface Limitation {
  title: string;
  text: string;
  applies(c: Capabilities): boolean;
}

export const LIMITATIONS: readonly Limitation[] = [
  {
    title: 'No review notifications.',
    text: "Web apps can't schedule local notifications. Web Push works for home-screen apps on iOS 16.4+, but it needs a server to send the pushes, which we don't run. The dashboard shows the next review time instead.",
    applies: (c) => !c.notifications,
  },
  {
    title: 'Audio needs a connection.',
    text: "Audio plays only while online; it can't be downloaded for offline use.",
    applies: (c) => !c.audioDownload,
  },
  {
    title: 'Storage can be cleared.',
    text: "The web app asks the browser for persistent storage (on iPhone a home-screen app also keeps its data apart from Safari's). Even so, removing the home-screen app, clearing website data, or the system running low on storage can delete progress. Back up regularly (Settings → Progress → Save).",
    applies: (c) => !c.autoBackup,
  },
  {
    title: 'No background work.',
    text: 'Nothing runs while the app is closed: no background sync. Review counts update only while the app is open.',
    applies: (c) => !c.notifications && !c.backgroundSync,
  },
  {
    title: 'Server mode needs an https:// server.',
    text: "An https app can't call http:// servers (mixed content), so LAN servers without TLS don't work here.",
    applies: (c) => !c.cleartextHttp,
  },
  {
    title: 'Install is manual.',
    text: 'The web app is installed from the browser: on iPhone in Safari, Share → Add to Home Screen; on Android, the browser menu\'s Install app / Add to Home screen. See Settings → About.',
    applies: (c) => !c.autoBackup,
  },
];

export const ANDROID_NOTE =
  'No known limitations in this build. Progress lives in the app\'s private storage: it survives app updates and is lost only by "Clear storage" or uninstall; the automatic backup after each session covers that case.';

export function limitationsFor(c: Capabilities): Limitation[] {
  return LIMITATIONS.filter((l) => l.applies(c));
}
