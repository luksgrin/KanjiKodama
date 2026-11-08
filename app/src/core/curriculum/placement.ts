/**
 * Where a learner lands after switching curriculum order.
 *
 * The learner is placed on the first level where they have mastered (passed, Guru or above) less than
 * {@link PLACEMENT_THRESHOLD} of the kanji. Every kanji below that level that is not mastered yet is
 * "backfill": it unlocks right away as a lesson instead of holding the learner back.
 */

export const PLACEMENT_THRESHOLD = 0.6;

export interface Placement {
  readonly level: number;
  readonly backfill: number;
}

/**
 * `Placement.of`.
 *
 * @param kanjiTotal number of (non-hidden) kanji per level, index 0 = level 1
 * @param kanjiPassed number of those that are mastered, same indexing
 * @returns level is at least 1 and at most the number of levels
 */
export function placementOf(kanjiTotal: readonly number[], kanjiPassed: readonly number[]): Placement {
  const levels = Math.max(1, kanjiTotal.length);
  let level = levels;
  for (let i = 0; i < kanjiTotal.length; i++) {
    if (kanjiTotal[i]! > 0 && kanjiPassed[i]! < PLACEMENT_THRESHOLD * kanjiTotal[i]!) {
      level = i + 1;
      break;
    }
  }
  let backfill = 0;
  for (let i = 0; i < level - 1; i++) backfill += kanjiTotal[i]! - kanjiPassed[i]!;
  return { level, backfill };
}
