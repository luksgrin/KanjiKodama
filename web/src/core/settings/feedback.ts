/**
 * Answer feedback settings (Android build). Java: `GlobalSettings.Review.enable_haptic_feedback_success`
 * and `enable_haptic_feedback_failure`, both off by default; `fragments/UnansweredSessionFragment`
 * calls `util/HapticUtil.onCorrect` / `onWrong` when they are on.
 */
import { prefBoolean, type Preferences } from './index';

/** `enable_haptic_feedback_success`, default false. */
export function hapticFeedbackOnCorrect(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_haptic_feedback_success', false);
}

/** `enable_haptic_feedback_failure`, default false. */
export function hapticFeedbackOnWrong(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_haptic_feedback_failure', false);
}
