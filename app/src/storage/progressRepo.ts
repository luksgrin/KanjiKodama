/**
 * Loads the whole progress state from Dexie into the core's in-memory structures and saves it back.
 * The data is small (at most ~9,500 subject rows), so the app works on memory and writes through.
 *
 * Two levels:
 * - `LearnerSnapshot`: everything stored, without content (enough for the progress-file export).
 * - `LearnerDb` (core `progression/db`): the snapshot joined with the content. The subject table's
 *   layout (level and lesson position in the current order, JLPT blocks) is not stored: it is
 *   recomputed from the content and the stored `ordering` (`applyOrdering`), so a content
 *   update re-lays the table and keeps the progress.
 *
 * Rows of subjects the current content doesn't have ("orphans", after a content update) stay in the
 * database untouched by `saveLearnerDb` but are not loaded into a `LearnerDb`. Only a progress-file
 * restore removes them.
 */
import type { Content } from '../core/content';
import { emptyProgress, type ProgressState } from '../core/progressFile';
import type { CurriculumMode, Jump, LevelProgressionRow, SubjectProgressRow } from '../core/progressFile/format';
import { applyOrdering, createLearnerDb, type LearnerDb } from '../core/progression';
import type { KkDb, LevelProgressionRecord, StateRecord, SubjectRecord } from './db';

/** Everything the progress tables hold that the logic uses. */
export interface LearnerSnapshot {
  progress: ProgressState;
  /** `mm_state` "ordering": the order the subject table is in. */
  ordering: CurriculumMode;
  /** The other `mm_state` keys (level test status and flags). */
  state: Map<string, string>;
  /** `mm_level_test`. */
  levelTest: Map<number, { round: number; known: number }>;
}

/** `state` keys. `mm_state` keys other than "ordering" are stored as `mm_state.<key>`. */
export const STATE_KEYS = {
  userLevel: 'userLevel',
  curriculum: 'curriculum',
  ordering: 'ordering',
} as const;
const MM_STATE_PREFIX = 'mm_state.';

const asMode = (v: unknown): CurriculumMode => (v === 'JLPT' ? 'JLPT' : 'WANIKANI');

function subjectRowOf(record: SubjectRecord): SubjectProgressRow {
  const { id: _id, ...row } = record;
  return row;
}

/** The tables `readSnapshot` reads. */
function snapshotTables(kk: KkDb) {
  return [kk.subjects, kk.levelProgression, kk.probation, kk.jumps, kk.state, kk.levelTest];
}

/** Reads the stored progress. Runs in the caller's transaction if there is one, else in its own. */
export async function readSnapshot(kk: KkDb): Promise<LearnerSnapshot> {
  return kk.transaction('r', snapshotTables(kk), async () => {
    const [subjects, levels, probation, jumps, stateRows, levelTest] = await Promise.all([
      kk.subjects.toArray(),
      kk.levelProgression.toArray(),
      kk.probation.toArray(),
      kk.jumps.orderBy('seq').toArray(),
      kk.state.toArray(),
      kk.levelTest.toArray(),
    ]);
    const stateMap = new Map(stateRows.map((r) => [r.key, r.value]));
    const progress = emptyProgress(asMode(stateMap.get(STATE_KEYS.curriculum)));
    const level = stateMap.get(STATE_KEYS.userLevel);
    progress.userLevel = typeof level === 'number' ? level : 1;
    for (const r of subjects) progress.subjects.set(r.id, subjectRowOf(r));
    for (const r of levels) progress.levelProgression.set(r.id, { ...r } as LevelProgressionRow);
    for (const r of probation) progress.probation.set(r.id, r.since);
    progress.jumps = jumps.map((j): Jump => ({ at: j.at, fromLevel: j.fromLevel, toLevel: j.toLevel }));
    const state = new Map<string, string>();
    for (const [k, v] of stateMap) {
      if (k.startsWith(MM_STATE_PREFIX) && typeof v === 'string') state.set(k.slice(MM_STATE_PREFIX.length), v);
    }
    return {
      progress,
      ordering: asMode(stateMap.get(STATE_KEYS.ordering)),
      state,
      levelTest: new Map(levelTest.map((r) => [r.id, { round: r.round, known: r.known }])),
    };
  });
}

/** The stored progress only (no content needed): for the export. */
export async function loadProgressState(kk: KkDb): Promise<ProgressState> {
  return (await readSnapshot(kk)).progress;
}

/**
 * A `LearnerDb` for the content with the stored progress: the fresh table (WaniKani order), then the
 * stored order applied, then the progress of the subjects the content has.
 */
export function hydrateLearnerDb(content: Content, jlptKanji: ReadonlyMap<string, number>, snap: LearnerSnapshot): LearnerDb {
  const ldb = createLearnerDb(content, jlptKanji);
  if (snap.ordering !== 'WANIKANI') applyOrdering(ldb, snap.ordering);
  const progress = emptyProgress(snap.progress.curriculum);
  progress.userLevel = snap.progress.userLevel;
  for (const [id, row] of snap.progress.subjects) if (ldb.table.has(id)) progress.subjects.set(id, row);
  for (const [id, row] of snap.progress.levelProgression) progress.levelProgression.set(id, row);
  for (const [id, since] of snap.progress.probation) if (ldb.table.has(id)) progress.probation.set(id, since);
  progress.jumps = [...snap.progress.jumps];
  ldb.progress = progress;
  for (const [k, v] of snap.state) ldb.state.set(k, v);
  for (const [id, t] of snap.levelTest) ldb.levelTest.set(id, { ...t });
  return ldb;
}

/** Loads the stored progress into a `LearnerDb` for `content`. */
export async function loadLearnerDb(kk: KkDb, content: Content, jlptKanji: ReadonlyMap<string, number>): Promise<LearnerDb> {
  return hydrateLearnerDb(content, jlptKanji, await readSnapshot(kk));
}

/** The storable part of a `LearnerDb`. */
export function snapshotOf(ldb: LearnerDb): LearnerSnapshot {
  return { progress: ldb.progress, ordering: ldb.ordering, state: ldb.state, levelTest: ldb.levelTest };
}

function stateRecords(snap: LearnerSnapshot): StateRecord[] {
  const rows: StateRecord[] = [
    { key: STATE_KEYS.userLevel, value: snap.progress.userLevel },
    { key: STATE_KEYS.curriculum, value: snap.progress.curriculum },
    { key: STATE_KEYS.ordering, value: snap.ordering },
  ];
  for (const [k, v] of snap.state) rows.push({ key: MM_STATE_PREFIX + k, value: v });
  return rows;
}

function subjectRecords(progress: ProgressState): SubjectRecord[] {
  return [...progress.subjects].map(([id, row]) => ({ ...row, id }));
}

function levelRecords(progress: ProgressState): LevelProgressionRecord[] {
  return [...progress.levelProgression.values()].map((r) => ({ ...r }) as LevelProgressionRecord);
}

/**
 * Writes the snapshot. `keepOrphansOf` set: subject and probation rows whose ids are not in it are
 * kept (a normal save with the current content); unset: every progress table is replaced wholesale
 * (a restore). `state` rows the snapshot doesn't own (server settings and the like) are kept unless
 * the snapshot replaces them; `mm_state.*` rows are replaced.
 */
export async function writeSnapshot(kk: KkDb, snap: LearnerSnapshot, keepOrphansOf?: ReadonlySet<number>): Promise<void> {
  await kk.transaction('rw', snapshotTables(kk), async () => {
    if (keepOrphansOf) {
      const stale = (await kk.subjects.toCollection().primaryKeys())
        .filter((id) => keepOrphansOf.has(id) && !snap.progress.subjects.has(id));
      await kk.subjects.bulkDelete(stale);
      const staleProbation = (await kk.probation.toCollection().primaryKeys())
        .filter((id) => keepOrphansOf.has(id) && !snap.progress.probation.has(id));
      await kk.probation.bulkDelete(staleProbation);
    } else {
      await kk.subjects.clear();
      await kk.probation.clear();
    }
    await kk.subjects.bulkPut(subjectRecords(snap.progress));
    await kk.probation.bulkPut([...snap.progress.probation].map(([id, since]) => ({ id, since })));
    await kk.levelProgression.clear();
    await kk.levelProgression.bulkPut(levelRecords(snap.progress));
    await kk.jumps.clear();
    await kk.jumps.bulkAdd(snap.progress.jumps.map((j) => ({ at: j.at, fromLevel: j.fromLevel, toLevel: j.toLevel })));
    const mmKeys = (await kk.state.toCollection().primaryKeys()).filter((k) => k.startsWith(MM_STATE_PREFIX));
    await kk.state.bulkDelete(mmKeys);
    await kk.state.bulkPut(stateRecords(snap));
    await kk.levelTest.clear();
    await kk.levelTest.bulkPut([...snap.levelTest].map(([id, t]) => ({ id, round: t.round, known: t.known })));
  });
}

/** Saves a `LearnerDb` (all of its progress). Rows of subjects outside its content are kept. */
export async function saveLearnerDb(kk: KkDb, ldb: LearnerDb): Promise<void> {
  await writeSnapshot(kk, snapshotOf(ldb), new Set(ldb.table.keys()));
}

/** Writes just these subjects' rows (after answering a few items); cheaper than `saveLearnerDb`. */
export async function saveSubjects(kk: KkDb, ldb: LearnerDb, ids: Iterable<number>): Promise<void> {
  const put: SubjectRecord[] = [];
  const del: number[] = [];
  for (const id of ids) {
    const row = ldb.progress.subjects.get(id);
    if (row) put.push({ ...row, id });
    else del.push(id);
  }
  await kk.transaction('rw', kk.subjects, async () => {
    await kk.subjects.bulkDelete(del);
    await kk.subjects.bulkPut(put);
  });
}
