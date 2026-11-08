// The review notification on Android, through the app's own `ReviewNotifications` plugin
// (app/android/.../ReviewNotifications.java). Loaded only in the native build (android.ts). Planning
// is pure: core/notifications/plan.ts.
//
// Like the Java app (services/NotificationWorker) there is ONE notification (id 1), posted or updated
// at the planned review hours by a native inexact alarm, so several review hours without opening the
// app never pile up notifications. Channel "NewReviewsChannel" only (the old plugin's "Default"
// channel is deleted), public on the lock screen, sound on new reviews; priority, category and when
// a shown notification is updated follow the Notification settings (`style`).
import { registerPlugin } from '@capacitor/core';
import { MAX_REVIEW_NOTIFICATIONS, reviewNotificationText, type ReviewTime } from '../core/notifications';
import type { NotificationPermission, NotificationsApi, ReviewScheduleOptions } from './index';

type PermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale';

export interface PlannedNotification {
  /** When the alarm posts it (a top of the hour, epoch ms). */
  at: number;
  title: string;
  body: string;
  /** The counts it shows (the update frequency compares them). */
  lessons?: number;
  reviews?: number;
}

export interface ReviewNotificationsPlugin {
  permission(): Promise<{ display: PermissionState }>;
  /** Android 13+: the system prompt while the answer is open. */
  request(): Promise<{ display: PermissionState }>;
  /**
   * Store the plan and arm the alarm for its first entry. `current`: the counts now, to update a
   * shown notification silently (or cancel it when both are 0); null leaves it alone.
   */
  schedule(options: {
    entries: PlannedNotification[];
    current: (PlannedNotification & { lessons: number; reviews: number }) | null;
    /** `notification_update_frequency` / `_priority` / `_category`; Java's defaults when absent. */
    style?: { frequency: string; priority: string; category: string };
  }): Promise<{ scheduled: number }>;
  /** Forget the plan, cancel the alarm and the shown notification. */
  cancelAll(): Promise<void>;
}

export const ReviewNotifications = registerPlugin<ReviewNotificationsPlugin>('ReviewNotifications');

function mapPermission(state: PermissionState): NotificationPermission {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}

export function createAndroidNotifications(plugin: ReviewNotificationsPlugin = ReviewNotifications): NotificationsApi {
  const permission = async (): Promise<NotificationPermission> => mapPermission((await plugin.permission()).display);

  /**
   * Android 13+ asks with the system dialog (POST_NOTIFICATIONS). After two refusals Android stops
   * showing it ('denied'): the UI then points to the app's system settings. Below Android 13
   * notifications are allowed unless the user turned them off in settings.
   */
  const requestPermission = async (): Promise<boolean> => {
    const current = await permission();
    if (current === 'granted') return true;
    if (current === 'denied') return false;
    return mapPermission((await plugin.request()).display) === 'granted';
  };

  const cancelAll = (): Promise<void> => plugin.cancelAll();

  const scheduleReviews = async (times: readonly ReviewTime[], opts: ReviewScheduleOptions = {}): Promise<number> => {
    const now = opts.now ?? Date.now();
    // Never prompt from here (it runs on pause and after sessions): without permission only cancel.
    if ((await permission()) !== 'granted') {
      await plugin.cancelAll();
      return 0;
    }
    const entries = times.filter((t) => t.at > now).slice(0, MAX_REVIEW_NOTIFICATIONS).map((t) => ({ at: t.at, lessons: t.lessons, reviews: t.totalReviews, ...reviewNotificationText(t) }));
    const c = opts.current;
    const current = c ? { at: now, lessons: c.lessons, reviews: c.reviews, ...reviewNotificationText({ lessons: c.lessons, totalReviews: c.reviews }) } : null;
    await plugin.schedule({ entries, current, ...(opts.style ? { style: opts.style } : {}) });
    return entries.length;
  };

  /** @deprecated The spike's test button: one notification at `at`, prompting if needed. */
  const schedule = async (at: Date, title: string, body: string): Promise<void> => {
    if (!(await requestPermission())) throw new Error('Notification permission denied');
    await plugin.schedule({ entries: [{ at: at.getTime(), title, body }], current: null });
  };

  return { supported: true, permission, requestPermission, scheduleReviews, cancelAll, schedule };
}

export const androidNotifications: NotificationsApi = createAndroidNotifications();
