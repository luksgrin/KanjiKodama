/**
 * Font settings sizes (`GlobalSettings.Font`), by the Java keys and defaults. SeekBarPreferences store
 * ints; sizes are sp, used 1:1 as CSS px.
 *
 * Where Java applies them: `max_font_size_lesson` lesson presentation title (LessonSessionFragment),
 * `max_font_size_quiz` the item info title after answering / in Anki mode (AnsweredSessionFragment,
 * AnkiSessionFragment), `max_font_size_browse` the item page title (SubjectInfoFragment) — 0 hides
 * the title; `max_font_size_quiz_text` the question text's height cap (AbstractSessionFragment);
 * `font_size_question_edit` the answer field; `font_size_subject_info` the item info body
 * (core `fontSizeSubjectInfo`); `font_size_live_subject_table` the dashboard tables;
 * `font_size_anki_answer` the Anki answer and synonyms.
 */
import type { Preferences } from '../../core/settings';

function prefInt(prefs: Preferences, key: string, def: number): number {
  const v = prefs[key];
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v)) return Number.parseInt(v, 10);
  return def;
}

export const maxFontSizeLesson = (p: Preferences): number => prefInt(p, 'max_font_size_lesson', 128);
export const maxFontSizeQuiz = (p: Preferences): number => prefInt(p, 'max_font_size_quiz', 28);
export const maxFontSizeBrowse = (p: Preferences): number => prefInt(p, 'max_font_size_browse', 64);
export const maxFontSizeQuizText = (p: Preferences): number => prefInt(p, 'max_font_size_quiz_text', 104);
export const fontSizeQuestionEdit = (p: Preferences): number => prefInt(p, 'font_size_question_edit', 22);
export const fontSizeLiveSubjectTable = (p: Preferences): number => prefInt(p, 'font_size_live_subject_table', 16);
export const fontSizeAnkiAnswer = (p: Preferences): number => prefInt(p, 'font_size_anki_answer', 20);
