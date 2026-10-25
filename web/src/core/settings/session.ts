/**
 * The session order and selection settings (`GlobalSettings.AdvancedLesson`, `AdvancedReview`,
 * `AdvancedSelfStudy`, `Review`, `AdvancedOther`), with Java's defaults, the `enable_advanced` gate
 * and the fallbacks for invalid values. The session start reads these for its own type only; `NONE`
 * gets the defaults the `GlobalSettings.get*(SessionType)` switches give it.
 *
 * Java: `GlobalSettings`. Fixtures: `scenarios/session-order-*`, `session-size-review`,
 * `session-sequence-*`.
 */

import { advancedEnabled, prefBoolean, type Preferences, type SessionType } from './index';

/** `LessonOrder`: the lesson order setting. `shuffle` orders shuffle the subjects before sorting. */
export const LESSON_ORDERS = {
  SHUFFLE: { shuffle: true },
  LEVEL_THEN_TYPE: { shuffle: false },
  RADICALS_THEN_LEVEL_THEN_TYPE: { shuffle: false },
  TYPE_THEN_LEVEL: { shuffle: false },
  LEVEL_THEN_SHUFFLE: { shuffle: true },
  TYPE_THEN_SHUFFLE: { shuffle: true },
} as const;
export type LessonOrder = keyof typeof LESSON_ORDERS;

/** `ReviewOrder`: the review and self-study order setting. */
export const REVIEW_ORDERS = [
  'SHUFFLE', 'LEVEL', 'TYPE', 'SRS', 'LEVEL_THEN_TYPE', 'LEVEL_THEN_SRS', 'TYPE_THEN_LEVEL', 'TYPE_THEN_SRS',
  'SRS_THEN_TYPE', 'SRS_THEN_LEVEL', 'LEVEL_THEN_TYPE_THEN_SRS', 'LEVEL_THEN_SRS_THEN_TYPE',
  'TYPE_THEN_LEVEL_THEN_SRS', 'TYPE_THEN_SRS_THEN_LEVEL', 'SRS_THEN_TYPE_THEN_LEVEL', 'SRS_THEN_LEVEL_THEN_TYPE',
] as const;
export type ReviewOrder = (typeof REVIEW_ORDERS)[number];

/** `SessionPriority`: the items a session puts first. */
export const SESSION_PRIORITIES = [
  'NONE', 'RADICALS_FIRST', 'LEVEL_UP_FIRST', 'CURRENT_LEVEL_RADICAL_KANJI_FIRST', 'CURRENT_LEVEL_FIRST',
] as const;
export type SessionPriority = (typeof SESSION_PRIORITIES)[number];

/** `Constants.DEFAULT_OVERDUE_THRESHOLD` (a Java `float`). */
export const DEFAULT_OVERDUE_THRESHOLD = Math.fround(0.2);

/**
 * `SharedPreferences.getString(key, null)`: null when absent. Android throws a ClassCastException for
 * a value stored with another type; the callers here never meet one, so it reads as absent.
 */
function prefString(prefs: Preferences, key: string): string | null {
  const v = prefs[key];
  return typeof v === 'string' ? v : null;
}

/** `SharedPreferences.getInt(key, defaultValue)`. A non-number reads as absent (see `prefString`). */
function prefInt(prefs: Preferences, key: string, defaultValue: number): number {
  const v = prefs[key];
  return typeof v === 'number' ? v : defaultValue;
}

const DIGIT = /^\p{Nd}$/u;

/** `Integer.parseInt(s)`: an optional sign and decimal digits (any script) within int range; null where Java throws. */
export function javaParseInt(s: string): number | null {
  let i = 0;
  let negative = false;
  if (s.startsWith('+') || s.startsWith('-')) {
    negative = s.startsWith('-');
    i = 1;
  }
  if (i >= s.length) return null;
  let v = 0;
  for (; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (!DIGIT.test(s.charAt(i))) return null;
    // A decimal digit's value is its distance from the zero of its run of ten.
    let zero = code;
    while (code - zero < 9 && DIGIT.test(String.fromCharCode(zero - 1))) zero--;
    v = v * 10 + (code - zero);
    if (v > 2 ** 31) return null;
  }
  const n = negative ? -v : v;
  return n > 2 ** 31 - 1 ? null : n;
}

/** A `String`-typed enum setting: `valueOf(value)` or the default for absent and unknown values. */
function enumPref<T extends string>(prefs: Preferences, key: string, values: readonly T[], defaultValue: T): T {
  const v = prefString(prefs, key);
  return v !== null && (values as readonly string[]).includes(v) ? (v as T) : defaultValue;
}

/** The key prefix of a session type's advanced settings. */
function prefix(type: 'LESSON' | 'REVIEW' | 'SELF_STUDY'): string {
  return type === 'LESSON' ? 'lesson' : type === 'REVIEW' ? 'review' : 'self_study';
}

/** An advanced boolean: false without `enable_advanced`. */
function advancedBoolean(prefs: Preferences, key: string): boolean {
  return advancedEnabled(prefs) && prefBoolean(prefs, key, false);
}

/** `AdvancedLesson.getOrder`: `lesson_order`, default `LEVEL_THEN_TYPE`. */
export function lessonOrder(prefs: Preferences): LessonOrder {
  if (!advancedEnabled(prefs)) return 'LEVEL_THEN_TYPE';
  return enumPref(prefs, 'lesson_order', Object.keys(LESSON_ORDERS) as LessonOrder[], 'LEVEL_THEN_TYPE');
}

/** `AdvancedReview.getOrder` / `AdvancedSelfStudy.getOrder`: `review_order` / `self_study_order`, default `SHUFFLE`. */
export function reviewOrder(prefs: Preferences, type: 'REVIEW' | 'SELF_STUDY'): ReviewOrder {
  if (!advancedEnabled(prefs)) return 'SHUFFLE';
  return enumPref(prefs, `${prefix(type)}_order`, REVIEW_ORDERS, 'SHUFFLE');
}

/** `GlobalSettings.getOrderReversed(type)`: `<type>_order_reversed`. */
export function orderReversed(prefs: Preferences, type: SessionType): boolean {
  return type !== 'NONE' && advancedBoolean(prefs, `${prefix(type)}_order_reversed`);
}

/** `GlobalSettings.getOrderOverdueFirst(type)`: reviews and self-study only. */
export function orderOverdueFirst(prefs: Preferences, type: SessionType): boolean {
  return (type === 'REVIEW' || type === 'SELF_STUDY') && advancedBoolean(prefs, `${prefix(type)}_order_overdue_first`);
}

/** `GlobalSettings.getOrderPriority(type)`: `<type>_order_priority`, default `NONE` (`NONE` reads self-study's). */
export function orderPriority(prefs: Preferences, type: SessionType): SessionPriority {
  if (!advancedEnabled(prefs)) return 'NONE';
  return enumPref(prefs, `${prefix(type === 'NONE' ? 'SELF_STUDY' : type)}_order_priority`, SESSION_PRIORITIES, 'NONE');
}

/** `GlobalSettings.getShuffleAfterSelection(type)`: `<type>_shuffle_after_selection`. */
export function shuffleAfterSelection(prefs: Preferences, type: SessionType): boolean {
  return type !== 'NONE' && advancedBoolean(prefs, `${prefix(type)}_shuffle_after_selection`);
}

/** `GlobalSettings.getBackToBack(type)`: `<type>_back_to_back`. */
export function backToBack(prefs: Preferences, type: SessionType): boolean {
  return type !== 'NONE' && advancedBoolean(prefs, `${prefix(type)}_back_to_back`);
}

/** `GlobalSettings.getReadingFirst(type)`: `<type>_reading_first`. */
export function readingFirst(prefs: Preferences, type: SessionType): boolean {
  return type !== 'NONE' && advancedBoolean(prefs, `${prefix(type)}_reading_first`);
}

/** `GlobalSettings.getMeaningFirst(type)`: `<type>_meaning_first`. */
export function meaningFirst(prefs: Preferences, type: SessionType): boolean {
  return type !== 'NONE' && advancedBoolean(prefs, `${prefix(type)}_meaning_first`);
}

/**
 * `GlobalSettings.getRandomizeInflections(type)`: never for lessons; `review_randomize_inflections` for reviews,
 * `self_study_randomize_inflections` otherwise (self-study and NONE); advanced only, default false.
 */
export function randomizeInflections(prefs: Preferences, type: SessionType): boolean {
  if (type === 'LESSON') return false;
  return advancedBoolean(prefs, type === 'REVIEW' ? 'review_randomize_inflections' : 'self_study_randomize_inflections');
}

/**
 * `Review.gexMaxLessonSessionSize` / `gexMaxReviewSessionSize` / `getMaxSelfStudySessionSize`:
 * `max_<type>_session_size`, a string; the default (5 lessons, 100 otherwise) when it is empty, not
 * a number or below 1. Not an advanced setting.
 */
export function maxSessionSize(prefs: Preferences, type: 'LESSON' | 'REVIEW' | 'SELF_STUDY'): number {
  const fallback = type === 'LESSON' ? 5 : 100;
  const value = prefString(prefs, `max_${prefix(type)}_session_size`);
  if (value === null || value === '') return fallback;
  const n = javaParseInt(value);
  return n === null || n < 1 ? fallback : n;
}

/**
 * `AdvancedOther.getOverdueThreshold`: `overdue_threshold` (a percentage string) as a Java `float`
 * fraction; the default 0.2 without advanced settings or for empty, invalid or values below 1.
 */
export function overdueThreshold(prefs: Preferences): number {
  if (!advancedEnabled(prefs)) return DEFAULT_OVERDUE_THRESHOLD;
  const value = prefString(prefs, 'overdue_threshold');
  if (value === null || value === '') return DEFAULT_OVERDUE_THRESHOLD;
  const n = javaParseInt(value);
  return n === null || n < 1 ? DEFAULT_OVERDUE_THRESHOLD : Math.fround(Math.fround(n) / Math.fround(100));
}

/** `AdvancedOther.getKanjiModeOnKun`: `kanji_mode_onkun`, quiz on'yomi and kun'yomi separately. */
export function kanjiModeOnKun(prefs: Preferences): boolean {
  return advancedBoolean(prefs, 'kanji_mode_onkun');
}

/** The twelve raw `<type>_subjects_*` values `SubjectSelectionRules` is built from (-1 = no rule). */
export interface SubjectSelectionSettings {
  currentMin: number;
  currentMax: number;
  earlierMin: number;
  earlierMax: number;
  radicalMin: number;
  radicalMax: number;
  kanjiMin: number;
  kanjiMax: number;
  vocabularyMin: number;
  vocabularyMax: number;
  kanaVocabularyMin: number;
  kanaVocabularyMax: number;
}

/**
 * `GlobalSettings.getSubjectSelectionRules(type)`'s twelve getters: `<type>_subjects_<kind>_<min|max>`
 * ints, -1 without advanced settings, when absent, and for `NONE`. The lesson kana-only minimum reads
 * `lesson_subjects_kana_vocabulary_min` (the key the settings screen writes; fixed in Java on 2026-10-18).
 */
export function subjectSelectionSettings(prefs: Preferences, type: SessionType): SubjectSelectionSettings {
  const read = (kind: string): number =>
    type === 'NONE' || !advancedEnabled(prefs) ? -1 : prefInt(prefs, `${prefix(type)}_subjects_${kind}`, -1);
  return {
    currentMin: read('current_min'),
    currentMax: read('current_max'),
    earlierMin: read('earlier_min'),
    earlierMax: read('earlier_max'),
    radicalMin: read('radical_min'),
    radicalMax: read('radical_max'),
    kanjiMin: read('kanji_min'),
    kanjiMax: read('kanji_max'),
    vocabularyMin: read('vocabulary_min'),
    vocabularyMax: read('vocabulary_max'),
    kanaVocabularyMin: read('kana_vocabulary_min'),
    kanaVocabularyMax: read('kana_vocabulary_max'),
  };
}
