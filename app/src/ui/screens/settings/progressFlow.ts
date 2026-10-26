/**
 * Shared by the curriculum, fast travel and WaniKani import screens (`local/CurriculumUi`,
 * `local/ProgressPreferences`): the "session running" guard and what follows a progress change.
 */
import type { AppController } from '../../../app/appController';
import { rescheduleReviewNotifications } from '../../../platform/reviewNotifications';
import type { Platform } from '../../../platform';

/** `CurriculumUi.SESSION_RUNNING`. */
export const SESSION_RUNNING = 'Finish or abandon your current lesson or review session first.';

/** `Session.getInstance().isInactive()` negated: a session has items stored (`session` table). */
export async function sessionRunning(app: AppController): Promise<boolean> {
  try {
    return (await app.db.session.count()) > 0;
  } catch {
    return false;
  }
}

/** After a curriculum switch, fast travel or import: review times changed, so reschedule notifications (Android). */
export function afterProgressChange(app: AppController, platform: Platform): void {
  const s = app.get();
  if (!s.learner || !platform.notifications?.supported) return;
  void rescheduleReviewNotifications(platform.notifications, s.learner, s.prefs, app.clock.now()).catch(() => undefined);
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** `" (N5)"` after a level, or nothing (Java's `where == null ? "" : " (" + where + ")"`). */
export const paren = (s: string | null): string => (s === null ? '' : ` (${s})`);
