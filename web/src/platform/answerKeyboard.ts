/**
 * Keyboard input settings for the quiz answer field, as `UnansweredSessionFragment` applies them to
 * `questionEdit` (`GlobalSettings.Keyboard`):
 *
 * - imeOptions: IME_FLAG_NO_PERSONALIZED_LEARNING (`enable_no_learning`, default true),
 *   IME_FLAG_FORCE_ASCII (`force_ascii_meaning` for meanings, `force_ascii_reading` for readings; the
 *   getters default to false, the settings screen writes the XML default true for meanings);
 * - inputType: TEXT | NO_SUGGESTIONS, plus AUTO_CORRECT (`enable_auto_correct_*`) and
 *   VISIBLE_PASSWORD (`force_visible_password_*`);
 * - setImeHintLocales: English for meanings (`ime_hint_meaning`), Japanese for readings
 *   (`ime_hint_reading`), none when the other one is on.
 *
 * Android: `androidSystemUi.ts` sends these to `KkWebView` for the focused answer field. Browsers can
 * only honour auto-correct (the field's `autocorrect` / `spellcheck` attributes, set by the session's
 * `answerInputAttributes`); the settings rows a browser can't honour are hidden there (`imeFlags`).
 */
import type { Preferences } from '../core/settings';

export interface AnswerKeyboard {
  /** The focused element is a quiz answer field. */
  answerField: boolean;
  noPersonalizedLearning: boolean;
  forceAscii: boolean;
  autoCorrect: boolean;
  visiblePassword: boolean;
  /** `setImeHintLocales`: 'en', 'ja', or '' (none). */
  hintLocale: '' | 'en' | 'ja';
}

const NONE: AnswerKeyboard = {
  answerField: false, noPersonalizedLearning: false, forceAscii: false, autoCorrect: false, visiblePassword: false, hintLocale: '',
};

const bool = (prefs: Preferences, key: string, def: boolean): boolean => {
  const v = prefs[key];
  return typeof v === 'boolean' ? v : def;
};

/** The settings for a meaning (`reading` false) or reading question. */
export function answerKeyboard(prefs: Preferences, reading: boolean): AnswerKeyboard {
  const kind = reading ? 'reading' : 'meaning';
  const hintMeaning = bool(prefs, 'ime_hint_meaning', false);
  const hintReading = bool(prefs, 'ime_hint_reading', false);
  let hintLocale: AnswerKeyboard['hintLocale'] = '';
  if (reading && hintReading) hintLocale = 'ja';
  else if (!reading && hintMeaning) hintLocale = 'en';
  return {
    answerField: true,
    noPersonalizedLearning: bool(prefs, 'enable_no_learning', true),
    forceAscii: bool(prefs, `force_ascii_${kind}`, false),
    autoCorrect: bool(prefs, `enable_auto_correct_${kind}`, false),
    visiblePassword: bool(prefs, `force_visible_password_${kind}`, false),
    hintLocale,
  };
}

let current: Preferences = {};

/** The settings in use (App.tsx keeps them current). */
export function setAnswerKeyboardPrefs(prefs: Preferences): void {
  current = prefs;
}

/** A reading question's field: the answer field's `kana` class (or `lang="ja"`). */
export function isReadingField(el: HTMLInputElement): boolean {
  return el.classList.contains('kana') || (el.lang ?? '').toLowerCase().startsWith('ja');
}

/** The settings for the focused element (all off unless it is an `input.kk-answer`). */
export function answerKeyboardFor(el: Element | null, prefs: Preferences = current): AnswerKeyboard {
  if (!(el instanceof HTMLInputElement) || !el.classList.contains('kk-answer')) return NONE;
  return answerKeyboard(prefs, isReadingField(el));
}
