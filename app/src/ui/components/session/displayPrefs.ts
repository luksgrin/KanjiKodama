/**
 * The Display and Keyboard input settings the session screens read, by their preference keys with
 * their defaults (`ui/screens/settings/schema.ts`). The settings screen writes them; the Android app's
 * native WebView reads the keyboard keys too (IME flags), so the keys and meanings must stay as they are.
 */
import type { QuestionType } from '../../../core/answer/questionType';
import { QUESTION_TYPE_INFO } from '../../../core/answer/questionType';
import { prefBoolean, type Preferences } from '../../../core/settings';

/** `SharedPreferences.getInt` (a SeekBarPreference stores an int; strings from imported files are parsed). */
export function prefInt(prefs: Preferences, key: string, defaultValue: number): number {
  const v = prefs[key];
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v)) return Number.parseInt(v, 10);
  return defaultValue;
}

/** `center_caret`, default false. */
export function centerCaret(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'center_caret', false);
}

/** `anki_buttons_height` dp (10–250), default 50. */
export function ankiButtonsHeight(prefs: Preferences): number {
  return prefInt(prefs, 'anki_buttons_height', 50);
}

/** `quiz_question_view_height` dp (0–500), 0 = no fixed size. */
export function quizQuestionViewHeight(prefs: Preferences): number {
  return Math.max(0, prefInt(prefs, 'quiz_question_view_height', 0));
}

/** `stretch_quiz_question_view`, default false. */
export function stretchQuestionView(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'stretch_quiz_question_view', false);
}

/** `slide_animations`, default true. */
export function slideAnimations(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'slide_animations', true);
}

/**
 * The answer field's keyboard attributes for a question (its input type and IME options, as far as a
 * web page can ask for them):
 * - `enable_auto_correct_meaning` / `_reading` (default false): `autocorrect` and `spellcheck` on.
 *   Off: both off, and `autocomplete="off"`.
 * - No capitalisation: `autocapitalize="none"` always.
 * - `lang`: the field's text locale (`en` or `ja`; also the keyboard
 *   language hint some keyboards follow, like `ime_hint_*`).
 * - `force_ascii_*`, `force_visible_password_*`, `enable_no_learning`, `ime_hint_*` have no web
 *   equivalent; the Android app applies them natively (KkWebView reads the same keys).
 */
export interface AnswerInputAttributes {
  lang: 'ja' | 'en';
  autoCorrect: 'on' | 'off';
  spellCheck: boolean;
  autoCapitalize: 'none';
  autoComplete: 'off';
  inputMode: 'text';
  /** TYPE_TEXT_VARIATION_VISIBLE_PASSWORD: TextView.setInputType switches the field to the monospace
   *  typeface (`force_visible_password_*`, Android build only: the flag is set natively there). */
  monospace: boolean;
}

export function answerInputAttributes(prefs: Preferences, type: QuestionType, imeFlags = false): AnswerInputAttributes {
  const info = QUESTION_TYPE_INFO[type];
  const visiblePassword = info.ascii
    ? prefBoolean(prefs, 'force_visible_password_meaning', false)
    : info.kana && prefBoolean(prefs, 'force_visible_password_reading', false);
  const autoCorrect = info.ascii
    ? prefBoolean(prefs, 'enable_auto_correct_meaning', false)
    : info.kana && prefBoolean(prefs, 'enable_auto_correct_reading', false);
  return {
    lang: info.kana ? 'ja' : 'en',
    autoCorrect: autoCorrect ? 'on' : 'off',
    spellCheck: autoCorrect,
    autoCapitalize: 'none',
    autoComplete: 'off',
    inputMode: 'text',
    monospace: imeFlags && visiblePassword,
  };
}
