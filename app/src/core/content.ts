/**
 * The read-only content the logic works on: subjects and SRS systems, as stored in the content DB
 * (`wk-content.db`, tables `subject` and `srs_system`). Only static content lives here; a learner's
 * progress (stages, timestamps, synonyms, notes) is separate.
 *
 * The JSON-shaped parts keep the field names the DB stores (`accepted_answer`), like the golden
 * fixtures, so adapters can pass fixture objects straight through. `app/src/content/` maps DB rows
 * to these types; core never touches sql.js.
 */

/** `SubjectType` by its `object` name. */
export type SubjectObject = 'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary';

/** The `SubjectType` enum names, in `typeCode` order (0..3). */
export const SUBJECT_TYPES = ['WANIKANI_RADICAL', 'WANIKANI_KANJI', 'WANIKANI_VOCAB', 'WANIKANI_KANA_VOCAB'] as const;
export type SubjectTypeName = (typeof SUBJECT_TYPES)[number];

export const SUBJECT_TYPE_BY_OBJECT: Readonly<Record<SubjectObject, SubjectTypeName>> = {
  radical: 'WANIKANI_RADICAL',
  kanji: 'WANIKANI_KANJI',
  vocabulary: 'WANIKANI_VOCAB',
  kana_vocabulary: 'WANIKANI_KANA_VOCAB',
};

/** `api/model/Meaning`. Java keeps a missing `meaning` as null. */
export interface Meaning {
  meaning: string | null;
  primary: boolean;
  accepted_answer: boolean;
}

/** `api/model/AuxiliaryMeaning`: `type` is `whitelist` or `blacklist`. */
export interface AuxiliaryMeaning {
  meaning: string | null;
  type: string | null;
}

/** `api/model/Reading`: `type` is `onyomi`, `kunyomi`, `nanori` for kanji, absent for vocabulary. */
export interface Reading {
  reading: string | null;
  primary: boolean;
  accepted_answer: boolean;
  type?: string | null;
}

/** One content subject: the static columns of the `subject` table. */
export interface ContentSubject {
  id: number;
  object: SubjectObject;
  /** 0 visible; otherwise the time WaniKani hid it (hidden subjects are never taught). */
  hiddenAt: number;
  lessonPosition: number;
  srsSystemId: number;
  level: number;
  /** Null for the radicals that only have an image (19 in the current content). */
  characters: string | null;
  slug: string | null;
  meanings: Meaning[];
  auxiliaryMeanings: AuxiliaryMeaning[];
  /** Empty for radicals: the DB stores NULL, which Java's `Subject.getReadings` turns into []. */
  readings: Reading[];
  componentSubjectIds: number[];
  amalgamationSubjectIds: number[];
  visuallySimilarSubjectIds: number[];
  partsOfSpeech: string[];
  /**
   * Reference data. The content DB stores 0; the Java app fills these at runtime
   * (`LoadReferenceDataTask` from `ReferenceDataUtil`). The content builder (step 4) precomputes them.
   */
  frequency: number;
  joyoGrade: number;
  jlptLevel: number;
}

/** One SRS stage of `srs_system.stages`; `interval` in `interval_unit` (always seconds), null for stage 0/9. */
export interface SrsStageData {
  position: number;
  interval: number | null;
  interval_unit: string;
}

/** A row of `srs_system`. */
export interface SrsSystemData {
  id: number;
  name: string;
  description: string;
  stages: SrsStageData[];
  unlockingStagePosition: number;
  startingStagePosition: number;
  passingStagePosition: number;
  burningStagePosition: number;
}

/** All content, indexed. */
export interface Content {
  /** In id order. */
  subjects: readonly ContentSubject[];
  byId: ReadonlyMap<number, ContentSubject>;
  srsSystems: readonly SrsSystemData[];
}

/** Builds the `Content` index from plain rows. */
export function makeContent(subjects: readonly ContentSubject[], srsSystems: readonly SrsSystemData[]): Content {
  const sorted = [...subjects].sort((a, b) => a.id - b.id);
  return { subjects: sorted, byId: new Map(sorted.map((s) => [s.id, s])), srsSystems };
}
