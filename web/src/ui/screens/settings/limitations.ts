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
    title: 'No audio.',
    text: "The Android app downloads WaniKani's audio from WaniKani's file server on demand. A web app can't cache those files for offline use (no CORS), and we don't host audio ourselves.",
    applies: (c) => !c.audio,
  },
  {
    title: 'Storage can be cleared.',
    text: "iOS keeps a home-screen app's data apart from Safari's, and the app asks for persistent storage. Even so, deleting the home-screen icon, clearing website data, or the system running low on storage can delete progress. Back up regularly (Settings → Progress → Save).",
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
    title: 'iOS install is manual.',
    text: 'In Safari: Share → Add to Home Screen.',
    applies: (c) => !c.autoBackup,
  },
];

export const ANDROID_NOTE =
  'No known limitations in this build. Progress lives in the app\'s private storage: it survives app updates and is lost only by "Clear storage" or uninstall; the automatic backup after each session covers that case.';

export function limitationsFor(c: Capabilities): Limitation[] {
  return LIMITATIONS.filter((l) => l.applies(c));
}
