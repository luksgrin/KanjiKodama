import { DAY } from '../time';

/** `LevelTest.ROUND1_PER_BLOCK`: kanji asked per block in round 1. */
export const ROUND1_PER_BLOCK = 6;
/** `LevelTest.ROUND2_LEVELS`: levels of the boundary block sampled in round 2. */
export const ROUND2_LEVELS = 6;
/** `LevelTest.ROUND2_PER_LEVEL`: kanji asked per sampled level in round 2. */
export const ROUND2_PER_LEVEL = 3;
/** `LevelTest.PROBATION_WINDOW`: the result's probation is spread over 7 days. */
export const PROBATION_WINDOW = 7 * DAY;
/** `LevelTest.TESTED_BLOCKS`: N5 (5) down to N1 (1). Block 0 is "Obscure". */
export const TESTED_BLOCKS: readonly number[] = [5, 4, 3, 2, 1];
/**
 * `Placement.THRESHOLD`: a block or level counts as known from 60 %. Duplicated here until the
 * curriculum module exports it.
 */
export const KNOWN_THRESHOLD = 0.6;

/**
 * `LevelTest.Levels`: kanji per JLPT-order level (index 1..count; index 0 unused): how many there
 * are, how many are mastered (passed), and the ids not mastered yet. `blocks[l - 1]` is the JLPT
 * block of level l (`Curriculum.Layout.blocks`).
 */
export interface LevelKnowledge {
  count: number;
  blocks: readonly number[];
  total: readonly number[];
  mastered: readonly number[];
  open: readonly (readonly number[])[];
}

/** `Levels.levelsOf`: the levels of a block, ascending. */
export function levelsOf(levels: LevelKnowledge, block: number): number[] {
  const out: number[] = [];
  for (let l = 1; l <= levels.count; l++) {
    if (levels.blocks[l - 1] === block) {
      out.push(l);
    }
  }
  return out;
}

/**
 * A level-test answer by kanji id (`mm_level_test.known`): 1 known, 0 not known, -1 asked but not
 * answered yet. Missing ids were never asked.
 */
export type LevelTestAnswers = ReadonlyMap<number, number>;

/**
 * `LevelTest.share`: the estimated share of the given levels the learner knows. Mastered kanji
 * count fully; the open ones count at the known rate among the answered ones (1 if nothing is open,
 * 0 if open kanji exist but none was answered). 1 when the levels have no kanji.
 */
export function share(levels: LevelKnowledge, which: readonly number[], answers: LevelTestAnswers): number {
  let total = 0;
  let mastered = 0;
  let open = 0;
  let asked = 0;
  let known = 0;
  for (const l of which) {
    total += levels.total[l]!;
    mastered += levels.mastered[l]!;
    open += levels.open[l]!.length;
    for (const id of levels.open[l]!) {
      const a = answers.get(id);
      if (a !== undefined && a >= 0) {
        asked++;
        known += a;
      }
    }
  }
  if (total === 0) {
    return 1;
  }
  const p = asked > 0 ? known / asked : open === 0 ? 1 : 0;
  return (mastered + p * open) / total;
}

/** `LevelTest.BlockScore`: the per-block picture after round 1. */
export interface BlockScore {
  block: number;
  asked: number;
  known: number;
  share: number;
}

/** `LevelTest.blockScores` on prepared knowledge: one score per tested block, N5 first. */
export function blockScores(levels: LevelKnowledge, answers: LevelTestAnswers): BlockScore[] {
  return TESTED_BLOCKS.map((block) => {
    let asked = 0;
    let known = 0;
    const which = levelsOf(levels, block);
    for (const l of which) {
      for (const id of levels.open[l]!) {
        const a = answers.get(id);
        if (a !== undefined && a >= 0) {
          asked++;
          known += a;
        }
      }
    }
    return { block, asked, known, share: share(levels, which, answers) };
  });
}

/** `LevelTest.boundaryBlock`: the first tested block below the threshold, or 0 (Obscure) if none. */
export function boundaryBlock(scores: readonly BlockScore[]): number {
  return scores.find((s) => s.share < KNOWN_THRESHOLD)?.block ?? 0;
}

/**
 * `LevelTest.sampledLevels`: up to 6 levels of the block, evenly spaced, first and last included,
 * without duplicates.
 */
export function sampledLevels(blockLevels: readonly number[]): number[] {
  const out: number[] = [];
  const n = blockLevels.length;
  const k = Math.min(ROUND2_LEVELS, n);
  for (let i = 0; i < k; i++) {
    // Java Math.round: floor(x + 0.5), the same as JS Math.round for these non-negative values
    const idx = k === 1 ? 0 : Math.round((i * (n - 1)) / (k - 1));
    const level = blockLevels[idx]!;
    if (!out.includes(level)) {
      out.push(level);
    }
  }
  return out;
}

/**
 * `LevelTest.Result.minutesPerDay`: the extra daily review time the probation adds, at 12 s per
 * item spread over the probation window, rounded up.
 */
export function minutesPerDay(probation: number): number {
  return Math.ceil((probation * 12) / 60.0 / (PROBATION_WINDOW / DAY));
}
