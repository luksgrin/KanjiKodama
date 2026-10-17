import type { FilesApi, NotificationsApi, Platform, StorageApi } from './index';

const notifications: NotificationsApi = {
  supported: false,
  requestPermission: () => Promise.resolve(false),
  schedule: () => Promise.reject(new Error('Notifications are not supported in the web build')),
  cancelAll: () => Promise.resolve(),
};

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/** Share sheet with a file where available (iOS Safari: lets the user "Save to Files"), else a download. */
async function saveText(name: string, text: string): Promise<void> {
  const file = new File([text], name, { type: 'application/json' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if (isAbort(e)) return; // user closed the share sheet
      // NotAllowedError etc.: fall back to a plain download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Open a text file through a hidden <input type=file>. Shared with android.ts (works in the WebView). */
export function openTextViaInput(accept = '.json,application/json,text/plain'): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const finish = (value: string | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      input.remove();
      if (error !== undefined) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      file.text().then((t) => finish(t), (e: unknown) => finish(null, e));
    });
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

const files: FilesApi = { saveText, openText: () => openTextViaInput() };

const storage: StorageApi = {
  async persist() {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return navigator.storage.persist();
  },
};

export const webPlatform: Platform = { name: 'web', notifications, files, storage };
