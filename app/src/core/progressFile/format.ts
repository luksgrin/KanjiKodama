/**
 * The progress file format: its tags, the columns it saves, and the column types that decide how
 * restored values are stored.
 */

/** The file's `format` tag. */
export const FORMAT = 'kanjikodama-progress';
/** The `format` tag of files saved before the app's rename; same content. */
export const LEGACY_FORMAT = 'mojimori-progress';
/** The file format version. */
export const VERSION = 1;

/** Numeric progress columns of the subject table, in file order. */
export const NUMERIC_COLUMNS = [
  'availableAt', 'burnedAt', 'passedAt', 'resurrectedAt', 'startedAt', 'unlockedAt', 'srsStage',
  'lastIncorrectAnswer', 'assignmentId', 'studyMaterialId', 'reviewStatisticId',
  'meaningCorrect', 'meaningIncorrect', 'meaningMaxStreak', 'meaningCurrentStreak',
  'readingCorrect', 'readingIncorrect', 'readingMaxStreak', 'readingCurrentStreak',
  'percentageCorrect', 'leechScore', 'levelProgressScore',
  'passed', 'resurrected', 'assignmentPatched', 'studyMaterialPatched', 'statisticPatched',
] as const;
export type NumericColumn = (typeof NUMERIC_COLUMNS)[number];

/** The learner's own notes and synonyms. */
export const TEXT_COLUMNS = ['meaningNote', 'meaningSynonyms', 'readingNote'] as const;
export type TextColumn = (typeof TEXT_COLUMNS)[number];

export type SubjectColumn = NumericColumn | TextColumn;
/** All saved subject columns in file order (after `id`). */
export const SUBJECT_COLUMNS: readonly SubjectColumn[] = [...NUMERIC_COLUMNS, ...TEXT_COLUMNS];

/** Level progression columns, in file order. */
export const LEVEL_PROGRESSION_COLUMNS = [
  'id', 'level', 'abandonedAt', 'completedAt', 'createdAt', 'passedAt', 'startedAt', 'unlockedAt',
] as const;
export type LevelProgressionColumn = (typeof LEVEL_PROGRESSION_COLUMNS)[number];

/** Numeric subject columns the schema declares nullable: a restored null stays NULL. */
export const NULLABLE_NUMERIC_COLUMNS: ReadonlySet<SubjectColumn> = new Set<SubjectColumn>([
  'availableAt', 'burnedAt', 'passedAt', 'resurrectedAt', 'startedAt', 'unlockedAt', 'lastIncorrectAnswer',
]);

/** Level progression columns the schema declares NOT NULL. */
export const NOT_NULL_LEVEL_PROGRESSION_COLUMNS: ReadonlySet<LevelProgressionColumn> = new Set<LevelProgressionColumn>([
  'id', 'level',
]);

/**
 * A stored SQLite value: NULL, INTEGER (an integral number), REAL (a non-integral number) or TEXT.
 * INTEGER affinity turns an integral REAL into INTEGER, so integral numbers are always INTEGER;
 * values beyond 2^53 lose precision (none occur: ids and epoch ms are far below).
 */
export type SqlValue = null | number | string;

/** One subject's saved progress columns. Every column is present; the defaults are 0 and NULL. */
export type SubjectProgressRow = Record<SubjectColumn, SqlValue>;

/** A `level_progression` row. */
export type LevelProgressionRow = Record<LevelProgressionColumn, SqlValue>;

/** A row of `mm_jump`: a fast-travel jump. */
export interface Jump {
  at: number;
  fromLevel: number;
  toLevel: number;
}

/** `Curriculum.Mode`. */
export type CurriculumMode = 'WANIKANI' | 'JLPT';

/** A fresh subject row, as a full reset leaves it. */
export function emptySubjectRow(): SubjectProgressRow {
  const row = {} as SubjectProgressRow;
  for (const c of NUMERIC_COLUMNS) row[c] = 0;
  for (const c of TEXT_COLUMNS) row[c] = null;
  return row;
}

/** A numeric column read as an integer: NULL and text that isn't a number are 0. */
export function numberOf(value: SqlValue): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) && value.trim() !== '' ? Math.trunc(n) : 0;
  }
  return 0;
}
