import { makeContent, type Content, type ContentSubject } from '../core/content';

/**
 * The lookup tables of `util/ReferenceDataUtil` (the app's `res/raw/*.json`): characters → value.
 * `kanjidic_freq.json`, `wikipedia_joyo_grades.json`, `kanji_jlpt_levels.json`, `vocab_jlpt_levels.json`.
 */
export interface ReferenceTables {
  frequency: Readonly<Record<string, number>>;
  joyoGrade: Readonly<Record<string, number>>;
  kanjiJlptLevel: Readonly<Record<string, number>>;
  vocabJlptLevel: Readonly<Record<string, number>>;
}

const lookup = (table: Readonly<Record<string, number>>, characters: string): number =>
  Object.prototype.hasOwnProperty.call(table, characters) ? (table[characters] ?? 0) : 0;

/**
 * `ReferenceDataUtil.getFrequency`/`getJoyoGrade`/`getJlptLevel` for one subject: frequency and Jōyō
 * grade for kanji only; JLPT level for kanji and (non-kana-only) vocabulary; 0 when not listed.
 */
export function referenceData(subject: ContentSubject, tables: ReferenceTables): { frequency: number; joyoGrade: number; jlptLevel: number } {
  const c = subject.characters;
  if (c === null) return { frequency: 0, joyoGrade: 0, jlptLevel: 0 };
  const kanji = subject.object === 'kanji';
  return {
    frequency: kanji ? lookup(tables.frequency, c) : 0,
    joyoGrade: kanji ? lookup(tables.joyoGrade, c) : 0,
    jlptLevel: kanji ? lookup(tables.kanjiJlptLevel, c) : subject.object === 'vocabulary' ? lookup(tables.vocabJlptLevel, c) : 0,
  };
}

/**
 * `tasks/LoadReferenceDataTask` over all content: every subject's frequency, Jōyō grade and JLPT level
 * from the tables (the content DB stores 0; the extra kanji's own JLPT level is replaced too, as on
 * the device). The content builder precomputes this in step 4.
 */
export function withReferenceData(content: Content, tables: ReferenceTables): Content {
  return makeContent(content.subjects.map((s) => ({ ...s, ...referenceData(s, tables) })), content.srsSystems);
}
