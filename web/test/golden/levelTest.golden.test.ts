import { boundaryBlock, minutesPerDay, sampledLevels, share, type BlockScore, type LevelKnowledge } from '../../src/core/levelTest';
import { goldenSuite } from './harness';

interface ShareInput {
  levels: { level: number; total: number; mastered: number; open: number[] }[];
  which: number[];
  answers: [number, number][];
}

/** The four estimators share one file; the case name says which one. */
goldenSuite<unknown, unknown>('levelTest/estimators.json', (input, c) => {
  if (c.name.startsWith('boundary-')) {
    return boundaryBlock((input as { scores: BlockScore[] }).scores);
  }
  if (c.name.startsWith('sampled-')) {
    return sampledLevels((input as { blockLevels: number[] }).blockLevels);
  }
  if (c.name.startsWith('share-')) {
    const s = input as ShareInput;
    // LevelTestGolden builds Levels with every level in block 5 (irrelevant to share)
    const levels: LevelKnowledge = {
      count: s.levels.length,
      blocks: s.levels.map(() => 5),
      total: [0, ...s.levels.map((l) => l.total)],
      mastered: [0, ...s.levels.map((l) => l.mastered)],
      open: [[], ...s.levels.map((l) => l.open)],
    };
    return share(levels, s.which, new Map(s.answers));
  }
  if (c.name.startsWith('minutesPerDay-')) {
    return minutesPerDay((input as { probation: number }).probation);
  }
  throw new Error(`unknown estimator case ${c.name}`);
});
