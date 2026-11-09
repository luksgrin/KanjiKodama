/**
 * DDL of the built content file. Layout and meaning of every table: `src/content/contentFile.ts`.
 * Bump `CONTENT_SCHEMA_VERSION` there whenever this changes.
 */

/** The static (content) columns of the WaniKani `subject` table, in its order; progress columns are dropped. */
export const SUBJECT_COLUMNS = [
  ['id', 'INTEGER PRIMARY KEY'],
  ['object', 'TEXT'],
  ['typeCode', 'INTEGER'],
  ['hiddenAt', 'INTEGER'],
  ['lessonPosition', 'INTEGER'],
  ['srsSystemId', 'INTEGER'],
  ['level', 'INTEGER'],
  ['characters', 'TEXT'],
  ['slug', 'TEXT'],
  ['documentUrl', 'TEXT'],
  ['meanings', 'TEXT'],
  ['meaningMnemonic', 'TEXT'],
  ['meaningHint', 'TEXT'],
  ['auxiliaryMeanings', 'TEXT'],
  ['readings', 'TEXT'],
  ['readingMnemonic', 'TEXT'],
  ['readingHint', 'TEXT'],
  ['componentSubjectIds', 'TEXT'],
  ['amalgamationSubjectIds', 'TEXT'],
  ['visuallySimilarSubjectIds', 'TEXT'],
  ['partsOfSpeech', 'TEXT'],
  ['contextSentences', 'TEXT'],
  ['pronunciationAudios', 'TEXT'],
  ['searchTarget', 'TEXT'],
  ['smallSearchTarget', 'TEXT'],
  ['frequency', 'INTEGER'],
  ['joyoGrade', 'INTEGER'],
  ['jlptLevel', 'INTEGER'],
] as const;

export type SubjectColumn = (typeof SUBJECT_COLUMNS)[number][0];

export const SRS_SYSTEM_COLUMNS = [
  'id', 'name', 'description', 'stages', 'unlockingStagePosition', 'startingStagePosition', 'passingStagePosition',
  'burningStagePosition',
] as const;

export const SCHEMA_SQL = `
CREATE TABLE content_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE subject (${SUBJECT_COLUMNS.map(([n, t]) => `${n} ${t}`).join(', ')});
CREATE TABLE srs_system (id INTEGER PRIMARY KEY, name TEXT, description TEXT, stages TEXT,
  unlockingStagePosition INTEGER, startingStagePosition INTEGER, passingStagePosition INTEGER, burningStagePosition INTEGER);
CREATE TABLE subject_order (id INTEGER PRIMARY KEY, wkLevel INTEGER NOT NULL, wkPosition INTEGER NOT NULL,
  jlptLevel INTEGER NOT NULL, jlptPosition INTEGER NOT NULL);
CREATE TABLE jlpt_block (level INTEGER PRIMARY KEY, block INTEGER NOT NULL);
CREATE TABLE jlpt_kanji (characters TEXT PRIMARY KEY, level INTEGER NOT NULL);
CREATE TABLE stroke_data (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE pitch_info (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE title_image (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE radical (ordinal INTEGER PRIMARY KEY, glyph TEXT NOT NULL, strokes INTEGER NOT NULL, kanji TEXT NOT NULL);
`;

/** Parts/Sound tables copied from `sound-components.db` with their own DDL, in this order. */
export const SOUND_TABLES = ['kanji_part', 'kanji_sound', 'series', 'series_member'] as const;
