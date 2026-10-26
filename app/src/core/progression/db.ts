/**
 * The learner's database as the local-mode logic sees it, in memory: the content (static), the
 * subject table's mutable layout columns (`level`, `lessonPosition`, `hiddenAt`), the saved
 * progress (`ProgressState`: progress columns, level progression, probation, jumps, user level,
 * curriculum mode), and the curriculum's own state (`mm_state` ordering/blocks, `mm_wk_order`).
 *
 * This is the shape the Java app keeps in SQLite. Storage (step 4) persists it; the functions in
 * this module change it the way the Java SQL does, including SQLite's NULL and type rules for the
 * few progress values a hand-edited file can make NULL or text (see `sqlIsZero`/`sqlNonZero`).
 */

import type { Content, ContentSubject } from '../content';
import { describeLevel, maxLevel, type CurriculumMode } from '../curriculum';
import { emptyProgress, type ProgressState } from '../progressFile';
import { emptySubjectRow, numberOf, type SqlValue, type SubjectColumn, type SubjectProgressRow } from '../progressFile/format';
import { findSrsSystem, srsSystemFromData, type SrsSystem } from '../srs';

/** The subject table's columns that are content but change at runtime. */
export interface TableRow {
  /** In the current curriculum order (`Curriculum.applyOrdering` rewrites it). */
  level: number;
  lessonPosition: number;
  /** 0 visible; a content update (or `hideSubject` in the golden scenarios) can change it. */
  hiddenAt: number;
}

export interface LearnerDb {
  readonly content: Content;
  readonly srsSystems: readonly SrsSystem[];
  /** The `jlpt-kanji.tsv` asset: character → JLPT level (5..1). */
  readonly jlptKanji: ReadonlyMap<string, number>;
  /** By subject id, for every content subject. */
  readonly table: Map<number, TableRow>;
  /** `mm_wk_order`: WaniKani's level and lesson position of every subject. */
  readonly wkOrder: Map<number, readonly [number, number]>;
  /** Saved progress. `progress.curriculum` is the chosen mode (`Curriculum.getMode`). */
  progress: ProgressState;
  /** `mm_state` "ordering": the order the subject table is in now. */
  ordering: CurriculumMode;
  /** `mm_state` "blocks": the JLPT block of every level (JLPT ordering only). */
  blocks: number[];
  /** Other `mm_state` keys (level test status and flags). */
  readonly state: Map<string, string>;
  /** `mm_level_test`: subject id → round and known (-1 not answered yet, 0, 1). */
  readonly levelTest: Map<number, { round: number; known: number }>;
}

/**
 * A fresh database right after the content import (`Curriculum.onContentImported`): subjects in
 * WaniKani order, no progress, WaniKani mode, level 1.
 */
export function createLearnerDb(content: Content, jlptKanji: ReadonlyMap<string, number>): LearnerDb {
  const table = new Map<number, TableRow>();
  const wkOrder = new Map<number, readonly [number, number]>();
  for (const s of content.subjects) {
    table.set(s.id, { level: s.level, lessonPosition: s.lessonPosition, hiddenAt: s.hiddenAt });
    wkOrder.set(s.id, [s.level, s.lessonPosition]);
  }
  return {
    content,
    srsSystems: content.srsSystems.map(srsSystemFromData),
    jlptKanji,
    table,
    wkOrder,
    progress: emptyProgress('WANIKANI'),
    ordering: 'WANIKANI',
    blocks: [],
    state: new Map(),
    levelTest: new Map(),
  };
}

/** The subject's table row; throws for an id the content doesn't have (the runner's error). */
export function tableRow(db: LearnerDb, id: number): TableRow {
  const row = db.table.get(id);
  if (row === undefined) throw new Error(`no subject ${id}`);
  return row;
}

export function contentSubject(db: LearnerDb, id: number): ContentSubject {
  const s = db.content.byId.get(id);
  if (s === undefined) throw new Error(`no subject ${id}`);
  return s;
}

/** `Subject.getSrsSystem`. */
export function srsSystemOf(db: LearnerDb, id: number): SrsSystem {
  return findSrsSystem(db.srsSystems, contentSubject(db, id).srsSystemId);
}

/** A subject's progress columns (the empty defaults when it has none). */
export function progressRow(db: LearnerDb, id: number): SubjectProgressRow {
  return db.progress.subjects.get(id) ?? emptySubjectRow();
}

/** Writes some progress columns of a subject (`UPDATE subject SET … WHERE id = ?`). */
export function updateProgress(db: LearnerDb, id: number, values: Partial<Record<SubjectColumn, SqlValue>>): void {
  if (!db.table.has(id)) return;
  db.progress.subjects.set(id, { ...progressRow(db, id), ...values });
}

/** A column read into a Java `long`/`int` field (NULL and non-numbers are 0). */
export function num(row: SubjectProgressRow, column: SubjectColumn): number {
  return numberOf(row[column]);
}

/** SQL `column = 0` on an INTEGER-affinity column: false for NULL and for text. */
export function sqlIsZero(value: SqlValue): boolean {
  return typeof value === 'number' && value === 0;
}

/** SQL `column != 0`: false for NULL, true for text (text never equals a number). */
export function sqlNonZero(value: SqlValue): boolean {
  return value !== null && !(typeof value === 'number' && value === 0);
}

/** SQL `column <= x` for a number x: false for NULL and for text (text sorts after numbers). */
export function sqlAtMost(value: SqlValue, x: number): boolean {
  return typeof value === 'number' && value <= x;
}

/** `SubjectSyncDao.patchAssignment`: a subject that isn't unlocked is stored at stage -999. */
export function patchAssignment(db: LearnerDb, id: number, stageId: number, unlockedAt: number, startedAt: number,
  availableAt: number, passedAt: number, burnedAt: number, resurrectedAt: number): void {
  updateProgress(db, id, {
    srsStage: unlockedAt === 0 ? -999 : stageId,
    unlockedAt,
    startedAt,
    availableAt,
    passedAt,
    burnedAt,
    resurrectedAt,
    assignmentPatched: 1,
  });
}

/**
 * `SubjectSyncDao.forceLessonAvailable`: make a subject an available lesson (unlocked, not started,
 * initial stage). Subjects above `maxLevel` are left alone.
 */
export function forceLessonAvailable(db: LearnerDb, id: number, unlockedAt: number, maxLevel: number): void {
  const t = db.table.get(id);
  if (t === undefined || unlockedAt === 0 || t.level > maxLevel) return;
  const row = progressRow(db, id);
  let changed = false;
  let unlocked = num(row, 'unlockedAt');
  if (unlocked === 0) {
    unlocked = unlockedAt;
    changed = true;
  }
  let started = num(row, 'startedAt');
  if (started !== 0) {
    started = 0;
    changed = true;
  }
  const system = srsSystemOf(db, id);
  let stage = system.getStage(num(row, 'srsStage'));
  if (!stage.isInitial) {
    stage = system.initialStage;
    changed = true;
  }
  if (changed) {
    patchAssignment(db, id, stage.id, unlocked, started, num(row, 'availableAt'), num(row, 'passedAt'),
      num(row, 'burnedAt'), num(row, 'resurrectedAt'));
  }
}

/** `Curriculum.maxLevel`: the highest level of the order the table is in. */
export function currentMaxLevel(db: LearnerDb): number {
  return maxLevel(db.ordering, db.blocks);
}

/** `Curriculum.describeLevel`: "N4, level 2 of 5" in JLPT order, null in WaniKani order. */
export function currentLevelDescription(db: LearnerDb, level: number): string | null {
  return describeLevel(db.ordering, db.blocks, level);
}
