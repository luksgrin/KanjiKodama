/**
 * The 8 question types, their flags, and `checkAnswer`; plus the question types each subject type
 * gets.
 */
import type { AuxiliaryMeaning, Meaning, Reading, SubjectObject } from '../content';
import { simulateInput } from '../kana';
import { fuzzyMatches } from './fuzzy';
import { stringSetOrder } from './stringHashOrder';
import { isKunYomi, isOnYomi, readingMatches, readingMatchesForDigraph } from './reading';
import { type AnswerVerdict, type CloseEnoughAction, NOK_WITH_RETRY, NOK_WITHOUT_RETRY, makeVerdict } from './verdict';

/** The `QuestionType` enum names, in declaration order. */
export const QUESTION_TYPES = [
  'WANIKANI_RADICAL_NAME',
  'WANIKANI_KANJI_MEANING',
  'WANIKANI_VOCAB_MEANING',
  'WANIKANI_KANA_VOCAB_MEANING',
  'WANIKANI_KANJI_READING',
  'WANIKANI_VOCAB_READING',
  'WANIKANI_KANJI_ONYOMI',
  'WANIKANI_KANJI_KUNYOMI',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** The constructor arguments of each `QuestionType`. */
export interface QuestionTypeInfo {
  readonly meaning: boolean;
  readonly reading: boolean;
  /** The answer field converts romaji to kana. */
  readonly kana: boolean;
  readonly ascii: boolean;
  readonly slot: number;
  readonly shortTitle: string;
}

export const QUESTION_TYPE_INFO: Readonly<Record<QuestionType, QuestionTypeInfo>> = {
  WANIKANI_RADICAL_NAME: { meaning: true, reading: false, kana: false, ascii: true, slot: 1, shortTitle: 'Name' },
  WANIKANI_KANJI_MEANING: { meaning: true, reading: false, kana: false, ascii: true, slot: 1, shortTitle: 'Meaning' },
  WANIKANI_VOCAB_MEANING: { meaning: true, reading: false, kana: false, ascii: true, slot: 1, shortTitle: 'Meaning' },
  WANIKANI_KANA_VOCAB_MEANING: { meaning: true, reading: false, kana: false, ascii: true, slot: 1, shortTitle: 'Meaning' },
  WANIKANI_KANJI_READING: { meaning: false, reading: true, kana: true, ascii: false, slot: 2, shortTitle: 'Reading' },
  WANIKANI_VOCAB_READING: { meaning: false, reading: true, kana: true, ascii: false, slot: 2, shortTitle: 'Reading' },
  WANIKANI_KANJI_ONYOMI: { meaning: false, reading: true, kana: true, ascii: false, slot: 3, shortTitle: "On'yomi" },
  WANIKANI_KANJI_KUNYOMI: { meaning: false, reading: true, kana: true, ascii: false, slot: 4, shortTitle: "Kun'yomi" },
};

/** On'yomi/kun'yomi split kanji readings in two. */
export function possibleQuestionTypes(object: SubjectObject, onkun: boolean): readonly QuestionType[] {
  switch (object) {
    case 'radical':
      return ['WANIKANI_RADICAL_NAME'];
    case 'kanji':
      return onkun
        ? ['WANIKANI_KANJI_MEANING', 'WANIKANI_KANJI_ONYOMI', 'WANIKANI_KANJI_KUNYOMI']
        : ['WANIKANI_KANJI_MEANING', 'WANIKANI_KANJI_READING'];
    case 'vocabulary':
      return ['WANIKANI_VOCAB_MEANING', 'WANIKANI_VOCAB_READING'];
    case 'kana_vocabulary':
      return ['WANIKANI_KANA_VOCAB_MEANING'];
  }
}

/** What `checkAnswer` reads from a subject: the parsed JSON columns. */
export interface CheckSubject {
  readonly meanings: readonly Meaning[];
  readonly auxiliaryMeanings: readonly AuxiliaryMeaning[];
  /** `Subject.getReadings`: [] when the column is empty. */
  readonly readings: readonly Reading[];
}

/** Optional inputs of `checkAnswer`. */
export interface CheckOptions {
  /** The user's synonyms, already parsed (blank ones dropped; a null throws NullPointerException). */
  readonly meaningSynonyms?: readonly (string | null)[];
  /**
   * For a single-kanji vocabulary reading: the kanji with those characters,
   * when the "matching kanji" setting is on. One of its readings gives a retry instead of a fail.
   */
  readonly matchingKanji?: CheckSubject | null;
  readonly closeEnoughAction: CloseEnoughAction;
  /** `require_on_in_katakana`: on'yomi only count when typed in katakana. */
  readonly requireOnInKatakana: boolean;
}

/**
 * The meaning types' `checkAnswer` (identical for all four): accepted meanings, whitelisted auxiliary
 * meanings and synonyms vs rejected meanings and blacklisted auxiliary meanings, collected in hash
 * sets (whose iteration order decides `matchedAnswer` on ties). A wrong answer that is one of
 * the subject's readings when typed through the IME gets a retry.
 */
function checkMeaning(subject: CheckSubject, answer: string, o: CheckOptions): AnswerVerdict {
  const accepted: (string | null)[] = [];
  const rejected: (string | null)[] = [];
  for (const m of subject.meanings) (m.accepted_answer ? accepted : rejected).push(m.meaning);
  for (const m of subject.auxiliaryMeanings) {
    if (m.type === 'whitelist') accepted.push(m.meaning);
    else if (m.type === 'blacklist') rejected.push(m.meaning);
  }
  accepted.push(...(o.meaningSynonyms ?? []));
  // A null meaning (or synonym) makes cleanString throw NullPointerException.
  const verdict = fuzzyMatches(answer, stringSetOrder(accepted), stringSetOrder(rejected), o.closeEnoughAction);
  if (!verdict.ok && !verdict.retry) {
    const kanaAnswer = simulateInput(answer);
    for (const r of subject.readings) {
      if (readingMatches(r, kanaAnswer, false)) return NOK_WITH_RETRY;
    }
  }
  return verdict;
}

function accepted(r: Reading, answer: string): AnswerVerdict {
  return makeVerdict(true, false, false, answer, r.reading, null);
}

/** `checkAnswer` for one question type. */
export function checkAnswer(
  questionType: QuestionType,
  subject: CheckSubject,
  answer: string,
  options: CheckOptions,
): AnswerVerdict {
  const kata = options.requireOnInKatakana;
  const readings = subject.readings;
  switch (questionType) {
    case 'WANIKANI_RADICAL_NAME':
    case 'WANIKANI_KANJI_MEANING':
    case 'WANIKANI_VOCAB_MEANING':
    case 'WANIKANI_KANA_VOCAB_MEANING':
      return checkMeaning(subject, answer, options);

    case 'WANIKANI_KANJI_READING': {
      for (const r of readings) if (r.accepted_answer && readingMatches(r, answer, kata)) return accepted(r, answer);
      for (const r of readings) {
        if (!r.accepted_answer && readingMatches(r, answer, kata)) return makeVerdict(false, true, false, answer, r.reading, null);
      }
      for (const r of readings) {
        if (!r.accepted_answer) continue;
        const match = readingMatchesForDigraph(r, answer);
        if (match !== null) return makeVerdict(false, false, false, answer, r.reading, match);
      }
      return NOK_WITHOUT_RETRY;
    }

    case 'WANIKANI_VOCAB_READING': {
      for (const r of readings) if (r.accepted_answer && readingMatches(r, answer, kata)) return accepted(r, answer);
      for (const r of readings) {
        if (!r.accepted_answer && readingMatches(r, answer, kata)) return makeVerdict(false, true, false, answer, r.reading, null);
      }
      if (options.matchingKanji) {
        for (const r of options.matchingKanji.readings) if (readingMatches(r, answer, kata)) return NOK_WITH_RETRY;
      }
      for (const r of readings) {
        const match = readingMatchesForDigraph(r, answer);
        if (match !== null) return makeVerdict(false, false, false, answer, r.reading, match);
      }
      return NOK_WITHOUT_RETRY;
    }

    case 'WANIKANI_KANJI_ONYOMI':
    case 'WANIKANI_KANJI_KUNYOMI': {
      const onyomi = questionType === 'WANIKANI_KANJI_ONYOMI';
      const ofKind = readings.filter(onyomi ? isOnYomi : isKunYomi);
      for (const r of ofKind) if (r.accepted_answer && readingMatches(r, answer, kata)) return accepted(r, answer);
      // Subject.hasAcceptedOnYomi / hasAcceptedKunYomi: with no accepted reading of this kind, any of them counts.
      if (!ofKind.some((r) => r.accepted_answer)) {
        for (const r of ofKind) if (readingMatches(r, answer, kata)) return accepted(r, answer);
      }
      for (const r of readings) if (readingMatches(r, answer, kata)) return NOK_WITH_RETRY;
      // On'yomi checks digraphs against every reading, kun'yomi only against accepted ones.
      for (const r of readings) {
        if (!onyomi && !r.accepted_answer) continue;
        const match = readingMatchesForDigraph(r, answer);
        if (match !== null) return makeVerdict(false, false, false, answer, r.reading, match);
      }
      return NOK_WITHOUT_RETRY;
    }
  }
}
