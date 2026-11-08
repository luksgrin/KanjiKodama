import { QUESTION_TYPE_INFO, type QuestionType } from '../answer/questionType';
import { advancedEnabled, prefBoolean, type Preferences, type SessionType } from '../settings';

/**
 * Whether a question gets the Anki screen.
 * Advanced settings must be on; then `anki_mode_<lesson|review|self_study>_<meaning|reading>` (default
 * false), with `NONE` reading the self-study pair.
 */
export function ankiMode(prefs: Preferences, sessionType: SessionType, questionType: QuestionType): boolean {
  if (!advancedEnabled(prefs)) return false;
  const session = sessionType === 'LESSON' ? 'lesson' : sessionType === 'REVIEW' ? 'review' : 'self_study';
  const kind = QUESTION_TYPE_INFO[questionType].meaning ? 'meaning' : 'reading';
  return prefBoolean(prefs, `anki_mode_${session}_${kind}`, false);
}
