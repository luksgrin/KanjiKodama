/**
 * The runner's own actions (`ScenarioRunner.perform`): snapshots, direct lesson and review reports
 * (`ReportSessionItemJob` without a session), grinding, restores, content hiding, progression.
 */

import {
  exportFromDb,
  progressRow,
  reportLocal,
  restoreIntoDb,
  sqlIsZero,
  updateProgression,
  type LearnerDb,
} from '../../../../src/core/progression';
import { firstDifference } from '../../harness';
import {
  argNumber,
  javaRound,
  readGoldenInput,
  type ActionContext,
  type ActionHandler,
  type RunnerState,
  type Step,
} from '../runner';
import { matchesFilter, isReviewRow, select, type Filter } from '../select';

function ids(value: unknown): number[] {
  return (value as unknown[]).map(Number);
}

/**
 * `ScenarioRunner.Timing`: the per-answer clock of a lesson or review step (`spacingSeconds`,
 * `offsetsSeconds`, `delayedReport`, `reportAfterSeconds`); without those keys every answer is
 * reported at the step's clock.
 */
class Timing {
  private readonly active: boolean;
  private readonly start: number;
  private readonly spacing: number;
  private readonly offsets: number[] | null;
  private readonly delayed: boolean;
  private readonly reportAfter: number;
  private readonly pending: [number, 'LESSON' | 'REVIEW', number, number, number][] = [];
  private readonly answers: unknown[] = [];

  constructor(private readonly rs: RunnerState, step: Step, count: number) {
    this.active = 'spacingSeconds' in step || 'offsetsSeconds' in step || 'delayedReport' in step || 'reportAfterSeconds' in step;
    this.start = rs.now;
    this.spacing = javaRound(argNumber(step, 'spacingSeconds', 0) * 1000);
    this.offsets = Array.isArray(step.offsetsSeconds) ? (step.offsetsSeconds as number[]) : null;
    if (this.offsets !== null && this.offsets.length !== count) {
      throw new Error(`offsetsSeconds has ${this.offsets.length} entries for ${count} answers`);
    }
    this.delayed = step.delayedReport === true;
    this.reportAfter = javaRound(argNumber(step, 'reportAfterSeconds', 0) * 1000);
  }

  answer(index: number, id: number, type: 'LESSON' | 'REVIEW', meaningWrong: number, readingWrong: number): void {
    const { rs } = this;
    if (this.offsets !== null) {
      const target = this.start + javaRound(this.offsets[index]! * 1000);
      if (target < rs.now) throw new Error('offsetsSeconds must not decrease');
      rs.now = target;
    } else if (index > 0 && this.spacing > 0) {
      rs.now += this.spacing;
    }
    const ts = rs.now;
    if (this.delayed) {
      this.pending.push([id, type, meaningWrong, readingWrong, ts]);
      return;
    }
    reportLocal(rs.db, { subjectId: id, type, meaningIncorrect: meaningWrong, readingIncorrect: readingWrong, timestamp: ts }, rs.now);
    this.answers.push({ id, answeredAtMs: ts, reportedAtMs: ts });
  }

  finish(resolved: Record<string, unknown>): void {
    const { rs } = this;
    if (this.delayed) {
      if (this.reportAfter > 0) rs.now += this.reportAfter;
      for (const [id, type, m, r, ts] of this.pending) {
        reportLocal(rs.db, { subjectId: id, type, meaningIncorrect: m, readingIncorrect: r, timestamp: ts }, rs.now);
        this.answers.push({ id, answeredAtMs: ts, reportedAtMs: rs.now });
      }
    }
    if (this.active) resolved.answers = this.answers;
  }
}

type Pair = [number, number];

/** `ScenarioRunner.wrongFor`: {meaningWrong, readingWrong} of one review. */
function wrongFor(rs: RunnerState, step: Step, id: number, usedOnce: Set<number> | null): Pair {
  const key = String(id);
  rs.reviewCounter++;
  const nth = (step.wrongEveryNth ?? {}) as Record<string, unknown>;
  if ('n' in nth && rs.reviewCounter % Number(nth.n) === 0) {
    return [argNumber(nth, 'meaning', 1), argNumber(nth, 'reading', 0)];
  }
  const once = (step.wrongOnce ?? {}) as Record<string, unknown>;
  if (usedOnce !== null && key in once && !usedOnce.has(id)) {
    usedOnce.add(id);
    const w = once[key] as number[];
    return [w[0]!, w[1]!];
  }
  const wrong = (step.wrong ?? {}) as Record<string, unknown>;
  if (key in wrong) {
    const w = wrong[key] as number[];
    return [w[0]!, w[1]!];
  }
  return [argNumber(step, 'meaningWrong', 0), argNumber(step, 'readingWrong', 0)];
}

const lesson: ActionHandler = ({ rs, step, resolved }) => {
  const list = 'ids' in step ? ids(step.ids) : select(rs.db, rs.now, step.where as Filter, true);
  const timing = new Timing(rs, step, list.length);
  list.forEach((id, i) => timing.answer(i, id, 'LESSON', 0, 0));
  timing.finish(resolved);
  resolved.ids = list;
  return { count: list.length };
};

const review: ActionHandler = ({ rs, step, resolved }) => {
  const list = 'ids' in step ? ids(step.ids) : select(rs.db, rs.now, step.where as Filter, false);
  const done: unknown[] = [];
  const timing = new Timing(rs, step, list.length);
  list.forEach((id, i) => {
    const [m, r] = wrongFor(rs, step, id, null);
    timing.answer(i, id, 'REVIEW', m, r);
    done.push([id, m, r]);
  });
  timing.finish(resolved);
  resolved.reviews = done;
  return { count: list.length };
};

/** Visible probation items: subject ids still on probation whose subject is visible. */
function visibleProbation(db: LearnerDb): number[] {
  return [...db.progress.probation.keys()].filter((id) => db.table.get(id)?.hiddenAt === 0);
}

/** `ScenarioRunner.satisfied`: the grind's stop condition. */
function satisfied(rs: RunnerState, until: Record<string, unknown>): boolean {
  const { db } = rs;
  if (until.onlyLastProbationSlot === true) {
    const slots = new Set<number>();
    for (const id of visibleProbation(db)) {
      const v = progressRow(db, id).availableAt;
      if (v !== null) slots.add(typeof v === 'number' ? v : Number.NaN);
    }
    return slots.size <= 1;
  }
  if (until.noProbation === true) return visibleProbation(db).length === 0;
  if ('level' in until && db.progress.userLevel < Number(until.level)) return false;
  if ('passed' in until) {
    return list(until.passed).every((id) => !db.table.has(id) || !sqlIsZero(progressRow(db, id).passedAt));
  }
  return 'level' in until;
}

function list(value: unknown): number[] {
  return (Array.isArray(value) ? value : [value]).map(Number);
}

/** `ScenarioRunner.grind`: rounds of all lessons, then the clock to the next due review and all due reviews. */
const grind: ActionHandler = ({ rs, step, resolved }) => {
  const until = (step.until ?? {}) as Record<string, unknown>;
  const max = argNumber(step, 'maxRounds', 100);
  const usedOnce = new Set<number>();
  const rounds: Record<string, unknown>[] = [];
  let ok = false;
  let stuck = false;
  const spacing = javaRound(argNumber(step, 'spacingSeconds', 0) * 1000);
  let round = 0;
  while (round < max) {
    if (satisfied(rs, until)) {
      ok = true;
      break;
    }
    const log: Record<string, unknown> = {};
    if (step.noLessons !== true) {
      const at = rs.now;
      const lessons = select(rs.db, rs.now, step.lessonsWhere as Filter, true);
      const times: number[] = [];
      lessons.forEach((id, i) => {
        if (i > 0 && spacing > 0) rs.now += spacing;
        times.push(rs.now);
        reportLocal(rs.db, { subjectId: id, type: 'LESSON', meaningIncorrect: 0, readingIncorrect: 0, timestamp: rs.now }, rs.now);
      });
      if (lessons.length > 0) {
        log.lessonsAtMs = at;
        log.lessons = lessons;
        if (spacing > 0) log.lessonTimesMs = times;
      }
    }
    let next: number | null = null;
    for (const s of rs.db.content.subjects) {
      if (!isReviewRow(rs.db, s.id) || !matchesFilter(rs.db, s.id, step.reviewsWhere as Filter)) continue;
      const v = progressRow(rs.db, s.id).availableAt;
      if (typeof v === 'number') next = next === null ? v : Math.min(next, v);
    }
    if (next === null || next === 0) {
      stuck = true;
      if (Object.keys(log).length > 0) rounds.push(log);
      break;
    }
    if (next > rs.now) rs.now = next;
    log.reviewsAtMs = rs.now;
    const done: unknown[] = [];
    const times: number[] = [];
    for (const id of select(rs.db, rs.now, step.reviewsWhere as Filter, false)) {
      if (done.length > 0 && spacing > 0) rs.now += spacing;
      times.push(rs.now);
      const [m, r] = wrongFor(rs, step, id, usedOnce);
      reportLocal(rs.db, { subjectId: id, type: 'REVIEW', meaningIncorrect: m, readingIncorrect: r, timestamp: rs.now }, rs.now);
      done.push([id, m, r]);
    }
    log.reviews = done;
    if (spacing > 0) log.reviewTimesMs = times;
    rounds.push(log);
    round++;
  }
  if (!ok && satisfied(rs, until)) ok = true;
  resolved.rounds = rounds;
  return { rounds: rounds.length, satisfied: ok, stuck };
};

/**
 * `ScenarioRunner.progressFile`: the text of a restore spec. A `generate`d file is taken from what the
 * Java runner recorded (`resolved.file`).
 */
export function progressFileText(rs: RunnerState, spec: Record<string, unknown>, recorded: Record<string, unknown>): string {
  if ('pushed' in spec) return readGoldenInput(String(spec.pushed));
  if ('inline' in spec) return JSON.stringify(spec.inline);
  if ('fromStep' in spec) {
    const text = rs.exports[Number(spec.fromStep)];
    if (text === undefined) throw new Error(`no export for step ${String(spec.fromStep)}`);
    return text;
  }
  if ('generate' in spec) {
    if (!('file' in recorded)) throw new Error('generate without a recorded file');
    return JSON.stringify(recorded.file);
  }
  if ('file' in spec) throw new Error(`start file assets are not ported: ${String(spec.file)}`);
  throw new Error(`bad progress spec ${JSON.stringify(spec)}`);
}

/** Drops whatever a running session or other action group keeps, as the Java reset deletes session items. */
function dropSession(rs: RunnerState): void {
  delete rs.ext.session;
}

const restore: ActionHandler = ({ rs, step, resolved, recorded }) => {
  const text = progressFileText(rs, step, recorded);
  resolved.file = JSON.parse(text);
  dropSession(rs);
  restoreIntoDb(rs.db, text, rs.now);
  return null;
};

const exportRestore: ActionHandler = ({ rs, resolved }) => {
  const first = exportFromDb(rs.db, rs.now);
  dropSession(rs);
  restoreIntoDb(rs.db, first, rs.now);
  const second = exportFromDb(rs.db, rs.now);
  resolved.file = JSON.parse(first);
  return { identical: firstDifference(JSON.parse(first), JSON.parse(second)) === null };
};

/** `ScenarioRunner.hideSelect`: visible subjects by {object, level, maxStage, limit (1)}, in level/lesson order. */
function hideSelect(db: LearnerDb, where: Record<string, unknown>): number[] {
  const rows: { id: number; level: number; pos: number }[] = [];
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id)!;
    if (t.hiddenAt !== 0) continue;
    if ('object' in where && s.object !== String(where.object)) continue;
    if ('level' in where && t.level !== Number(where.level)) continue;
    if ('maxStage' in where) {
      const stage = progressRow(db, s.id).srsStage;
      if (!(typeof stage === 'number' && stage <= Number(where.maxStage))) continue;
    }
    rows.push({ id: s.id, level: t.level, pos: t.lessonPosition });
  }
  rows.sort((a, b) => a.level - b.level || a.pos - b.pos || a.id - b.id);
  const out = rows.slice(0, argNumber(where, 'limit', 1)).map((r) => r.id);
  if (out.length === 0) throw new Error(`hideSubject where matched nothing: ${JSON.stringify(where)}`);
  return out;
}

/** `ScenarioRunner.setHidden`: a test-only content change of hiddenAt, then progression (unless update: false). */
function setHidden(rs: RunnerState, step: Step, hide: boolean): unknown {
  const value = hide ? rs.now : 0;
  const targets = step.ids === 'changed'
    ? [...rs.originalHidden.keys()]
    : 'ids' in step ? ids(step.ids) : hideSelect(rs.db, step.where as Record<string, unknown>);
  const subjects: unknown[] = [];
  for (const id of targets) {
    const t = rs.db.table.get(id);
    if (t === undefined) throw new Error(`no subject ${id}`);
    const before = t.hiddenAt;
    if (!rs.originalHidden.has(id)) rs.originalHidden.set(id, before);
    t.hiddenAt = value;
    subjects.push({ id, object: rs.db.content.byId.get(id)!.object, level: t.level, hiddenAtBefore: before, hiddenAt: value });
  }
  const unlocked = step.update === false ? null : updateProgression(rs.db, rs.now);
  return { subjects, unlocked };
}

export const baseActions: Record<string, ActionHandler> = {
  snapshot: () => null,
  advance: () => null,
  lesson,
  review,
  grind,
  restore,
  exportRestore,
  hideSubject: ({ rs, step }: ActionContext) => setHidden(rs, step, true),
  unhideSubject: ({ rs, step }: ActionContext) => setHidden(rs, step, false),
  progressionUpdate: ({ rs }: ActionContext) => ({ unlocked: updateProgression(rs.db, rs.now) }),
};

