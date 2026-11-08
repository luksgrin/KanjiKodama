/**
 * Fast travel: jumping ahead in JLPT order without burning anything.
 *
 * - One jump moves up to `MAX_JUMP` levels. The next jump needs `COOLDOWN` to have passed and every
 *   probation item of the previous jump to have been answered.
 * - Kanji and vocabulary of the skipped levels that were not started yet go on probation: they enter
 *   reviews at Apprentice IV, spread evenly over the window. A correct answer moves them on as usual;
 *   a wrong one sends them back to the lesson queue.
 * - Radicals of the skipped levels are not tested; they wait in the lesson queue.
 */

import { HOUR } from '../time';
import {
  currentLevelDescription,
  currentMaxLevel,
  num,
  patchAssignment,
  progressRow,
  sqlIsZero,
  srsSystemOf,
  type LearnerDb,
} from '../progression/db';
import { afterChange, updateProgression } from '../progression/localProgression';

export const MAX_JUMP = 5;
export const COOLDOWN = 72 * HOUR;
/** Stage a probation item starts at (Apprentice IV); one correct answer reaches Guru I. */
const PROBATION_STAGE = 4;
/** Rough time per review item (meaning and reading), for the workload estimate. */
const SECONDS_PER_ITEM = 12;

/** One possible jump. */
export interface FastTravelOption {
  target: number;
  targetDescription: string | null;
  probation: number;
  radicals: number;
  minutesPerDay: number;
}

/** Whether a jump is possible now, and if not, why. */
export interface FastTravelStatus {
  level: number;
  blocked: string | null;
  options: FastTravelOption[];
}

function option(target: number, targetDescription: string | null, probation: number, radicals: number): FastTravelOption {
  return {
    target,
    targetDescription,
    probation,
    radicals,
    minutesPerDay: Math.ceil(probation * SECONDS_PER_ITEM / 60.0 / (COOLDOWN / (24.0 * HOUR))),
  };
}

/** Visible, not started, radicals or not, on levels [from, to). */
function count(db: LearnerDb, from: number, to: number, radicals: boolean): number {
  let n = 0;
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id)!;
    if (t.hiddenAt !== 0 || !sqlIsZero(progressRow(db, s.id).startedAt)) continue;
    if ((s.object === 'radical') !== radicals) continue;
    if (t.level >= from && t.level < to) n++;
  }
  return n;
}

/** Probation items that can still come up (visible subjects only). */
export function pendingProbation(db: LearnerDb): number {
  let n = 0;
  for (const id of db.progress.probation.keys()) {
    const t = db.table.get(id);
    if (t !== undefined && t.hiddenAt === 0) n++;
  }
  return n;
}

function lastJump(db: LearnerDb): number {
  let last: number | null = null;
  for (const j of db.progress.jumps) last = last === null ? j.at : Math.max(last, j.at);
  return last ?? 0;
}

/** Whether fast travel is possible now, and where to. */
export function fastTravelStatus(db: LearnerDb, now: number): FastTravelStatus {
  const level = Math.max(1, db.progress.userLevel);
  const options: FastTravelOption[] = [];
  if (db.progress.curriculum !== 'JLPT') {
    return { level, blocked: 'Fast travel is only available in JLPT order. Switch in Settings, Progress, Curriculum order.', options };
  }
  const pending = pendingProbation(db);
  if (pending > 0) {
    return { level, blocked: `Answer the ${pending} remaining probation reviews from your last jump first.`, options };
  }
  const last = lastJump(db);
  const wait = last + COOLDOWN - now;
  if (last > 0 && wait > 0) {
    const hours = Math.trunc((wait + HOUR - 1) / HOUR);
    const text = hours >= 24 ? `${Math.trunc(hours / 24)} d ${hours % 24} h` : `${hours} h`;
    return { level, blocked: `The next fast travel is available in ${text}.`, options };
  }
  const max = currentMaxLevel(db);
  if (level >= max) return { level, blocked: 'You are already on the last level.', options };
  for (let target = level + 1; target <= Math.min(max, level + MAX_JUMP); target++) {
    options.push(option(target, currentLevelDescription(db, target), count(db, level, target, false), count(db, level, target, true)));
  }
  return { level, blocked: null, options };
}

/**
 * Jump to `target`, spreading the probation reviews over `window` (default the
 * cooldown). The caller checked the status. Returns the number of probation items.
 */
export function fastTravel(db: LearnerDb, target: number, now: number, window: number = COOLDOWN): number {
  const from = Math.max(1, db.progress.userLevel);
  const firstSlot = now - (now % HOUR);
  const slots = Math.trunc(Math.max(1, Math.trunc(window / HOUR)));

  const items: { id: number; unlockedAt: number; kanji: boolean; level: number; lessonPosition: number }[] = [];
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id)!;
    const row = progressRow(db, s.id);
    if (t.hiddenAt !== 0 || !sqlIsZero(row.startedAt) || s.object === 'radical') continue;
    if (t.level < from || t.level >= target) continue;
    items.push({ id: s.id, unlockedAt: num(row, 'unlockedAt'), kanji: s.object === 'kanji', level: t.level, lessonPosition: t.lessonPosition });
  }
  // ORDER BY object = 'kanji' DESC, level, lessonPosition, id
  items.sort((a, b) => Number(b.kanji) - Number(a.kanji) || a.level - b.level || a.lessonPosition - b.lessonPosition || a.id - b.id);

  for (let i = 0; i < items.length; i++) {
    const { id } = items[i]!;
    const unlockedAt = items[i]!.unlockedAt !== 0 ? items[i]!.unlockedAt : now;
    const availableAt = firstSlot + Math.trunc((i * slots) / items.length) * HOUR;
    patchAssignment(db, id, PROBATION_STAGE, unlockedAt, now, availableAt, 0, 0, 0);
    db.progress.probation.set(id, now);
  }
  db.progress.jumps.push({ at: now, fromLevel: from, toLevel: target });
  db.progress.userLevel = target;
  updateProgression(db, now);
  afterChange(db, now);
  return items.length;
}

/**
 * After a review was recorded, a probation item leaves probation; answered
 * wrong, it goes back to the lesson queue.
 */
export function onReviewed(db: LearnerDb, subjectId: number, wrong: boolean): void {
  if (!db.progress.probation.has(subjectId)) return;
  db.progress.probation.delete(subjectId);
  if (!wrong || !db.table.has(subjectId)) return;
  const initial = srsSystemOf(db, subjectId).initialStage.id;
  patchAssignment(db, subjectId, initial, num(progressRow(db, subjectId), 'unlockedAt'), 0, 0, 0, 0, 0);
}
