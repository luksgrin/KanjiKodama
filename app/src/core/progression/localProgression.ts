/**
 * Local progression: what the WaniKani server does after reviews, done locally.
 *
 * - The user levels up when at least 90 % of the current level's visible kanji have passed (reached
 *   Guru). Levels never go down, and stop at the curriculum's last level.
 * - Within unlocked levels, a subject unlocks when every component has passed or is hidden: radicals
 *   and kana-only vocabulary (no components) at once, kanji after their radicals, vocabulary after
 *   its kanji.
 *
 * The order is whatever the subject table's level column says, so the JLPT order only rewrites it.
 */

import { WANIKANI_MAX_LEVEL } from '../curriculum';
import { currentMaxLevel, forceLessonAvailable, num, progressRow, sqlNonZero, type LearnerDb } from './db';

const LEVEL_UP_SHARE = 0.9;

/** Some visible kanji on the level, and ceil(90 %) of them passed. */
function levelComplete(db: LearnerDb, level: number): boolean {
  let total = 0;
  let done = 0;
  for (const s of db.content.subjects) {
    if (s.object !== 'kanji') continue;
    const t = db.table.get(s.id)!;
    if (t.hiddenAt !== 0 || t.level !== level) continue;
    total++;
    if (sqlNonZero(progressRow(db, s.id).passedAt)) done++;
  }
  return total > 0 && done >= Math.ceil(total * LEVEL_UP_SHARE);
}

/**
 * Recomputes the level (and the level progression rows) and unlock what
 * became available, at `now`. Returns the number of new unlocks.
 */
export function updateProgression(db: LearnerDb, now: number): number {
  const p = db.progress;
  let level = Math.max(1, p.userLevel);
  while (level < currentMaxLevel(db) && levelComplete(db, level)) level++;
  p.userLevel = level;

  for (let l = 1; l <= level; l++) {
    if (!p.levelProgression.has(l)) {
      p.levelProgression.set(l, {
        id: l, level: l, abandonedAt: 0, completedAt: 0, createdAt: now, passedAt: 0, startedAt: now, unlockedAt: now,
      });
    }
    const row = p.levelProgression.get(l)!;
    if (l < level && row.passedAt === 0) row.passedAt = now;
  }

  const passed = new Set<number>();
  for (const s of db.content.subjects) {
    if (sqlNonZero(progressRow(db, s.id).passedAt) || db.table.get(s.id)!.hiddenAt !== 0) passed.add(s.id);
  }
  const toUnlock: number[] = [];
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id)!;
    const row = progressRow(db, s.id);
    if (t.hiddenAt !== 0 || row.unlockedAt !== 0 || t.level > level) continue;
    if (s.componentSubjectIds.every((c) => passed.has(c))) toUnlock.push(s.id);
  }
  for (const id of toUnlock) forceLessonAvailable(db, id, now, WANIKANI_MAX_LEVEL);
  return toUnlock.length;
}

/** Recomputes unlocks after progress changed wholesale. */
export function afterChange(db: LearnerDb, now: number): void {
  updateProgression(db, now);
}

/** Re-exported for callers that only need the passed check. */
export function isPassed(db: LearnerDb, id: number): boolean {
  return num(progressRow(db, id), 'passedAt') !== 0;
}
