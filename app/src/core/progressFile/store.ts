/**
 * The progress a progress file saves and restores, as plain data: the subject progress columns,
 * the level progression rows, the user level, the curriculum mode, probation and jumps. `export`
 * writes the file text byte for byte (`org.json`, indent 1); `restore` applies a file, including
 * SQLite's column affinity for the stored values.
 *
 * Not here (the caller's job): adopting the curriculum (re-laying the levels for the mode) and
 * `afterChange` (`updateProgression`, which may unlock subjects).
 */

import {
  TypedError,
  TypedNumber,
  JSONArray,
  JSONObject,
  JSON_NULL,
  arrayGetInt,
  arrayGetJSONArray,
  arrayGetJSONObject,
  arrayGetLong,
  getJSONArray,
  has,
  opt,
  optInt,
  optJSONArray,
  optLong,
  optString,
  parseJsonObject,
  toIndentedJsonString,
  toJsonString,
  type JsonValue,
} from './androidJson';
import { describe, type DateStyle } from './describe';
import {
  FORMAT,
  LEVEL_PROGRESSION_COLUMNS,
  NOT_NULL_LEVEL_PROGRESSION_COLUMNS,
  NULLABLE_NUMERIC_COLUMNS,
  SUBJECT_COLUMNS,
  TEXT_COLUMNS,
  VERSION,
  emptySubjectRow,
  type CurriculumMode,
  type Jump,
  type LevelProgressionRow,
  type SqlValue,
  type SubjectColumn,
  type SubjectProgressRow,
} from './format';
import { activityJson } from '../stats/file';
import type { ActivityLog } from '../stats/activity';
import type { WritingRecord } from '../writing/record';

const WRITING_FIELDS = ['id', 'attempts', 'clean', 'level', 'lastPracticed', 'nextDue'] as const;

/** Everything a progress file holds. */
export interface ProgressState {
  userLevel: number;
  curriculum: CurriculumMode;
  /** Progress per subject id, for every subject the content has (absent: an empty row). */
  subjects: Map<number, SubjectProgressRow>;
  /** By `id`. */
  levelProgression: Map<number, LevelProgressionRow>;
  /** `mm_probation`: subject id → since. */
  probation: Map<number, number>;
  /** `mm_jump`, in insertion order. */
  jumps: Jump[];
}

/** A full reset (the progress part): level 1, nothing started, no history. */
export function emptyProgress(curriculum: CurriculumMode = 'WANIKANI'): ProgressState {
  return {
    userLevel: 1,
    curriculum,
    subjects: new Map(),
    levelProgression: new Map(),
    probation: new Map(),
    jumps: [],
  };
}

/** A subject's row, or the empty defaults. */
export function subjectRow(state: ProgressState, id: number): SubjectProgressRow {
  return state.subjects.get(id) ?? emptySubjectRow();
}

// --- Export ---

function sqlToJson(value: SqlValue): JsonValue | undefined {
  if (value === null) return undefined;
  if (typeof value === 'string') return value;
  return Number.isInteger(value) ? TypedNumber.long(BigInt(value)) : TypedNumber.double(value);
}

function rowObject(id: number | null, cols: readonly string[], row: Record<string, SqlValue>): JSONObject {
  const o = new JSONObject();
  if (id !== null) o.map.set('id', TypedNumber.long(BigInt(id)));
  for (const c of cols) {
    const v = sqlToJson(row[c] ?? null);
    if (v !== undefined) o.map.set(c, v);
  }
  return o;
}

/** The export query's filter: unlocked, or with notes or synonyms, or with answers. */
function isSaved(row: SubjectProgressRow): boolean {
  const n = (c: SubjectColumn): number => {
    const v = row[c];
    return typeof v === 'number' ? v : 0;
  };
  const unlocked = row.unlockedAt;
  return (unlocked !== null && unlocked !== 0 && unlocked !== '0')
    || row.meaningNote !== null || row.meaningSynonyms !== null || row.readingNote !== null
    || n('meaningCorrect') + n('meaningIncorrect') + n('readingCorrect') + n('readingIncorrect') > 0;
}

/**
 * The file text, byte for byte (`JSONObject.toString(1)`). `now` is the `exportedAt`. `activity`, the
 * study activity log, is added as `activity` after `jumps` when it has a day with study
 * (`stats/file.ts`). `writing`, the writing practice records (core/writing), goes after it as
 * `writing` when there are any. Without them the file is what it always was.
 */
export function exportProgress(state: ProgressState, now: number, activity?: ActivityLog, writing: readonly WritingRecord[] = []): string {
  const root = new JSONObject();
  root.map.set('format', FORMAT);
  root.map.set('version', TypedNumber.int(VERSION));
  root.map.set('exportedAt', TypedNumber.long(BigInt(now)));
  root.map.set('userLevel', TypedNumber.int(state.userLevel));

  const levels = new JSONArray();
  const lpRows = [...state.levelProgression.values()].sort(
    (a, b) => (Number(a.level) - Number(b.level)) || (Number(a.id) - Number(b.id)),
  );
  for (const row of lpRows) levels.values.push(rowObject(null, LEVEL_PROGRESSION_COLUMNS, row));
  root.map.set('levelProgression', levels);

  const subjects = new JSONArray();
  const ids = [...state.subjects.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const row = state.subjects.get(id);
    if (row && isSaved(row)) subjects.values.push(rowObject(id, SUBJECT_COLUMNS, row));
  }
  root.map.set('subjects', subjects);

  root.map.set('curriculum', state.curriculum);
  const probation = new JSONArray();
  for (const [id, since] of [...state.probation].sort((a, b) => a[0] - b[0])) {
    const p = new JSONArray();
    p.values.push(TypedNumber.long(BigInt(id)), TypedNumber.long(BigInt(since)));
    probation.values.push(p);
  }
  root.map.set('probation', probation);
  const jumps = new JSONArray();
  const sortedJumps = state.jumps.map((j, i) => ({ j, i })).sort((a, b) => (a.j.at - b.j.at) || (a.i - b.i));
  for (const { j } of sortedJumps) {
    const row = new JSONArray();
    row.values.push(TypedNumber.long(BigInt(j.at)), TypedNumber.int(j.fromLevel), TypedNumber.int(j.toLevel));
    jumps.values.push(row);
  }
  root.map.set('jumps', jumps);
  const days = activity === undefined ? null : activityJson(activity);
  if (days !== null) root.map.set('activity', days);
  if (writing.length > 0) {
    const records = new JSONArray();
    for (const r of [...writing].sort((a, b) => a.id - b.id)) {
      const o = new JSONObject();
      for (const f of WRITING_FIELDS) o.map.set(f, TypedNumber.long(BigInt(r[f])));
      records.values.push(o);
    }
    root.map.set('writing', records);
  }
  return toIndentedJsonString(root, 1);
}

// --- Restore ---

/** How SQLite gets a value read from the file (`JSONObject.opt`): its bound type. */
type Bound = null | { kind: 'long'; value: bigint } | { kind: 'double'; value: number } | { kind: 'text'; value: string };

function bind(value: JsonValue | null | undefined): Bound {
  if (value === undefined || value === null || value === JSON_NULL) return null;
  if (typeof value === 'boolean') return { kind: 'long', value: value ? 1n : 0n };
  if (value instanceof TypedNumber) {
    return value.type === 'Double' ? { kind: 'double', value: value.doubleValue() } : { kind: 'long', value: value.longValue() };
  }
  if (typeof value === 'string') return { kind: 'text', value };
  return { kind: 'text', value: toJsonString(value) ?? 'null' };
}

/** SQLite's text form of a REAL (`%!.15g`). */
function sqliteRealText(d: number): string {
  if (Number.isInteger(d) && Math.abs(d) < 1e15) return `${d}.0`;
  const s = d.toPrecision(15);
  const [mant = '', exp] = s.split('e');
  const trimmed = mant.includes('.') ? mant.replace(/0+$/, '').replace(/\.$/, '.0') : mant;
  if (exp === undefined) return trimmed;
  const e = Number(exp);
  return `${trimmed}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
}

/** A well-formed SQLite numeric text (leading/trailing spaces allowed), as a number, else null. */
function numericText(text: string): number | null {
  const t = text.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Stores a bound value in a column of INTEGER (`integer`) or TEXT affinity. */
function store(b: Bound, affinity: 'integer' | 'text'): SqlValue {
  if (b === null) return null;
  if (affinity === 'text') {
    if (b.kind === 'text') return b.value;
    if (b.kind === 'long') return b.value.toString();
    return sqliteRealText(b.value);
  }
  if (b.kind === 'long') return Number(b.value);
  if (b.kind === 'double') return b.value;
  const n = numericText(b.value);
  return n === null ? b.value : n;
}

function notNullFailed(table: string, column: string): TypedError {
  return new TypedError(
    'android.database.sqlite.SQLiteConstraintException',
    `NOT NULL constraint failed: ${table}.${column} (code 1299 SQLITE_CONSTRAINT_NOTNULL)`,
  );
}

const TEXT_SET: ReadonlySet<string> = new Set(TEXT_COLUMNS);
const SUBJECT_SET: ReadonlySet<string> = new Set(SUBJECT_COLUMNS);

/**
 * A restore up to the transaction's end: `describe` first, then reset all
 * progress and apply the file. Only subjects in `knownIds` (the content) are updated and only
 * their probation is kept. Returns the new state; throws a typed error on a bad
 * file, leaving `state` untouched (the transaction rolls back).
 *
 * The caller then sets the curriculum (the returned state already carries the file's mode) and runs
 * `updateProgression`.
 */
export function restoreProgress(json: string, knownIds: ReadonlySet<number>, style: DateStyle): ProgressState {
  describe(json, style);
  const root = parseJsonObject(json);
  const next = emptyProgress();

  const subjects = getJSONArray(root, 'subjects');
  for (let i = 0; i < subjects.values.length; i++) {
    const o = arrayGetJSONObject(subjects, i);
    if (!has(o, 'id')) continue;
    const present = [...o.map.keys()].filter((k) => SUBJECT_SET.has(k)) as SubjectColumn[];
    if (present.length === 0) continue;
    const id = Number(optLong(o, 'id'));
    if (!knownIds.has(id)) continue;
    const row = { ...(next.subjects.get(id) ?? emptySubjectRow()) };
    for (const c of present) {
      const value = store(bind(opt(o, c)), TEXT_SET.has(c) ? 'text' : 'integer');
      if (value === null && !TEXT_SET.has(c) && !NULLABLE_NUMERIC_COLUMNS.has(c)) throw notNullFailed('subject', c);
      row[c] = value;
    }
    next.subjects.set(id, row);
  }

  const levels = optJSONArray(root, 'levelProgression');
  if (levels !== null) {
    for (let i = 0; i < levels.values.length; i++) {
      const o = arrayGetJSONObject(levels, i);
      const row = {} as LevelProgressionRow;
      for (const c of LEVEL_PROGRESSION_COLUMNS) {
        const b = bind(opt(o, c));
        row[c] = b === null && c !== 'id' ? 0 : store(b, 'integer');
      }
      if (row.id === null) {
        // INTEGER PRIMARY KEY: NULL takes the next rowid.
        row.id = Math.max(0, ...[...next.levelProgression.keys()]) + 1;
      }
      for (const c of NOT_NULL_LEVEL_PROGRESSION_COLUMNS) {
        if (row[c] === null) throw notNullFailed('level_progression', c);
      }
      if (typeof row.id !== 'number' || !Number.isInteger(row.id)) {
        throw new TypedError('android.database.sqlite.SQLiteDatatypeMismatchException', 'datatype mismatch (code 20 SQLITE_MISMATCH)');
      }
      next.levelProgression.set(row.id, row);
    }
  }

  const probation = optJSONArray(root, 'probation');
  if (probation !== null) {
    for (let i = 0; i < probation.values.length; i++) {
      const p = arrayGetJSONArray(probation, i);
      const since = Number(arrayGetLong(p, 1));
      const id = Number(arrayGetLong(p, 0));
      if (knownIds.has(id)) next.probation.set(id, since);
    }
  }

  const jumps = optJSONArray(root, 'jumps');
  if (jumps !== null) {
    for (let i = 0; i < jumps.values.length; i++) {
      const j = arrayGetJSONArray(jumps, i);
      next.jumps.push({ at: Number(arrayGetLong(j, 0)), fromLevel: arrayGetInt(j, 1), toLevel: arrayGetInt(j, 2) });
    }
  }

  next.curriculum = optString(root, 'curriculum') === 'JLPT' ? 'JLPT' : 'WANIKANI';
  next.userLevel = Math.max(1, optInt(root, 'userLevel', 1));
  return next;
}
