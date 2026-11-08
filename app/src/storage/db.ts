/**
 * The progress database (IndexedDB through Dexie), on both builds. Only the learner's own data
 * lives here; the content (subjects, SRS systems) is static and loaded separately, joined by
 * subject id, so a content update never touches these tables.
 *
 * Tables (plan, "Progress schema (Dexie)"):
 * - `subjects` (key `id`): exactly the `ProgressStore.NUMERIC` and `TEXT` columns, same names
 *   (`SubjectProgressRow` of core `progressFile/format`). Only subjects with a stored row; an absent
 *   row is the empty defaults.
 * - `levelProgression` (key `id`): the `LEVEL_PROGRESSION` columns.
 * - `probation` (key `id`): `since`.
 * - `jumps` (auto key `seq`, index `at`): `at`, `fromLevel`, `toLevel`. Java's `mm_jump` has no key
 *   (rowid), so two jumps may share an `at`; `seq` keeps them all, in insertion order.
 * - `state` (key `key`): `userLevel`, `curriculum`, `ordering`, the other `mm_state` keys
 *   (`mm_state.<key>`), and later the server mode settings and sync cursors.
 * - `levelTest` (key `id`): `round`, `known` (`mm_level_test`).
 * - `session` (key `subjectId`): the current session (`ui/components/session/sessionStorage.ts`): one
 *   `kind: 'item'` row per session item (the `session_item` columns) and a `kind: 'properties'` row under
 *   key 0 (session type, on/kun split, current item and question type, start time and level, level test
 *   round). No index change, so no new schema version. Empty when no session runs.
 * - `tasks` (auto key `id`): the server-mode upload queue (`src/sync/`; order and payloads in core
 *   `server/queue`). Non-indexed retry fields `attempts`, `nextAttemptAt`, `lastError`.
 * - `serverSubjects` (key `id`, v3): subjects downloaded in server mode, as the API sends them
 *   (`{id, object, dataUpdatedAt, data}`, readings "None" dropped). Local mode never reads it.
 * - `settings` (key `key`): the settings in use.
 * - `meta` (key `key`): `schemaVersion`, persistence result, last backup time, diagnostics.
 *
 * Migrations: every schema version stays declared below with its upgrade function, so a database
 * from any earlier version opens. Never drop a table without a migration that moves its data.
 * `src/storage/migrations.test.ts` opens a database of every earlier version.
 */
import Dexie, { type EntityTable, type Transaction } from 'dexie';

import {
  emptySubjectRow,
  type Jump,
  type LevelProgressionRow,
  type SubjectProgressRow,
} from '../core/progressFile/format';

export const DB_NAME = 'kanjikodama';
/** The newest schema version (Dexie's `verno`). */
export const SCHEMA_VERSION = 3;

/** A `subjects` row: the subject id and its saved progress columns. */
export type SubjectRecord = SubjectProgressRow & { id: number };
/** A `levelProgression` row (the core row; `id` is always an integer once stored). */
export type LevelProgressionRecord = LevelProgressionRow & { id: number };
export interface ProbationRecord { id: number; since: number }
export interface JumpRecord extends Jump { seq?: number }
export interface StateRecord { key: string; value: unknown }
export interface LevelTestRecord { id: number; round: number; known: number }
/**
 * A `session` row: `kind: 'item'` (a session item) or `kind: 'properties'` (key 0). The typed shapes are
 * `SessionItemRecord` / `SessionPropertiesRecord` in `ui/components/session/sessionStorage.ts`.
 */
export interface SessionRecord { subjectId: number; kind?: 'item' | 'properties'; [field: string]: unknown }
/** A queued server-mode upload (`StoredTask` of core `server/queue`). */
export interface TaskRecord {
  id?: number;
  kind: string;
  payload: unknown;
  createdAt: number;
  attempts?: number;
  nextAttemptAt?: number;
  lastError?: string | null;
}
/** A subject downloaded in server mode. */
export interface ServerSubjectRecord { id: number; object: string; dataUpdatedAt: string | null; data: Record<string, unknown> }
export interface SettingRecord { key: string; value: unknown }
export interface MetaRow { key: string; value: unknown }

/** The progress tables a progress-file restore replaces (Java's `resetProgress` also drops the session). */
export const PROGRESS_TABLES = ['subjects', 'levelProgression', 'probation', 'jumps', 'state', 'levelTest', 'session'] as const;

/** Version 1 (the spike): `progress` rows. Kept for the migration. */
interface SpikeProgressRow {
  id: number;
  srsStage?: number;
  meaningCorrect?: number;
  meaningIncorrect?: number;
  readingCorrect?: number;
  readingIncorrect?: number;
}

const SPIKE_FIELDS = ['srsStage', 'meaningCorrect', 'meaningIncorrect', 'readingCorrect', 'readingIncorrect'] as const;

/** v1 → v2: spike progress rows become `subjects` rows; the spike's `meta.userLevel` moves to `state`. */
async function upgradeFromSpike(tx: Transaction): Promise<void> {
  const old = (await tx.table('progress').toArray()) as SpikeProgressRow[];
  const rows: SubjectRecord[] = old.map((p) => {
    const row: SubjectRecord = { ...emptySubjectRow(), id: p.id };
    for (const f of SPIKE_FIELDS) {
      const v = p[f];
      if (typeof v === 'number' && Number.isFinite(v)) row[f] = v;
    }
    return row;
  });
  await tx.table('subjects').bulkPut(rows);
  const level = (await tx.table('meta').get('userLevel')) as MetaRow | undefined;
  if (typeof level?.value === 'number') await tx.table('state').put({ key: 'userLevel', value: level.value });
  await tx.table('meta').delete('userLevel');
  await tx.table('meta').put({ key: 'schemaVersion', value: 2 });
}

export class KkDb extends Dexie {
  subjects!: EntityTable<SubjectRecord, 'id'>;
  levelProgression!: EntityTable<LevelProgressionRecord, 'id'>;
  probation!: EntityTable<ProbationRecord, 'id'>;
  jumps!: EntityTable<JumpRecord, 'seq'>;
  state!: EntityTable<StateRecord, 'key'>;
  levelTest!: EntityTable<LevelTestRecord, 'id'>;
  session!: EntityTable<SessionRecord, 'subjectId'>;
  tasks!: EntityTable<TaskRecord, 'id'>;
  serverSubjects!: EntityTable<ServerSubjectRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = DB_NAME) {
    super(name);
    // v1: the spike (step 1).
    this.version(1).stores({ progress: 'id', meta: 'key' });
    // v2: the real progress schema (step 4).
    this.version(2)
      .stores({
        progress: null,
        subjects: 'id',
        levelProgression: 'id',
        probation: 'id',
        jumps: '++seq, at',
        state: 'key',
        levelTest: 'id',
        session: 'subjectId',
        tasks: '++id',
        settings: 'key',
        meta: 'key',
      })
      .upgrade(upgradeFromSpike);
    // v3: server mode (step 5c) adds the downloaded subjects; queued tasks keep their shape.
    this.version(3)
      .stores({ serverSubjects: 'id' })
      .upgrade(async (tx) => {
        await tx.table('meta').put({ key: 'schemaVersion', value: 3 });
      });
    this.on('populate', (tx) => {
      void tx.table('meta').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
    });
  }
}

export const db = new KkDb();

export async function getMeta<T>(key: string, d: KkDb = db): Promise<T | undefined> {
  return (await d.meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown, d: KkDb = db): Promise<void> {
  await d.meta.put({ key, value });
}

/** `meta` key of the last manual progress save (epoch ms), for the PWA backup reminder. */
export const LAST_SAVED_META_KEY = 'lastSavedAt';

/**
 * The `LastSavedStore` of `progress/backup.ts`, backed by `meta.lastSavedAt` (structurally typed so
 * storage doesn't depend on the progress module).
 */
export function lastSavedStore(d: KkDb = db): { getLastSavedAt(): Promise<number | null>; setLastSavedAt(at: number): Promise<void> } {
  return {
    async getLastSavedAt() {
      const v = await getMeta<unknown>(LAST_SAVED_META_KEY, d);
      return typeof v === 'number' ? v : null;
    },
    async setLastSavedAt(at: number) {
      await setMeta(LAST_SAVED_META_KEY, at, d);
    },
  };
}
