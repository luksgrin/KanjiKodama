/**
 * What the search code reads of a subject: the content columns (including the text-only ones the
 * rest of the logic doesn't need: mnemonics, hints, context sentences and the precomputed
 * `searchTarget`/`smallSearchTarget`), and the learner's progress columns.
 */

import type { AuxiliaryMeaning, ContentSubject, Meaning, Reading, SubjectObject } from '../content';
import { SUBJECT_TYPE_BY_OBJECT, type SubjectTypeName } from '../content';

/** `api/model/ContextSentence`. */
export interface ContextSentence {
  en: string | null;
  ja: string | null;
}

/**
 * The content text columns search needs beyond `ContentSubject`. In the content DB they are
 * `meaningMnemonic`, `meaningHint`, `readingMnemonic`, `readingHint`, `contextSentences`,
 * `searchTarget` and `smallSearchTarget`; for the extra kanji and words `ExtraContent` builds the
 * last two (see `extraSearchTargets`).
 */
export interface SubjectSearchText {
  meaningMnemonic: string | null;
  meaningHint: string | null;
  readingMnemonic: string | null;
  readingHint: string | null;
  contextSentences: ContextSentence[];
  searchTarget: string | null;
  smallSearchTarget: string | null;
}

/** The progress columns search reads. */
export interface SubjectSearchProgress {
  srsStage: number;
  unlockedAt: number;
  availableAt: number;
  burnedAt: number;
  lastIncorrectAnswer: number;
  leechScore: number;
  /** The star rating (stored in the `typeCode` column; 0 = unrated). */
  stars: number;
  meaningNote: string | null;
  readingNote: string | null;
  /** `Subject.getMeaningSynonyms`: parsed, null and blank entries dropped. */
  meaningSynonyms: string[];
}

export const NO_PROGRESS: SubjectSearchProgress = {
  srsStage: 0,
  unlockedAt: 0,
  availableAt: 0,
  burnedAt: 0,
  lastIncorrectAnswer: 0,
  leechScore: 0,
  stars: 0,
  meaningNote: null,
  readingNote: null,
  meaningSynonyms: [],
};

/** One subject as the search sees it. */
export interface SearchSubject extends SubjectSearchText, SubjectSearchProgress {
  id: number;
  object: SubjectObject;
  /** 0 when visible. */
  hiddenAt: number;
  level: number;
  lessonPosition: number;
  srsSystemId: number;
  characters: string | null;
  slug: string | null;
  meanings: Meaning[];
  auxiliaryMeanings: AuxiliaryMeaning[];
  readings: Reading[];
  partsOfSpeech: string[];
  frequency: number;
  joyoGrade: number;
  jlptLevel: number;
}

export const EMPTY_TEXT: SubjectSearchText = {
  meaningMnemonic: null,
  meaningHint: null,
  readingMnemonic: null,
  readingHint: null,
  contextSentences: [],
  searchTarget: null,
  smallSearchTarget: null,
};

/** Combines content, text and progress into a `SearchSubject`. */
export function searchSubject(
  content: ContentSubject,
  text: SubjectSearchText = EMPTY_TEXT,
  progress: SubjectSearchProgress = NO_PROGRESS,
  hiddenAt: number = content.hiddenAt,
): SearchSubject {
  return {
    ...text,
    ...progress,
    id: content.id,
    object: content.object,
    hiddenAt,
    level: content.level,
    lessonPosition: content.lessonPosition,
    srsSystemId: content.srsSystemId,
    characters: content.characters,
    slug: content.slug,
    meanings: content.meanings,
    auxiliaryMeanings: content.auxiliaryMeanings,
    readings: content.readings,
    partsOfSpeech: content.partsOfSpeech,
    frequency: content.frequency,
    joyoGrade: content.joyoGrade,
    jlptLevel: content.jlptLevel,
  };
}

/** `SubjectType.getOrder`: radicals 10, kanji 20, vocabulary and kana vocabulary 30. */
export function typeOrder(object: SubjectObject): number {
  return object === 'radical' ? 10 : object === 'kanji' ? 20 : 30;
}

/** `Subject.getType().name()`. */
export function typeName(object: SubjectObject): SubjectTypeName {
  return SUBJECT_TYPE_BY_OBJECT[object];
}

/** `Subject.getOneMeaning`: the primary meaning, else an accepted one, else the last; "" when none. */
export function oneMeaning(meanings: readonly Meaning[]): string | null {
  if (meanings.length === 0) return '';
  let t = meanings[0] as Meaning;
  for (let i = 1; i < meanings.length; i++) {
    const u = meanings[i] as Meaning;
    if (t.primary) continue;
    if (u.primary) {
      t = u;
      continue;
    }
    if (t.accepted_answer) continue;
    t = u;
  }
  return t.meaning;
}

/** `ExtraContent.searchTarget` and the `smallSearchTarget` it stores (the characters). */
export function extraSearchTargets(
  characters: string,
  meanings: readonly Meaning[],
  readings: readonly Reading[],
): { searchTarget: string; smallSearchTarget: string } {
  let sb = `${characters} ${characters}`;
  for (const m of meanings) sb += ` ${String(m.meaning)}`;
  for (const r of readings) sb += ` ${String(r.reading)}`;
  return { searchTarget: sb, smallSearchTarget: characters };
}
