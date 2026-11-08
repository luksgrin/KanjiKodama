/**
 * Level test rounds, block scores, boundary, sampled levels, result, startAtResult. Java:
 * local/LevelTest. Fixtures: levelTest/*, scenarios/lt-*.
 *
 * `estimators.ts`: the pure estimators (levelTest/estimators.json). `status.ts`: the stored status.
 * `flow.ts`: the rounds, the result, start-at-result and the session hook over a `LearnerDb`.
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
export {
  isRoundActive,
  levelTestBlockScores,
  levelTestBoundaryBlock,
  levelTestPrompted,
  levelTestResult,
  onSessionFinishing,
  setLevelTestPrompted,
  startAtResult,
  startRound1,
  startRound2,
  type FinishedSessionItem,
  type LevelTestOutcome,
  type LevelTestResult,
} from './flow';
