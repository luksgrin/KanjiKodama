/**
 * The settings the session screens read (advanced, review, subject info, audio, display, keyboard
 * and confirmation settings) and the behaviour enums behind them (special buttons, the Don't know
 * button, the info dump). Pure: the session state `canShow` reads comes in as arguments.
 */
import { QUESTION_TYPE_INFO, type QuestionType } from '../answer/questionType';
import type { ContentSubject } from '../content';
import { advancedEnabled, prefBoolean, type Preferences, type SessionType } from './index';

/** What a special button does. */
export const SPECIAL_BUTTON_BEHAVIORS = [
  'DISABLE', 'UNDO_AND_MARK_CORRECT', 'UNDO_AND_RETRY_NOW', 'UNDO_AND_PUT_BACK', 'SKIP', 'TOGGLE_LIGHTNING_MODE',
] as const;
export type SpecialButtonBehavior = (typeof SPECIAL_BUTTON_BEHAVIORS)[number];

/** When the Don't know button shows. */
export const DONT_KNOW_BUTTON_BEHAVIORS = ['DISABLE', 'ENABLE', 'ONLY_IF_IGNORE_HIDDEN'] as const;
export type DontKnowButtonBehavior = (typeof DONT_KNOW_BUTTON_BEHAVIORS)[number];

/** How much of the subject info shows after answering. */
export const SUBJECT_INFO_DUMPS = ['NOTHING', 'ANSWERS_ONLY', 'HIDE_UNQUIZZED', 'HIDE_READING_RELATED', 'ALL'] as const;
export type SubjectInfoDump = (typeof SUBJECT_INFO_DUMPS)[number];

function enumPref<T extends string>(prefs: Preferences, key: string, values: readonly T[], fallback: T): T {
  const v = prefs[key];
  return typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : fallback;
}

const SPECIAL_BUTTON_KEYS = { 1: 'undo_button', 2: 'ignore_button', 3: 'special_button_3' } as const;

/**
 * The special buttons: `undo_button` (1, top right), `ignore_button`
 * (2, bottom left), `special_button_3` (3, top left); DISABLE unless advanced settings are on.
 */
export function specialButtonBehavior(prefs: Preferences, button: 1 | 2 | 3): SpecialButtonBehavior {
  if (!advancedEnabled(prefs)) return 'DISABLE';
  return enumPref(prefs, SPECIAL_BUTTON_KEYS[button], SPECIAL_BUTTON_BEHAVIORS, 'DISABLE');
}

/** The session state `SpecialButtonBehavior.canShow` and `DontKnowButtonBehavior.canShow` read. */
export interface SessionButtonState {
  /** `Session.isActive()`. */
  active: boolean;
  answered: boolean;
  correct: boolean;
  /** `Session.canUndo()`. */
  canUndo: boolean;
}

/** `SpecialButtonBehavior.canShow`. */
export function specialButtonCanShow(b: SpecialButtonBehavior, s: SessionButtonState): boolean {
  switch (b) {
    case 'DISABLE':
      return false;
    case 'UNDO_AND_MARK_CORRECT':
      return s.canUndo && s.answered && !s.correct;
    case 'UNDO_AND_RETRY_NOW':
    case 'UNDO_AND_PUT_BACK':
      return s.canUndo;
    case 'SKIP':
      return s.active && !s.answered;
    case 'TOGGLE_LIGHTNING_MODE':
      return s.active;
  }
}

/** `SpecialButtonBehavior.getLabel` (the lightning label is struck through while lightning mode is off). */
export function specialButtonLabel(b: SpecialButtonBehavior, lightningModeActive: boolean): string {
  switch (b) {
    case 'DISABLE':
      return '';
    case 'UNDO_AND_MARK_CORRECT':
      return 'Ignore';
    case 'UNDO_AND_RETRY_NOW':
    case 'UNDO_AND_PUT_BACK':
      return 'Undo';
    case 'SKIP':
      return 'Skip';
    case 'TOGGLE_LIGHTNING_MODE':
      return lightningModeActive ? 'Lightning' : 'L̶i̶g̶h̶t̶n̶i̶n̶g̶';
  }
}

/** The Don't know button: ENABLE unless advanced settings are on. */
export function dontKnowButtonBehavior(prefs: Preferences): DontKnowButtonBehavior {
  if (!advancedEnabled(prefs)) return 'ENABLE';
  return enumPref(prefs, 'dont_know_button', DONT_KNOW_BUTTON_BEHAVIORS, 'ENABLE');
}

/** `DontKnowButtonBehavior.canShow` (ONLY_IF_IGNORE_HIDDEN reads special button 2). */
export function dontKnowCanShow(prefs: Preferences, s: SessionButtonState): boolean {
  switch (dontKnowButtonBehavior(prefs)) {
    case 'DISABLE':
      return false;
    case 'ENABLE':
      return !s.answered;
    case 'ONLY_IF_IGNORE_HIDDEN':
      return !s.answered && !specialButtonCanShow(specialButtonBehavior(prefs, 2), s);
  }
}

/** `{meaning,reading}_info_dump[_incorrect]`. */
export function infoDump(prefs: Preferences, questionType: QuestionType, correct: boolean): SubjectInfoDump {
  const kind = QUESTION_TYPE_INFO[questionType].meaning ? 'meaning' : 'reading';
  return enumPref(prefs, `${kind}_info_dump${correct ? '' : '_incorrect'}`, SUBJECT_INFO_DUMPS, 'ANSWERS_ONLY');
}

/** The lesson presentation's starting dump. */
export function lessonInfoDump(prefs: Preferences): SubjectInfoDump {
  return prefBoolean(prefs, 'hide_lesson_readings', false) ? 'HIDE_READING_RELATED' : 'ALL';
}

/** The four `SubjectInfoDump` flags. */
export interface InfoDumpFlags {
  meaningAnswers: boolean;
  readingAnswers: boolean;
  meaningRelated: boolean;
  readingRelated: boolean;
}

/**
 * What the info dump shows for the current question (`question` null: no question, e.g. the lesson
 * presentation). `done` is the item's question1Done..question4Done.
 */
export function infoDumpFlags(dump: SubjectInfoDump, question: { type: QuestionType; done: readonly boolean[] } | null): InfoDumpFlags {
  const meaningSide = question !== null && (QUESTION_TYPE_INFO[question.type].meaning || question.done[0] === true);
  const readingSide = question !== null && (QUESTION_TYPE_INFO[question.type].reading
    || (question.done[1] === true && question.done[2] === true && question.done[3] === true));
  switch (dump) {
    case 'NOTHING':
      return { meaningAnswers: false, readingAnswers: false, meaningRelated: false, readingRelated: false };
    case 'ANSWERS_ONLY':
      return { meaningAnswers: meaningSide, readingAnswers: readingSide, meaningRelated: false, readingRelated: false };
    case 'HIDE_UNQUIZZED':
      return { meaningAnswers: meaningSide, readingAnswers: readingSide, meaningRelated: meaningSide, readingRelated: readingSide };
    case 'HIDE_READING_RELATED':
      return { meaningAnswers: true, readingAnswers: false, meaningRelated: true, readingRelated: false };
    case 'ALL':
      return { meaningAnswers: true, readingAnswers: true, meaningRelated: true, readingRelated: true };
  }
}

/** `SubjectInfoDump.getShowRevealButton`. */
export function infoDumpShowReveal(dump: SubjectInfoDump): boolean {
  return dump !== 'ALL';
}

/** `SubjectInfoDump.getRevealButtonLabel`. */
export function infoDumpRevealLabel(dump: SubjectInfoDump): string {
  switch (dump) {
    case 'NOTHING':
      return 'Show answer';
    case 'ANSWERS_ONLY':
      return 'Show more';
    case 'HIDE_UNQUIZZED':
    case 'HIDE_READING_RELATED':
      return 'Show all';
    case 'ALL':
      return '';
  }
}

/** `SubjectInfoDump.getNextStage`. */
export function infoDumpNextStage(dump: SubjectInfoDump): SubjectInfoDump {
  switch (dump) {
    case 'NOTHING':
      return 'ANSWERS_ONLY';
    case 'ANSWERS_ONLY':
      return 'HIDE_UNQUIZZED';
    default:
      return 'ALL';
  }
}

/** `next_button_delay`: seconds (a float string; below 1 or unreadable: 0). */
export function nextButtonDelay(prefs: Preferences): number {
  const v = prefs.next_button_delay;
  if (v === null || v === undefined || v === '') return 0;
  const f = typeof v === 'number' ? v : typeof v === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdD]?\s*$/.test(v)
    ? Number.parseFloat(v) : Number.NaN;
  if (!Number.isFinite(f) || f < 1) return 0;
  return f;
}

/** `enable_srs_indicator` (default false). */
export function enableSrsIndicator(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_srs_indicator', false);
}

/** `show_answer_toast` (default true): the check mark / X after answering. */
export function showAnswerToast(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'show_answer_toast', true);
}

/** `enable_srs_toast` (default true). */
export function enableSrsToast(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_srs_toast', true);
}

/** `enable_alternatives_toast` (default false). */
export function enableAlternativesToast(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_alternatives_toast', false);
}

/** `enable_star_ratings` (default false). */
export function enableStarRatings(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_star_ratings', false);
}

/** `autoplay_lessons` for lessons, else `autoplay_reviews` (default true). */
export function autoPlay(prefs: Preferences, type: SessionType): boolean {
  return prefBoolean(prefs, type === 'LESSON' ? 'autoplay_lessons' : 'autoplay_reviews', true);
}

/** `autoplay_lesson_presentation` (default true). */
export function autoplayLessonPresentation(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'autoplay_lesson_presentation', true);
}

/** `autoplay_anki_reveal` (default true). */
export function autoplayAnkiReveal(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'autoplay_anki_reveal', true);
}

/** `swap_anki_buttons` (default false). */
export function swapAnkiButtons(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'swap_anki_buttons', false);
}

/** `ui_confirm_abandon_session` (default true). */
export function uiConfirmAbandonSession(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'ui_confirm_abandon_session', true);
}

/** `ui_confirm_wrapup_session` (default true). */
export function uiConfirmWrapupSession(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'ui_confirm_wrapup_session', true);
}

/**
 * `indicate_kanji_reading_type` (Lesson/review settings), default true: a kanji reading question
 * names the kind of reading its lesson taught (on'yomi / kun'yomi). It used to be an advanced
 * setting, default false; the key and its meaning are unchanged.
 */
export function indicateKanjiReadingType(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'indicate_kanji_reading_type', true);
}

/** Which kinds of accepted readings a kanji has. */
export type KanjiAcceptedReadingType = 'ONYOMI' | 'KUNYOMI' | 'NEITHER' | 'BOTH';

/** Which kinds of accepted readings a kanji has. */
export function kanjiAcceptedReadingType(subject: ContentSubject): KanjiAcceptedReadingType {
  if (subject.object !== 'kanji') return 'NEITHER';
  const on = subject.readings.some((r) => r.accepted_answer && r.type === 'onyomi');
  const kun = subject.readings.some((r) => r.accepted_answer && r.type === 'kunyomi');
  if (on && kun) return 'BOTH';
  if (on) return 'ONYOMI';
  return kun ? 'KUNYOMI' : 'NEITHER';
}
