// Glue for the screens: plan and schedule the review notifications in one call. Call it after each
// session, on pause (lifecycle.onPause), on resume and after a sync in server mode (counts change).
import { enableNotifications, planReviewNotifications, planWidget, type ReviewNotificationOptions } from '../core/notifications';
import type { LearnerDb } from '../core/progression';
import type { Preferences } from '../core/settings';
import type { NotificationsApi } from './index';

const pref = (prefs: Preferences, key: string, def: string, allowed: readonly string[]): string => {
  const v = prefs[key];
  return typeof v === 'string' && allowed.includes(v) ? v : def;
};

/**
 * `notification_update_frequency` / `getNotificationPriority` /
 * `getNotificationCategory` (enum values; an unknown value falls back to the default).
 */
export function notificationStyle(prefs: Preferences): { frequency: string; priority: string; category: string } {
  return {
    frequency: pref(prefs, 'notification_update_frequency', 'ONLY_NEW_REVIEWS', ['ONLY_NEW_REVIEWS', 'ONCE_PER_HOUR', 'CONTINUOUSLY']),
    priority: pref(prefs, 'notification_priority', 'DEFAULT', ['MIN', 'LOW', 'DEFAULT', 'HIGH', 'MAX']),
    category: pref(prefs, 'notification_category', 'RECOMMENDATION', [
      'CALL', 'NAVIGATION', 'MESSAGE', 'EMAIL', 'EVENT', 'PROMO', 'ALARM', 'PROGRESS', 'SOCIAL', 'ERROR', 'TRANSPORT',
      'SYSTEM', 'SERVICE', 'REMINDER', 'RECOMMENDATION', 'STATUS',
    ]),
  };
}

/**
 * Replace the scheduled review notifications with the plan at `now`, or cancel them when the user
 * turned notifications off (`enable_notifications`). No-op on the web build. Resolves with the
 * number scheduled; never prompts for permission (do that from a user action with requestPermission).
 */
export async function rescheduleReviewNotifications(
  api: NotificationsApi,
  db: LearnerDb,
  prefs: Preferences,
  now: number = Date.now(),
  options: ReviewNotificationOptions = {},
): Promise<number> {
  if (!api.supported) return 0;
  if (!enableNotifications(prefs)) {
    await api.cancelAll();
    return 0;
  }
  const counts = planWidget(db, now, { ...(options.maxLevel === undefined ? {} : { maxLevel: options.maxLevel }), cap: 0 });
  return api.scheduleReviews(planReviewNotifications(db, now, options), {
    now, current: { lessons: counts.lessons, reviews: counts.reviews }, style: notificationStyle(prefs),
  });
}
