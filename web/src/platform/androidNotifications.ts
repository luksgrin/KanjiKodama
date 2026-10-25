// Review notifications on Android through @capacitor/local-notifications.
// Loaded only in the native build (android.ts). Planning is pure: core/notifications/plan.ts.
import { LocalNotifications, type PermissionStatus } from '@capacitor/local-notifications';
import {
  MAX_REVIEW_NOTIFICATIONS,
  REVIEW_NOTIFICATION_CHANNEL,
  reviewNotificationText,
  type ReviewTime,
} from '../core/notifications';
import type { NotificationPermission, NotificationsApi } from './index';

/** Ids of the planned notifications: REVIEW_ID_BASE + index (index < MAX_REVIEW_NOTIFICATIONS). */
export const REVIEW_ID_BASE = 1000;
/** The spike's single test notification. */
const TEST_ID = 1;
/** `res/drawable/ic_stat_name.xml`, the Java app's status-bar icon (durtles/tools/make_logo.py). */
const SMALL_ICON = 'ic_stat_name';

function mapPermission(status: PermissionStatus): NotificationPermission {
  if (status.display === 'granted') return 'granted';
  if (status.display === 'denied') return 'denied';
  return 'prompt'; // 'prompt' | 'prompt-with-rationale'
}

let channelReady: Promise<void> | undefined;

/**
 * The Java app's channel: id and name "NewReviewsChannel", description "New reviews available",
 * importance DEFAULT (3, `notification_priority` default), public on the lock screen. Creating an
 * existing channel only updates its name and description, so this is safe on every start.
 */
function ensureChannel(): Promise<void> {
  channelReady ??= LocalNotifications.createChannel({
    id: REVIEW_NOTIFICATION_CHANNEL.id,
    name: REVIEW_NOTIFICATION_CHANNEL.name,
    description: REVIEW_NOTIFICATION_CHANNEL.description,
    importance: 3,
    visibility: 1,
  }).catch((err: unknown) => {
    channelReady = undefined; // retry next time
    throw err;
  });
  return channelReady;
}

async function permission(): Promise<NotificationPermission> {
  return mapPermission(await LocalNotifications.checkPermissions());
}

/**
 * Android 13+ asks with the system dialog (POST_NOTIFICATIONS, declared by the plugin). After two
 * refusals Android stops showing it ('denied'): the UI then points to the app's system settings.
 * Below Android 13 notifications are allowed unless the user turned them off in settings.
 */
async function requestPermission(): Promise<boolean> {
  const current = await permission();
  if (current === 'granted') return true;
  if (current === 'denied') return false;
  return mapPermission(await LocalNotifications.requestPermissions()) === 'granted';
}

/**
 * Inexact on purpose: isExactNotification defaults to true, and on API 33+ SCHEDULE_EXACT_ALARM is
 * denied by default (and removed from our manifest), so the plugin would open the "Alarms &
 * reminders" screen. With false + allowWhileIdle it calls AlarmManager.setAndAllowWhileIdle
 * (RTC_WAKEUP), the same call as the Java app's BackgroundAlarmReceiver.
 */
function schedule(at: number) {
  return { at: new Date(at), allowWhileIdle: true };
}

async function cancelAll(): Promise<void> {
  await LocalNotifications.cancelAll();
  // Shown notifications have stale counts once the app is open (Java cancels its notification when
  // nothing is left, and updates it otherwise).
  await LocalNotifications.removeAllDeliveredNotifications();
}

async function scheduleReviews(times: readonly ReviewTime[], now: number = Date.now()): Promise<number> {
  await cancelAll();
  const upcoming = times.filter((t) => t.at > now).slice(0, MAX_REVIEW_NOTIFICATIONS);
  if (upcoming.length === 0) return 0;
  // Never prompt from here (it runs on pause and after sessions); the plugin would reject anyway.
  if ((await permission()) !== 'granted') return 0;
  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: upcoming.map((t, i) => {
      const { title, body } = reviewNotificationText(t);
      return {
        id: REVIEW_ID_BASE + i,
        title,
        body,
        channelId: REVIEW_NOTIFICATION_CHANNEL.id,
        smallIcon: SMALL_ICON,
        autoCancel: true,
        schedule: schedule(t.at),
        isExactNotification: false,
        extra: { kind: 'reviews', at: t.at },
      };
    }),
  });
  return upcoming.length;
}

/** @deprecated The spike's test button (App.tsx): one notification at `at`, prompting if needed. */
async function scheduleTest(at: Date, title: string, body: string): Promise<void> {
  if (!(await requestPermission())) throw new Error('Notification permission denied');
  await ensureChannel();
  await LocalNotifications.cancel({ notifications: [{ id: TEST_ID }] });
  await LocalNotifications.schedule({
    notifications: [
      {
        id: TEST_ID,
        title,
        body,
        channelId: REVIEW_NOTIFICATION_CHANNEL.id,
        smallIcon: SMALL_ICON,
        schedule: schedule(at.getTime()),
        isExactNotification: false,
      },
    ],
  });
}

export const androidNotifications: NotificationsApi & {
  scheduleReviews(times: readonly ReviewTime[], now?: number): Promise<number>;
} = {
  supported: true,
  permission,
  requestPermission,
  scheduleReviews,
  cancelAll,
  schedule: scheduleTest,
};

/** Tests only: forget the created channel. */
export function resetChannelForTests(): void {
  channelReady = undefined;
}
