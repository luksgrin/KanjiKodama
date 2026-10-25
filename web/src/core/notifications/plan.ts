/**
 * Review notifications, planned ahead. The Java app wakes up at the top of every hour
 * (`services/BackgroundAlarmReceiver`, `AlarmManager.setAndAllowWhileIdle`) and lets
 * `services/NotificationWorker` post when the newest available review got newer (the default
 * `notification_update_frequency` ONLY_NEW_REVIEWS), with the counts of
 * `SubjectAggregatesDao.getAlertContext(maxLevel, now)`.
 *
 * The Capacitor app can't run code every hour, so it schedules those posts in advance (after each
 * session, on pause, on resume): one notification per future hour in which reviews become
 * available, carrying the counts at that hour, for the next 7 days, at most 64.
 *
 * Times are epoch ms and hours are `topOfHour` hours (UTC-aligned, like Java's
 * `ObjectSupport.getTopOfHour`), so daylight saving changes don't move anything; in a time zone
 * with a half-hour offset the notification comes at :30 local time, as in the Java app.
 */

import { availableLessonIds, LOCAL_MAX_LEVEL_GRANTED } from '../dashboard/timeLine';
import { progressRow, type LearnerDb } from '../progression';
import { prefBoolean, type Preferences } from '../settings';
import { DAY, HOUR, topOfHour } from '../time';

/** One planned notification (the platform layer's `ReviewTime`). */
export interface ReviewTime {
  /** When to post it: a top of the hour, epoch ms, always after `now`. */
  at: number;
  /** Reviews that become available in this hour. */
  newReviews: number;
  /** All reviews available at `at` (what the notification says). */
  totalReviews: number;
  /** Available lessons (lessons don't become available with time, so the same for every entry). */
  lessons: number;
}

/** How far ahead to plan. */
export const REVIEW_NOTIFICATION_WINDOW = 7 * DAY;
/** At most this many pending notifications (Android keeps every alarm; keep the list small). */
export const MAX_REVIEW_NOTIFICATIONS = 64;

export interface ReviewNotificationOptions {
  /** `PropertiesDao.getUserMaxLevelGranted` (60 in local mode). */
  maxLevel?: number;
  /** `PropertiesDao.getVacationMode`: nothing to notify. */
  vacationMode?: boolean;
  /** Defaults to `REVIEW_NOTIFICATION_WINDOW`. */
  window?: number;
  /** Defaults to `MAX_REVIEW_NOTIFICATIONS`. */
  cap?: number;
}

/** `GlobalSettings.Other.getEnableNotifications`: `enable_notifications`, default true. */
export function enableNotifications(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_notifications', true);
}

/**
 * The hour whose alarm first counts a review available at `availableAt`: Java counts
 * `availableAt < now` with `now` just after the top of the hour, so an on-the-hour time counts in
 * its own hour and anything later in the next one.
 */
export function notificationHour(availableAt: number): number {
  const top = topOfHour(availableAt);
  return top === availableAt ? top : top + HOUR;
}

/**
 * The notifications to schedule at `now`: one per future hour in which at least one review becomes
 * available, within the window, earliest first, capped. `totalReviews` includes the reviews already
 * available at `now` (they stay available until answered).
 */
export function planReviewNotifications(db: LearnerDb, now: number, options: ReviewNotificationOptions = {}): ReviewTime[] {
  if (options.vacationMode === true) return [];
  const maxLevel = options.maxLevel ?? LOCAL_MAX_LEVEL_GRANTED;
  const end = now + (options.window ?? REVIEW_NOTIFICATION_WINDOW);
  const cap = options.cap ?? MAX_REVIEW_NOTIFICATIONS;
  if (cap <= 0) return [];

  let availableNow = 0;
  const perHour = new Map<number, number>();
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id);
    if (t === undefined || t.hiddenAt !== 0 || t.level > maxLevel) continue;
    const at = progressRow(db, s.id).availableAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at === 0) continue;
    if (at <= now) {
      availableNow++;
      continue;
    }
    const hour = notificationHour(at);
    if (hour > end) continue;
    perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
  }
  if (perHour.size === 0) return [];

  const lessons = availableLessonIds(db, maxLevel).length;
  const hours = [...perHour.keys()].sort((a, b) => a - b);
  const out: ReviewTime[] = [];
  let total = availableNow;
  for (const at of hours) {
    const newReviews = perHour.get(at)!;
    total += newReviews;
    out.push({ at, newReviews, totalReviews: total, lessons });
    if (out.length >= cap) break;
  }
  return out;
}

/** `NotificationWorker.postNotification`: title and text, word for word. */
export function reviewNotificationText(t: Pick<ReviewTime, 'lessons' | 'totalReviews'>): { title: string; body: string } {
  if (t.lessons > 0) {
    return {
      title: 'New lessons and reviews available',
      body: `${t.lessons} lessons and ${t.totalReviews} reviews available`,
    };
  }
  return { title: 'New reviews available', body: `${t.totalReviews} reviews available` };
}

/** The Java app's channel (`NotificationWorker.postNotification`, Android 8+). */
export const REVIEW_NOTIFICATION_CHANNEL = {
  id: 'NewReviewsChannel',
  name: 'NewReviewsChannel',
  description: 'New reviews available',
} as const;
