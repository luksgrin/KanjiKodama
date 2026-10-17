// Android (Capacitor) implementation of the platform interface.
// Loaded only when Capacitor.isNativePlatform() is true (see ./index.ts).
import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { FilesApi, NotificationsApi, Platform, StorageApi } from './index';
import { openTextViaInput } from './web';

/**
 * Minimal native plugin in web/android (DocumentPlugin.java) wrapping the
 * Storage Access Framework: ACTION_CREATE_DOCUMENT / ACTION_OPEN_DOCUMENT.
 * The system picker lists Drive, Downloads and other document providers.
 */
interface DocumentPlugin {
  save(options: { filename: string; text: string; mimeType?: string }): Promise<{ saved: boolean; uri?: string }>;
  open(options?: { mimeTypes?: string[] }): Promise<{ text?: string; name?: string; cancelled: boolean }>;
}
const Document = registerPlugin<DocumentPlugin>('Document');

const NOTIFICATION_ID = 1;

const notifications: NotificationsApi = {
  supported: true,
  async requestPermission(): Promise<boolean> {
    let status = await LocalNotifications.checkPermissions();
    if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
      status = await LocalNotifications.requestPermissions();
    }
    return status.display === 'granted';
  },
  async schedule(at: Date, title: string, body: string): Promise<void> {
    if (!(await notifications.requestPermission())) {
      throw new Error('Notification permission denied');
    }
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title,
          body,
          // Inexact on purpose: isExactNotification defaults to true, and on API 33+
          // SCHEDULE_EXACT_ALARM is denied by default, so the plugin would open the
          // "Alarms & reminders" settings screen on every schedule. With false +
          // allowWhileIdle it calls AlarmManager.setAndAllowWhileIdle(RTC_WAKEUP),
          // the same call the current Kotlin app uses. Review reminders need no exactness.
          schedule: { at, allowWhileIdle: true },
          isExactNotification: false,
        },
      ],
    });
  },
  async cancelAll(): Promise<void> {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
  },
};

const files: FilesApi = {
  async saveText(name: string, text: string): Promise<void> {
    // Resolves on success and on user cancel (interface contract); write errors reject.
    await Document.save({ filename: name, text, mimeType: 'application/json' });
  },
  async openText(): Promise<string | null> {
    try {
      const result = await Document.open({ mimeTypes: ['application/json', 'text/plain', 'application/octet-stream'] });
      return result.cancelled ? null : (result.text ?? null);
    } catch (err) {
      // Native plugin missing (e.g. stale APK): fall back to <input type=file>,
      // which Capacitor's WebChromeClient routes to the system picker.
      if (err instanceof Error && /not implemented/i.test(err.message)) {
        return openTextViaInput();
      }
      throw err;
    }
  },
};

const storage: StorageApi = {
  async persist(): Promise<boolean> {
    if (!navigator.storage?.persist) return false;
    return navigator.storage.persist();
  },
};

export const androidPlatform: Platform = {
  name: 'android',
  notifications,
  files,
  storage,
};
