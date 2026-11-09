/**
 * What a quiz question asks for (the badge on the question banner) and, after a shake-and-retry,
 * what the answer was instead and what is wanted (the retry hint). Only reads the subject: the
 * verdicts themselves come from `checkAnswer`, unchanged.
 */
import type { Reading } from '../content';
import { simulateInput } from '../kana';
import { QUESTION_TYPE_INFO, type QuestionType } from './questionType';
import { readingMatches } from './reading';

/**
 * What a question asks for: the meaning, a kanji's on'yomi or kun'yomi, either of them (the kanji
 * accepts readings of both kinds), or a reading of no particular kind (vocabulary, or a kanji
 * reading question while the kind isn't shown).
 */
export type QuestionKind = 'meaning' | 'onyomi' | 'kunyomi' | 'both' | 'reading';

/** The subject fields read here. */
export interface KindSubject {
  readonly object: string;
  readonly readings: readonly Reading[];
}

/** Which kinds of readings a kanji accepts (`accepted_answer`): 'reading' when none is marked. */
export function acceptedKanjiReadingKind(subject: KindSubject): 'onyomi' | 'kunyomi' | 'both' | 'reading' {
  if (subject.object !== 'kanji') return 'reading';
  const on = subject.readings.some((r) => r.accepted_answer && r.type === 'onyomi');
  const kun = subject.readings.some((r) => r.accepted_answer && r.type === 'kunyomi');
  if (on && kun) return 'both';
  if (on) return 'onyomi';
  return kun ? 'kunyomi' : 'reading';
}

/**
 * The question's kind. `indicateKanjiReadingType` (the "Show the kind of reading asked for" setting)
 * decides whether a kanji reading question names the kind its lesson taught.
 */
export function questionKind(type: QuestionType, subject: KindSubject, indicateKanjiReadingType: boolean): QuestionKind {
  if (QUESTION_TYPE_INFO[type].meaning) return 'meaning';
  switch (type) {
    case 'WANIKANI_KANJI_ONYOMI':
      return 'onyomi';
    case 'WANIKANI_KANJI_KUNYOMI':
      return 'kunyomi';
    case 'WANIKANI_KANJI_READING':
      return indicateKanjiReadingType ? acceptedKanjiReadingKind(subject) : 'reading';
    default:
      return 'reading';
  }
}

/** What a retried answer was. */
export type RetryGiven =
  /** A reading typed for a meaning question. */
  | 'reading-for-meaning'
  /** One of the kanji's on'yomi / kun'yomi / nanori that this question doesn't take. */
  | 'onyomi' | 'kunyomi' | 'nanori'
  /** One of the word's readings that isn't accepted. */
  | 'other-reading'
  /** A reading of the word's kanji (single-kanji vocabulary, `shake_on_matching_kanji`). */
  | 'kanji-reading';

export interface RetryHint {
  given: RetryGiven;
  /** What the question wants instead. */
  wanted: QuestionKind;
}

/** The kind of a kanji reading ('onyomi' / 'kunyomi' / 'nanori'), null for any other. */
function kanjiReadingType(r: Reading): 'onyomi' | 'kunyomi' | 'nanori' | null {
  return r.type === 'onyomi' || r.type === 'kunyomi' || r.type === 'nanori' ? r.type : null;
}

/**
 * Why a retry verdict happened, for the hint over the question. `answer` is the submitted text;
 * `matchingKanji` the single-kanji vocabulary's kanji (as passed to `checkAnswer`). Null when the
 * retry isn't about the kind of answer (e.g. close-enough's shake), and always for a non-retry.
 * The kanji reading questions always name the kind wanted here: the shake already says the answer
 * is a real reading of the kanji.
 */
export function retryHint(
  type: QuestionType,
  subject: KindSubject,
  answer: string,
  matchingKanji: KindSubject | null,
  requireOnInKatakana: boolean,
): RetryHint | null {
  const info = QUESTION_TYPE_INFO[type];
  if (info.meaning) {
    const kana = simulateInput(answer);
    return subject.readings.some((r) => readingMatches(r, kana, false)) ? { given: 'reading-for-meaning', wanted: 'meaning' } : null;
  }
  const matched = subject.readings.find((r) => readingMatches(r, answer, requireOnInKatakana));
  switch (type) {
    case 'WANIKANI_KANJI_READING':
    case 'WANIKANI_KANJI_ONYOMI':
    case 'WANIKANI_KANJI_KUNYOMI': {
      if (matched === undefined) return null;
      const given = kanjiReadingType(matched);
      if (given === null) return null;
      return { given, wanted: questionKind(type, subject, true) };
    }
    case 'WANIKANI_VOCAB_READING': {
      if (matched !== undefined) return matched.accepted_answer ? null : { given: 'other-reading', wanted: 'reading' };
      if (matchingKanji !== null && matchingKanji.readings.some((r) => readingMatches(r, answer, requireOnInKatakana))) {
        return { given: 'kanji-reading', wanted: 'reading' };
      }
      return null;
    }
    default:
      return null;
  }
}

/** The kind's glyph on the badge. */
export const QUESTION_KIND_GLYPH: Readonly<Record<QuestionKind, string>> = {
  meaning: '意',
  onyomi: '音',
  kunyomi: '訓',
  both: '音訓',
  reading: '読',
};

/** The kind's label next to the glyph. */
export const QUESTION_KIND_LABEL: Readonly<Record<QuestionKind, string>> = {
  meaning: 'Meaning',
  onyomi: "On'yomi",
  kunyomi: "Kun'yomi",
  both: "On'yomi or kun'yomi",
  reading: 'Reading',
};

const GIVEN_TEXT: Readonly<Record<RetryGiven, string>> = {
  'reading-for-meaning': "That's a reading.",
  onyomi: "That's an on'yomi (音).",
  kunyomi: "That's a kun'yomi (訓).",
  nanori: "That's a name reading (nanori).",
  'other-reading': "That's another reading of this word.",
  'kanji-reading': "That's the kanji's reading.",
};

const WANTED_TEXT: Readonly<Record<QuestionKind, string>> = {
  meaning: "We're looking for the meaning (意).",
  onyomi: "We're looking for the on'yomi (音).",
  kunyomi: "We're looking for the kun'yomi (訓).",
  both: "We're looking for the reading taught in the lesson.",
  reading: "We're looking for this word's reading.",
};

/** The hint's text, e.g. "That's a kun'yomi (訓). We're looking for the on'yomi (音)." */
export function retryHintText(hint: RetryHint): string {
  // A kanji whose accepted readings carry no kind: the lesson's reading, whatever its kind.
  const wanted = hint.wanted === 'reading' && hint.given !== 'other-reading' && hint.given !== 'kanji-reading'
    && hint.given !== 'reading-for-meaning' ? WANTED_TEXT.both : WANTED_TEXT[hint.wanted];
  return `${GIVEN_TEXT[hint.given]} ${wanted}`;
}
