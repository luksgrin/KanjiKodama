/**
 * `levelTestRound {round, known: "all" | "none" | {blocks} | {ids}, abandon}`, `levelTestResult`,
 * `levelTestStartAtResult`, `levelTestDiscard`.
 */

import {
  discardLevelTest,
  levelTestBlockScores,
  levelTestBoundaryBlock,
  levelTestResult,
  levelTestStatus,
  onSessionFinishing,
  startAtResult,
  startRound1,
  startRound2,
  type FinishedSessionItem,
} from '../../../../src/core/levelTest';
import { layoutFor, type LearnerDb } from '../../../../src/core/progression';
import { SeededRandom } from '../../../../src/core/rng';
import { argNumber, type ActionHandler, type RunnerState } from '../runner';

/** A new generator with the test seed. */
export function levelTestRandom(rs: RunnerState): SeededRandom {
  return new SeededRandom(BigInt(rs.seed));
}

/** The JLPT block of every subject the JLPT layout places. */
function jlptBlocks(db: LearnerDb): Map<number, number> {
  const layout = layoutFor(db, 'JLPT');
  const out = new Map<number, number>();
  for (const [id, [level]] of layout.placement) {
    if (level >= 1 && level <= layout.blocks.length) out.set(id, layout.blocks[level - 1]!);
  }
  return out;
}

function numbers(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

export const levelTestActions: Record<string, ActionHandler> = {
  levelTestRound: ({ rs, step, resolved }) => {
    const { db } = rs;
    const round = argNumber(step, 'round', 0);
    const picked = round === 1 ? startRound1(db, levelTestRandom(rs)) : startRound2(db, levelTestRandom(rs));
    const blocks = jlptBlocks(db);
    const known = step.known;
    const knownObj = typeof known === 'object' && known !== null ? (known as Record<string, unknown>) : {};
    const knownIds = new Set(numbers(knownObj.ids));
    const knownBlocks = new Set(numbers(knownObj.blocks));
    const abandon = argNumber(step, 'abandon', 0);
    const items: FinishedSessionItem[] = [];
    const answers: Record<string, string> = {};
    const pickedOut: unknown[] = [];
    picked.forEach((id, i) => {
      const block = blocks.get(id);
      pickedOut.push({ id, block: block ?? null });
      if (i < abandon) {
        items.push({ id, hasIncorrectAnswers: false, abandoned: true, finished: true });
        answers[String(id)] = 'abandoned';
      } else {
        const isKnown = known === 'all' || knownIds.has(id) || (block !== undefined && knownBlocks.has(block));
        // PENDING (finished); a wrong answer is question1Incorrect = 1
        items.push({ id, hasIncorrectAnswers: !isKnown, abandoned: false, finished: true });
        answers[String(id)] = isKnown ? 'known' : 'wrong';
      }
    });
    if (items.length > 0) onSessionFinishing(db, 'SELF_STUDY', items);
    resolved.picked = pickedOut;
    resolved.answers = answers;
    return {
      picked: picked.length,
      status: levelTestStatus(db),
      blockScores: levelTestBlockScores(db),
      boundaryBlock: levelTestBoundaryBlock(db),
    };
  },

  levelTestResult: ({ rs }) => {
    const r = levelTestResult(rs.db);
    return { level: r.level, description: r.description, proven: r.proven, probation: r.probation, minutesPerDay: r.minutesPerDay };
  },

  levelTestStartAtResult: ({ rs }) => startAtResult(rs.db, rs.now),

  levelTestDiscard: ({ rs }) => {
    discardLevelTest(rs.db);
    return null;
  },
};
