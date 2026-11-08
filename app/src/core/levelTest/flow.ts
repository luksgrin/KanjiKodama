/**
 * The level test's rounds, result and start-at-result over a `LearnerDb` (`local/LevelTest`):
 * round 1 samples unmastered kanji of N5..N1, round 2 samples the boundary block's levels, the
 * result is the level after the last sampled level still known, and starting there sends the proven
 * kanji to Guru and puts everything below on probation over 7 days.
 *
 * The session engine starts a round's self-study session with the ids `startRound1`/`startRound2`
 * return and calls `onSessionFinishing` when the session finishes, before its items are cleared.
 */

import { layoutFor, switchCurriculum } from '../progression/curriculumDb';
import { num, patchAssignment, progressRow, sqlIsZero, sqlNonZero, srsSystemOf, type LearnerDb } from '../progression/db';
import { afterChange, updateProgression } from '../progression/localProgression';
import { describeBlockLevel, type CurriculumLayout } from '../curriculum';
import { fastTravel } from '../fastTravel';
import { shuffleInPlace, type JavaRandom } from '../rng';
import { HOUR } from '../time';
import {
  KNOWN_THRESHOLD,
  PROBATION_WINDOW,
  ROUND1_PER_BLOCK,
  ROUND2_PER_LEVEL,
  TESTED_BLOCKS,
  blockScores,
  boundaryBlock,
  levelsOf,
  minutesPerDay,
  sampledLevels,
  share,
  type BlockScore,
  type LevelKnowledge,
} from './estimators';
import { discardLevelTest, levelTestStatus, setLevelTestStatus, type LevelTestStatus } from './status';

/** `LevelTest.GURU_STAGE`: proven kanji go to stage 5. */
const GURU_STAGE = 5;
const ROUND_ACTIVE = 'level_test_round_active';
const PROMPTED = 'level_test_prompted';

/** `LevelTest.Levels` with the layout it was built from. */
interface Levels extends LevelKnowledge {
  readonly layout: CurriculumLayout;
}

/**
 * `LevelTest.levels`: kanji per JLPT-order level, from the visible kanji in id order (the order the
 * Java query returns them), mastered meaning `passedAt != 0`.
 */
function levels(db: LearnerDb): Levels {
  const layout = layoutFor(db, 'JLPT');
  const count = layout.blocks.length;
  const total = new Array<number>(count + 1).fill(0);
  const mastered = new Array<number>(count + 1).fill(0);
  const open: number[][] = Array.from({ length: count + 1 }, () => []);
  for (const s of db.content.subjects) {
    if (s.object !== 'kanji' || db.table.get(s.id)!.hiddenAt !== 0) continue;
    const p = layout.placement.get(s.id);
    if (p === undefined || p[0] < 1 || p[0] > count) continue;
    total[p[0]]!++;
    if (sqlNonZero(progressRow(db, s.id).passedAt)) mastered[p[0]]!++;
    else open[p[0]]!.push(s.id);
  }
  return { layout, count, blocks: layout.blocks, total, mastered, open };
}

/** `LevelTest.answers`: `mm_level_test` id → known. */
function answers(db: LearnerDb): Map<number, number> {
  const out = new Map<number, number>();
  for (const [id, row] of db.levelTest) out.set(id, row.known);
  return out;
}

/** `LevelTest.isRoundActive`: a level test round is the running self-study session (persisted). */
export function isRoundActive(db: LearnerDb): boolean {
  return db.state.get(ROUND_ACTIVE) === '1';
}

function setRoundActive(db: LearnerDb, active: boolean): void {
  db.state.set(ROUND_ACTIVE, active ? '1' : '');
}

/** `LevelTest.prompted`: the dashboard already offered the next step once. */
export function levelTestPrompted(db: LearnerDb): boolean {
  return db.state.get(PROMPTED) === '1';
}

/** `LevelTest.setPrompted`. */
export function setLevelTestPrompted(db: LearnerDb): void {
  db.state.set(PROMPTED, '1');
}

/** `LevelTest.startRound`: record the round's ids as unanswered, set the status and the round flag. */
function startRound(db: LearnerDb, round: number, ids: readonly number[], status: LevelTestStatus): number[] {
  for (const id of ids) db.levelTest.set(id, { round, known: -1 });
  setLevelTestStatus(db, status);
  db.state.set(PROMPTED, '');
  setRoundActive(db, true);
  return ids.filter((id) => db.table.has(id));
}

/**
 * `LevelTest.startRound1`: forget any earlier test, then pick up to 6 unmastered kanji per block,
 * N5 first, each block's pool shuffled with `rng` (`ObjectSupport.newRandom()`: a fresh generator,
 * seeded like the shared one in tests). Returns the subject ids for the round's self-study session;
 * empty when nothing is left to test (the test is then done).
 */
export function startRound1(db: LearnerDb, rng: Pick<JavaRandom, 'nextInt'>): number[] {
  discardLevelTest(db);
  const lv = levels(db);
  const ids: number[] = [];
  for (const block of TESTED_BLOCKS) {
    const pool: number[] = [];
    for (const l of levelsOf(lv, block)) pool.push(...lv.open[l]!);
    shuffleInPlace(pool, rng);
    ids.push(...pool.slice(0, Math.min(ROUND1_PER_BLOCK, pool.length)));
  }
  if (ids.length === 0) {
    setLevelTestStatus(db, 'ROUND2_DONE');
    return [];
  }
  return startRound(db, 1, ids, 'ROUND1');
}

/** `LevelTest.blockScores`: the per-block picture so far. */
export function levelTestBlockScores(db: LearnerDb): BlockScore[] {
  return blockScores(levels(db), answers(db));
}

/** `LevelTest.boundaryBlock(Context, AppDatabase)`. */
export function levelTestBoundaryBlock(db: LearnerDb): number {
  return boundaryBlock(levelTestBlockScores(db));
}

/**
 * `LevelTest.startRound2`: up to 3 kanji not asked yet from each sampled level of the boundary block,
 * each level's pool shuffled with `rng`. Empty when round 2 isn't needed (the result is ready).
 */
export function startRound2(db: LearnerDb, rng: Pick<JavaRandom, 'nextInt'>): number[] {
  const lv = levels(db);
  const given = answers(db);
  const block = boundaryBlock(blockScores(lv, given));
  const ids: number[] = [];
  if (block !== 0) {
    for (const l of sampledLevels(levelsOf(lv, block))) {
      const pool = lv.open[l]!.filter((id) => !given.has(id));
      shuffleInPlace(pool, rng);
      ids.push(...pool.slice(0, Math.min(ROUND2_PER_LEVEL, pool.length)));
    }
  }
  if (ids.length === 0) {
    setLevelTestStatus(db, 'ROUND2_DONE');
    return [];
  }
  return startRound(db, 2, ids, 'ROUND2');
}

/** `LevelTest.Result`: the test's verdict. */
export interface LevelTestResult {
  level: number;
  description: string | null;
  /** Kanji answered right. */
  proven: number;
  /** Kanji and vocabulary below the result that would go on probation. */
  probation: number;
  minutesPerDay: number;
}

/** `LevelTest.result`. */
export function levelTestResult(db: LearnerDb): LevelTestResult {
  const lv = levels(db);
  const given = answers(db);
  const block = boundaryBlock(blockScores(lv, given));
  let level: number;
  if (block === 0) {
    level = Math.min(lv.count, firstLevelOf(lv, 0, lv.count));
  } else {
    const blockLevels = levelsOf(lv, block);
    level = blockLevels[blockLevels.length - 1]! + 1;
    let lastPassing: number | null = null;
    for (const l of sampledLevels(blockLevels)) {
      if (share(lv, [l], given) < KNOWN_THRESHOLD) {
        level = lastPassing === null ? blockLevels[0]! : lastPassing + 1;
        break;
      }
      lastPassing = l;
    }
    level = Math.max(1, Math.min(lv.count, level));
  }
  let proven = 0;
  for (const a of given.values()) proven += a > 0 ? 1 : 0;
  let probation = 0;
  for (const s of db.content.subjects) {
    if (db.table.get(s.id)!.hiddenAt !== 0 || s.object === 'radical') continue;
    if (!sqlIsZero(progressRow(db, s.id).startedAt)) continue;
    const p = lv.layout.placement.get(s.id);
    const a = given.get(s.id);
    if (p !== undefined && p[0] < level && (a === undefined || a <= 0)) probation++;
  }
  return {
    level,
    description: describeBlockLevel(lv.layout.blocks, level),
    proven,
    probation,
    minutesPerDay: minutesPerDay(probation),
  };
}

function firstLevelOf(lv: Levels, block: number, fallback: number): number {
  for (let l = 1; l <= lv.count; l++) {
    if (lv.blocks[l - 1] === block) return l;
  }
  return fallback;
}

/** A finished session's item as `LevelTest.onSessionFinishing` reads it (`SessionItem`). */
export interface FinishedSessionItem {
  id: number;
  /** `SessionItem.hasIncorrectAnswers`. */
  hasIncorrectAnswers: boolean;
  /** `SessionItem.isAbandoned`. */
  abandoned: boolean;
  /** `SessionItem.isFinished`: not active, or all its questions done. */
  finished: boolean;
}

/**
 * `LevelTest.onSessionFinishing` (with the `record` it starts): when a self-study session that is a
 * level test round finishes, before its items are cleared, record the answers (wrong at least once:
 * 0; finished without a wrong answer: 1). The round flag is cleared either way. Nothing is recorded
 * when the session's items aren't exactly the round's ids (an ordinary self-study) or when fewer
 * than half of them were answered (mostly abandoned). The caller passes `localMode` (`LocalMode.isEnabled`).
 */
export function onSessionFinishing(db: LearnerDb, sessionType: string, items: readonly FinishedSessionItem[],
  localMode = true): void {
  if (!localMode || sessionType !== 'SELF_STUDY' || items.length === 0) return;
  if (!isRoundActive(db)) return;
  setRoundActive(db, false);
  const results = new Map<number, number>();
  for (const item of items) {
    if (item.hasIncorrectAnswers) results.set(item.id, 0);
    else if (!item.abandoned && item.finished) results.set(item.id, 1);
  }
  record(db, new Set(items.map((i) => i.id)), results);
}

function record(db: LearnerDb, sessionIds: ReadonlySet<number>, results: ReadonlyMap<number, number>): void {
  const status = levelTestStatus(db);
  if (status !== 'ROUND1' && status !== 'ROUND2') return;
  const round = status === 'ROUND1' ? 1 : 2;
  const roundIds = new Set<number>();
  for (const [id, row] of db.levelTest) if (row.round === round) roundIds.add(id);
  if (sessionIds.size !== roundIds.size || [...sessionIds].some((id) => !roundIds.has(id))) return;
  if (results.size * 2 < roundIds.size) return;
  for (const [id, known] of results) {
    const row = db.levelTest.get(id);
    if (row !== undefined) row.known = known;
  }
  setLevelTestStatus(db, round === 1 ? 'ROUND1_DONE' : 'ROUND2_DONE');
  db.state.set(PROMPTED, '');
}

/** `LevelTest.Outcome`: what starting at the result did. */
export interface LevelTestOutcome {
  level: number;
  proven: number;
  probation: number;
  moved: boolean;
}

/**
 * `LevelTest.startAtResult`: switch to JLPT order if needed, send the proven kanji not passed yet to
 * Guru (taking them off probation), then fast travel to the result with probation spread over 7
 * days, or just update progression when the result isn't above the current level. Discards the test.
 */
export function startAtResult(db: LearnerDb, now: number): LevelTestOutcome {
  const result = levelTestResult(db);
  if (db.progress.curriculum !== 'JLPT') switchCurriculum(db, 'JLPT', now);
  let proven = 0;
  for (const [id, known] of answers(db)) {
    if (known <= 0 || !db.table.has(id)) continue;
    const row = progressRow(db, id);
    if (num(row, 'passedAt') !== 0) continue;
    const availableAt = now + srsSystemOf(db, id).getStage(GURU_STAGE).interval;
    const unlockedAt = num(row, 'unlockedAt');
    const startedAt = num(row, 'startedAt');
    patchAssignment(db, id, GURU_STAGE, unlockedAt !== 0 ? unlockedAt : now, startedAt !== 0 ? startedAt : now,
      availableAt - (availableAt % HOUR), now, 0, 0);
    db.progress.probation.delete(id);
    proven++;
  }
  const current = Math.max(1, db.progress.userLevel);
  let probation = 0;
  const moved = result.level > current;
  if (moved) {
    probation = fastTravel(db, result.level, now, PROBATION_WINDOW);
  } else {
    updateProgression(db, now);
    afterChange(db, now);
  }
  discardLevelTest(db);
  return { level: Math.max(current, result.level), proven, probation, moved };
}
