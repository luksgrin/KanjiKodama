/**
 * What the home-screen widget shows (Android): available lessons, available reviews and when the
 * next review becomes available ("More at 14:00").
 *
 * The widget can't run the app's code, so the app hands it the counts now plus the counts at every future hour in which
 * reviews become available (like the review notifications, ./plan.ts); the native side switches to
 * the right entry on its own alarm.
 */
import { availableLessonIds, LOCAL_MAX_LEVEL_GRANTED } from '../dashboard/timeLine';
import { progressRow, type LearnerDb } from '../progression';
import { notificationHour, REVIEW_NOTIFICATION_WINDOW, MAX_REVIEW_NOTIFICATIONS } from './plan';

export interface WidgetCounts {
  lessons: number;
  reviews: number;
  /** When the next review that isn't available yet becomes available (epoch ms, 0: none). */
  nextAt: number;
}

export interface WidgetEntry extends WidgetCounts {
  /** From this time on (a top of the hour after `now`). */
  at: number;
}

export interface WidgetPlan extends WidgetCounts {
  /** Later states, earliest first. */
  schedule: WidgetEntry[];
}

export interface WidgetPlanOptions {
  /** `getUserMaxLevelGranted` (60 in local mode). */
  maxLevel?: number;
  window?: number;
  cap?: number;
}

export function planWidget(db: LearnerDb, now: number, options: WidgetPlanOptions = {}): WidgetPlan {
  const maxLevel = options.maxLevel ?? LOCAL_MAX_LEVEL_GRANTED;
  const end = now + (options.window ?? REVIEW_NOTIFICATION_WINDOW);
  const cap = options.cap ?? MAX_REVIEW_NOTIFICATIONS;
  let reviews = 0;
  const later: number[] = [];
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id);
    if (t === undefined || t.hiddenAt !== 0 || t.level > maxLevel) continue;
    const at = progressRow(db, s.id).availableAt;
    if (typeof at !== 'number' || !Number.isFinite(at) || at === 0) continue;
    if (at <= now) reviews++;
    else later.push(at);
  }
  later.sort((a, b) => a - b);
  const lessons = availableLessonIds(db, maxLevel).length;
  const schedule: WidgetEntry[] = [];
  let i = 0;
  let total = reviews;
  while (i < later.length && schedule.length < cap) {
    const hour = notificationHour(later[i]!);
    if (hour > end) break;
    while (i < later.length && later[i]! <= hour) {
      total++;
      i++;
    }
    schedule.push({ at: hour, lessons, reviews: total, nextAt: later[i] ?? 0 });
  }
  return { lessons, reviews, nextAt: later[0] ?? 0, schedule };
}
