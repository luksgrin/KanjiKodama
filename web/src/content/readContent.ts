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
export function subjectRow(row: Record<string, unknown>, parsed?: Record<string, unknown>): ContentSubject {
  const arr = <T,>(c: string): T[] => (parsed !== undefined ? (parsed[c] as T[]) : jsonArray<T>(row[c]));
  return {
    id: num(row.id),
    object: String(row.object) as SubjectObject,
    hiddenAt: num(row.hiddenAt),
    lessonPosition: num(row.lessonPosition),
    srsSystemId: num(row.srsSystemId),
    level: num(row.level),
    characters: str(row.characters),
    slug: str(row.slug),
    meanings: arr('meanings'),
    auxiliaryMeanings: arr('auxiliaryMeanings'),
    readings: arr('readings'),
    componentSubjectIds: arr('componentSubjectIds'),
    amalgamationSubjectIds: arr('amalgamationSubjectIds'),
    visuallySimilarSubjectIds: arr('visuallySimilarSubjectIds'),
    partsOfSpeech: arr('partsOfSpeech'),
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

const JSON_COLUMNS: ReadonlySet<string> = new Set([
  'meanings', 'auxiliaryMeanings', 'readings', 'componentSubjectIds', 'amalgamationSubjectIds',
  'visuallySimilarSubjectIds', 'partsOfSpeech',
]);

/**
 * All subject rows in one SQL result: SQLite builds one JSON text (the JSON columns embedded as JSON),
 * which is decoded and parsed once. Start-up: ~10k rows × 18 columns read cell by cell cost ~0.1 s
 * in the Android WebView (one wasm→JS string per cell). Null when the SQLite build has no JSON
 * functions or a JSON column is not valid JSON; the caller then reads the rows one by one.
 */
function subjectRowsAsJson(db: Database): Record<string, unknown>[] | null {
  const cells = SUBJECT_ROW_COLUMNS.map((c) =>
    JSON_COLUMNS.has(c) ? `CASE WHEN typeof(${c}) = 'text' AND ${c} <> '' THEN json(${c}) ELSE NULL END` : c);
  try {
    const res = db.exec(`SELECT json_group_array(json_array(${cells.join(', ')})) FROM (SELECT * FROM subject ORDER BY id)`);
    const text = res[0]?.values[0]?.[0];
    if (typeof text !== 'string') return null;
    const list = JSON.parse(text) as unknown[][];
    return list.map((values) => {
      const row: Record<string, unknown> = {};
      SUBJECT_ROW_COLUMNS.forEach((c, i) => {
        const v = values[i];
        // jsonArray takes the column's text: hand the parsed value back as text only when it is not an array.
        row[c] = JSON_COLUMNS.has(c) ? (v === null ? null : Array.isArray(v) ? v : JSON.stringify(v)) : v;
      });
      return row;
    });
  } catch {
    return null;
  }
}

const subjectFromFastRow = (row: Record<string, unknown>): ContentSubject => {
  const arrays: Record<string, unknown> = {};
  for (const c of JSON_COLUMNS) {
    const v = row[c];
    arrays[c] = Array.isArray(v) ? v : jsonArray(v);
  }
  return subjectRow(row, arrays);
};

/** Reads all subjects and SRS systems of an open content DB. */
export function readContent(db: Database): Content {
  const fast = subjectRowsAsJson(db);
  return makeContent(
    fast !== null ? fast.map(subjectFromFastRow)
      : rows(db, `SELECT ${SUBJECT_ROW_COLUMNS.join(', ')} FROM subject ORDER BY id`).map((r) => subjectRow(r)),
    rows(db, 'SELECT * FROM srs_system ORDER BY id').map(srsSystemRow),
  );
}
