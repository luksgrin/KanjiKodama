/**
 * Level test rounds, block scores, boundary, sampled levels, result, startAtResult. Java:
 * local/LevelTest. Fixtures: levelTest/*, scenarios/lt-*.
 *
 * So far the pure estimators (levelTest/estimators.json); the rounds and the result need the
 * curriculum layout and progress and come with the level-test flow.
 */
export {
  KNOWN_THRESHOLD,
  PROBATION_WINDOW,
  ROUND1_PER_BLOCK,
  ROUND2_LEVELS,
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
  type LevelTestAnswers,
} from './estimators';
export { LEVEL_TEST_STATUSES, discardLevelTest, levelTestStatus, setLevelTestStatus, type LevelTestStatus } from './status';
