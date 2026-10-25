import type { Database } from 'sql.js';
import {
  makeContent,
  type Content,
  type ContentSubject,
  type SrsSystemData,
  type SubjectObject,
} from '../core/content';

/** JSON text column → array; NULL or empty text → [] (as Java's Subject getters do). */
function jsonArray<T>(value: unknown): T[] {
  if (typeof value !== 'string' || value === '') return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0));
const str = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

function rows(db: Database, sql: string): Record<string, unknown>[] {
  const stmt = db.prepare(sql);
  const out: Record<string, unknown>[] = [];
  try {
    while (stmt.step()) out.push(stmt.getAsObject());
  } finally {
    stmt.free();
  }
  return out;
}

/** Maps one `subject` row to the core type. */
export function subjectRow(row: Record<string, unknown>): ContentSubject {
  return {
    id: num(row.id),
    object: String(row.object) as SubjectObject,
    hiddenAt: num(row.hiddenAt),
    lessonPosition: num(row.lessonPosition),
    srsSystemId: num(row.srsSystemId),
    level: num(row.level),
    characters: str(row.characters),
    slug: str(row.slug),
    meanings: jsonArray(row.meanings),
    auxiliaryMeanings: jsonArray(row.auxiliaryMeanings),
    readings: jsonArray(row.readings),
    componentSubjectIds: jsonArray(row.componentSubjectIds),
    amalgamationSubjectIds: jsonArray(row.amalgamationSubjectIds),
    visuallySimilarSubjectIds: jsonArray(row.visuallySimilarSubjectIds),
    partsOfSpeech: jsonArray(row.partsOfSpeech),
    frequency: num(row.frequency),
    joyoGrade: num(row.joyoGrade),
    jlptLevel: num(row.jlptLevel),
  };
}

/** Maps one `srs_system` row to the core type. */
export function srsSystemRow(row: Record<string, unknown>): SrsSystemData {
  return {
    id: num(row.id),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    stages: jsonArray(row.stages),
    unlockingStagePosition: num(row.unlockingStagePosition),
    startingStagePosition: num(row.startingStagePosition),
    passingStagePosition: num(row.passingStagePosition),
    burningStagePosition: num(row.burningStagePosition),
  };
}

/**
 * The `subject` columns `subjectRow` maps: all start-up reads. The heavy text columns (mnemonics,
 * hints, context sentences, pronunciation audio, search targets) stay in the open database and are
 * read on demand: per item with `readSubjectTexts` (ui/components/subject/subjectContent.ts), for
 * search once with `readSearchTexts` (ui/screens/browse/searchData.ts), audio with
 * `readAudioCatalog` (content/audio.ts).
 */
export const SUBJECT_ROW_COLUMNS = [
  'id', 'object', 'hiddenAt', 'lessonPosition', 'srsSystemId', 'level', 'characters', 'slug', 'meanings',
  'auxiliaryMeanings', 'readings', 'componentSubjectIds', 'amalgamationSubjectIds', 'visuallySimilarSubjectIds',
  'partsOfSpeech', 'frequency', 'joyoGrade', 'jlptLevel',
] as const;

/** Reads all subjects and SRS systems of an open content DB. */
export function readContent(db: Database): Content {
  return makeContent(
    rows(db, `SELECT ${SUBJECT_ROW_COLUMNS.join(', ')} FROM subject ORDER BY id`).map(subjectRow),
    rows(db, 'SELECT * FROM srs_system ORDER BY id').map(srsSystemRow),
  );
}
