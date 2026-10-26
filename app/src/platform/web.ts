import type { Capabilities, FilesApi, HapticsApi, LifecycleApi, NotificationsApi, OpenedText, Platform, SaveResult } from './index';
import { browserStorage } from './browserStorage';
import { fetchHttp } from './http';
import { webAudio } from './webAudio';
import { webSecrets } from './webSecrets';

const capabilities: Capabilities = {
  notifications: false,
  audio: false,
  audioPlayback: true, // streamed, online only (webAudio.ts)
  audioDownload: false,
  haptics: false,
  backgroundSync: false,
  widget: false,
  cleartextHttp: false,
  legacyMigration: false,
  autoBackup: false,
};

// Known limitations of the PWA: no review notifications (the dashboard shows the next review time),
// audio only streamed while online (no download: WaniKani's audio host sends no CORS headers), no haptics (iOS Safari has no vibrate).
const notifications: NotificationsApi = {
  supported: false,
  permission: () => Promise.resolve('denied'),
  requestPermission: () => Promise.resolve(false),
  scheduleReviews: () => Promise.resolve(0),
  cancelAll: () => Promise.resolve(),
  schedule: () => Promise.reject(new Error('Notifications are not supported in the web build')),
};


const haptics: HapticsApi = { supported: false, feedback: () => undefined };

/** Page visibility: hidden when the tab/app goes to the background, visible when it comes back. */
function onVisibility(state: DocumentVisibilityState, cb: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const listener = () => {
    if (document.visibilityState === state) cb();
  };
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

export const webLifecycle: LifecycleApi = {
  onResume: (cb) => onVisibility('visible', cb),
  onPause: (cb) => onVisibility('hidden', cb),
};

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

/** Save through a Blob URL and an <a download> click. No way to know whether the user kept it. */
export function downloadText(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Share sheet with a file where available (iOS Safari: Save to Files, iCloud Drive, Google Drive
 * app), else a download. Must be called from a user gesture (share() needs transient activation).
 */
export async function saveText(name: string, text: string): Promise<SaveResult> {
  const type = 'application/json';
  const nav = globalThis.navigator as Navigator | undefined;
  if (typeof nav?.canShare === 'function' && typeof nav.share === 'function' && typeof File === 'function') {
    const file = new File([text], name, { type });
    let canShare = false;
    try {
      canShare = nav.canShare({ files: [file] });
    } catch {
      canShare = false;
    }
    if (canShare) {
      try {
        await nav.share({ files: [file], title: name });
        return 'saved';
      } catch (e) {
        if (isAbort(e)) return 'cancelled'; // user closed the share sheet
        // NotAllowedError (lost user activation), DataError etc.: fall back to a download.
      }
    }
  }
  downloadText(name, text, type);
  return 'saved';
}

/** Open a text file through a hidden <input type=file>. Shared with android.ts (works in the WebView). */
export function openTextViaInput(accept = '.json,application/json,text/plain'): Promise<OpenedText | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const finish = (value: OpenedText | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      input.remove();
      if (error !== undefined) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      file.text().then((text) => finish({ name: file.name, text }), (e: unknown) => finish(null, e ?? new Error('read failed')));
    });
    // 'cancel' fires in current Chrome/Safari/Firefox; older browsers never settle on cancel.
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

const files: FilesApi = { saveText, openText: () => openTextViaInput() };

export const webPlatform: Platform = {
  name: 'web',
  capabilities,
  notifications,
  audio: webAudio,
  haptics,
  lifecycle: webLifecycle,
  files,
  storage: browserStorage,
  http: fetchHttp,
  secrets: webSecrets,
};
