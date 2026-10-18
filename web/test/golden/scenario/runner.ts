/**
 * Replays the golden scenarios (`scenarios/*.json`, recorded by the Java `ScenarioRunner` and
 * `SessionDriver` in `durtles/app/src/androidTest/.../golden/`) on the TypeScript core.
 *
 * One fixture case per step: case "00-start" restores the start file into a fresh learner database
 * (the Java base reset: seeded randomness, clock at T0, empty WaniKani-order progress), every later
 * case moves the clock as its args say, runs the action from the `actions` table and records the
 * same snapshot Java does. An action no file implements fails its step with "not implemented:
 * <action>", so the coverage report shows exactly what is missing.
 *
 * `input.resolved` (what the Java runner resolved: picked ids, timings, generated files) is compared
 * with what the TypeScript action resolves; a mismatch fails the step too. The one thing taken from
 * it is a `generate`d progress file (`resolved.file`): the Java runner records it so consumers never
 * re-implement the generator.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { Content } from '../../../src/core/content';
import { parseJlptKanjiTsv, type CurriculumMode } from '../../../src/core/curriculum';
import { fastTravelStatus } from '../../../src/core/fastTravel';
import { levelTestStatus } from '../../../src/core/levelTest';
import { JavaException as KanaJavaException } from '../../../src/core/kana';
import { JavaException as JsonJavaException } from '../../../src/core/progressFile';
import {
  createLearnerDb,
  currentLevelDescription,
  currentMaxLevel,
  exportFromDb,
  progressRow,
  restoreIntoDb,
  sqlAtMost,
  sqlIsZero,
  sqlNonZero,
  type LearnerDb,
} from '../../../src/core/progression';
import { JavaRandom } from '../../../src/core/rng';
import { HOUR } from '../../../src/core/time';
import { firstDifference } from '../harness';

/** `ScenarioRunner.T0`: 2026-01-05T09:17:00Z, deliberately not on the hour. */
export const T0 = 1767604620000;

/** The scenario step as recorded (`input.args`): the action name plus its arguments. */
export type Step = Record<string, unknown> & { action: string };

/** What a step's case records as input. */
export interface StepInput {
  action: string;
  args: Step;
  atMs: number;
  resolved: Record<string, unknown>;
}

/** Case "00-start"'s input. */
export interface StartInput {
  mode: CurriculumMode;
  seed: number;
  clockStartMs: number;
  startFile: unknown;
}

/** Everything a scenario changes while it runs. Action files may keep their own state in `ext`. */
export interface RunnerState {
  readonly name: string;
  db: LearnerDb;
  /** The pinned clock (`Clock.now()`). */
  now: number;
  /** `ObjectSupport.seedRandom(seed)`: the app's shared Random. */
  rng: JavaRandom;
  readonly seed: number;
  /** The export text of every snapshot so far, for `restore {fromStep}`. */
  readonly exports: string[];
  /** Scenario option exportMode "delta". */
  readonly exportDelta: boolean;
  lastExport: unknown;
  /** Content hiddenAt of the subjects hideSubject/unhideSubject changed, in first-change order. */
  readonly originalHidden: Map<number, number>;
  /** `reviewCounter` of `wrongFor`, reset before every step. */
  reviewCounter: number;
  /** State of action groups (session engine, level test, …), keyed by group. */
  readonly ext: Record<string, unknown>;
}

/** What an action handler gets. It fills `resolved` and returns the step's `result`. */
export interface ActionContext {
  rs: RunnerState;
  step: Step;
  /** To fill, like the Java runner's `resolved` map; compared with `recorded` afterwards. */
  resolved: Record<string, unknown>;
  /** What the Java runner resolved (`input.resolved`). */
  recorded: Record<string, unknown>;
}

export type ActionHandler = (ctx: ActionContext) => unknown;

/** The test-side inputs a runner needs besides the content. */
export interface RunnerResources {
  content: Content;
  jlptKanji: ReadonlyMap<string, number>;
}

const REPO = new URL('../../../../', import.meta.url);

/** The `jlpt-kanji.tsv` asset of the Java app (committed, not private). */
export function loadJlptKanji(): Map<string, number> {
  return parseJlptKanjiTsv(readFileSync(new URL('durtles/app/src/main/assets/jlpt-kanji.tsv', REPO), 'utf8'));
}

/** The scenario definition (the DSL the fixture was recorded from), for options the fixture doesn't carry. */
export function scenarioDefinition(name: string): Record<string, unknown> | null {
  const url = new URL(`durtles/app/src/androidTest/assets/golden-scenarios/${name}.json`, REPO);
  return existsSync(url) ? (JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>) : null;
}

/** A file under web/test/golden (the `pushed` inputs, e.g. progress/android-export.json). */
export function readGoldenInput(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

/** The base reset plus the start file: case "00-start". */
export function startScenario(name: string, input: StartInput, res: RunnerResources, exportDeltaHint: boolean): RunnerState {
  const def = scenarioDefinition(name);
  const exportDelta = def !== null ? def.exportMode === 'delta' : exportDeltaHint;
  const rs: RunnerState = {
    name,
    db: createLearnerDb(res.content, res.jlptKanji),
    now: T0,
    rng: new JavaRandom(BigInt(input.seed)),
    seed: input.seed,
    exports: [],
    exportDelta,
    lastExport: null,
    originalHidden: new Map(),
    reviewCounter: 0,
    ext: {},
  };
  restoreIntoDb(rs.db, JSON.stringify(input.startFile), rs.now);
  return rs;
}

/** `ScenarioRunner.snapshot`: the state every case records. */
export function snapshot(rs: RunnerState, result: unknown): Record<string, unknown> {
  const { db, now } = rs;
  const text = exportFromDb(db, now);
  rs.exports.push(text);
  const exported = JSON.parse(text) as Record<string, unknown>;
  const delta = rs.exportDelta && rs.lastExport !== null;
  const record = delta ? exportDelta(rs.lastExport as Record<string, unknown>, exported) : exported;
  rs.lastExport = exported;
  const level = db.progress.userLevel;
  return {
    clockMs: now,
    result: result ?? null,
    level,
    curriculum: { mode: db.progress.curriculum, maxLevel: currentMaxLevel(db), levelDescription: currentLevelDescription(db, level) },
    counts: counts(db, now),
    fastTravel: fastTravelStatus(db, now),
    levelTest: levelTestStatus(db),
    // Local mode never shows the sync reminder (PropertiesDao.getSyncReminder).
    reminders: { syncReminder: false },
    [delta ? 'exportDelta' : 'export']: record,
  };
}

/** The snapshot's lesson and review counts (levels up to `getUserMaxLevelGranted`, 60 in local mode). */
function counts(db: LearnerDb, now: number): { lessons: number; reviews: number; reviewsNext24h: number } {
  let lessons = 0;
  let reviews = 0;
  let next24h = 0;
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id)!;
    if (t.hiddenAt !== 0 || t.level > 60) continue;
    const row = progressRow(db, s.id);
    if ((sqlNonZero(row.resurrectedAt) || sqlIsZero(row.burnedAt)) && sqlNonZero(row.unlockedAt) && sqlIsZero(row.startedAt)) {
      lessons++;
    }
    if (sqlNonZero(row.availableAt)) {
      if (sqlAtMost(row.availableAt, now)) reviews++;
      if (sqlAtMost(row.availableAt, now + 24 * HOUR)) next24h++;
    }
  }
  return { lessons, reviews, reviewsNext24h: next24h };
}

/** `ScenarioRunner.exportRecord` in delta mode: what changed since the previous snapshot. */
function exportDelta(before: Record<string, unknown>, now: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(now)) {
    if (name !== 'subjects' && firstDifference(value, before[name]) !== null) fields[name] = value;
  }
  const old = new Map<number, unknown>();
  for (const r of (before.subjects ?? []) as { id: number }[]) old.set(r.id, r);
  const changed: unknown[] = [];
  for (const r of (now.subjects ?? []) as { id: number }[]) {
    const o = old.get(r.id);
    old.delete(r.id);
    if (o === undefined || firstDifference(r, o) !== null) changed.push(r);
  }
  return { fields, subjectsChanged: changed, subjectsRemoved: [...old.keys()], subjectCount: ((now.subjects ?? []) as unknown[]).length };
}

/** `Math.round(double)` of Java (half up). */
export function javaRound(x: number): number {
  return Math.floor(x + 0.5);
}

/** A number argument (`JsonNode.asDouble(default)`). */
export function argNumber(step: Record<string, unknown>, key: string, fallback: number): number {
  const v = step[key];
  return typeof v === 'number' ? v : fallback;
}

/** Moves the clock as a step's `advanceHours`/`advanceSeconds`/`atHours`/`atMs`/`atLastProbationSlot` say. */
function moveClock(rs: RunnerState, step: Step, resolved: Record<string, unknown>): void {
  const advance = argNumber(step, 'advanceHours', 0);
  if (advance !== 0) rs.now += javaRound(advance * HOUR);
  const advanceSeconds = argNumber(step, 'advanceSeconds', 0);
  if (advanceSeconds !== 0) rs.now += javaRound(advanceSeconds * 1000);
  if ('atHours' in step) {
    const target = T0 + javaRound(argNumber(step, 'atHours', 0) * HOUR);
    if (target < rs.now) throw new Error(`atHours ${String(step.atHours)} is in the past`);
    rs.now = target;
  }
  if ('atMs' in step) {
    const target = argNumber(step, 'atMs', 0);
    if (target < rs.now) throw new Error(`atMs ${target} is in the past`);
    rs.now = target;
  }
  if ('atLastProbationSlot' in step) {
    const slot = lastProbationSlot(rs.db);
    if (slot === 0) throw new Error('atLastProbationSlot without probation items');
    const target = slot + argNumber(step, 'atLastProbationSlot', 0);
    if (target < rs.now) throw new Error(`atLastProbationSlot ${target} is in the past`);
    rs.now = target;
    resolved.lastProbationSlotMs = slot;
  }
}

/** `ScenarioRunner.lastProbationSlot`: the latest availableAt of the visible probation items, 0 without any. */
export function lastProbationSlot(db: LearnerDb): number {
  let max: number | null = null;
  for (const id of db.progress.probation.keys()) {
    const t = db.table.get(id);
    if (t === undefined || t.hiddenAt !== 0) continue;
    const v = progressRow(db, id).availableAt;
    if (typeof v === 'number') max = max === null ? v : Math.max(max, v);
  }
  return max ?? 0;
}

/** Thrown for an action no file implements yet. */
export class NotImplemented extends Error {
  constructor(action: string) {
    super(`not implemented: ${action}`);
  }
}

/**
 * Runs one step case: clock, action, resolved check, snapshot. App exceptions (`JavaException`) are
 * recorded as the step's result like the Java runner does; anything else fails the case.
 */
export function runStep(rs: RunnerState, input: StepInput, actions: Readonly<Record<string, ActionHandler>>): Record<string, unknown> {
  const step = input.args;
  const resolved: Record<string, unknown> = {};
  moveClock(rs, step, resolved);
  if (rs.now !== input.atMs) throw new Error(`clock ${rs.now}, recorded atMs ${input.atMs}`);
  rs.reviewCounter = 0;
  const handler = actions[step.action];
  if (handler === undefined) throw new NotImplemented(step.action);
  let result: unknown;
  try {
    result = handler({ rs, step, resolved, recorded: input.resolved });
  } catch (e) {
    if (e instanceof KanaJavaException || e instanceof JsonJavaException) {
      result = { error: e.javaClass, message: e.message };
    } else {
      throw e;
    }
  }
  const diff = firstDifference(resolved, input.resolved);
  if (diff !== null) throw new Error(`resolved differs: ${diff}`);
  return snapshot(rs, result);
}
