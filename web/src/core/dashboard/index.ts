/**
 * The dashboard: timeline (available lessons and reviews, upcoming reviews per hour), level progress
 * bars and SRS breakdown. Java: livedata/LiveTimeLine, LiveLevelProgress, LiveSrsBreakDown,
 * model/TimeLine, LevelProgress, SrsBreakDown. Fixtures: scenarios/real-progress.json and
 * scenarios/dashboard-level-progress-settings*.json (`dashboard`, the latter under every level progress setting).
 */
export {
  DEFAULT_TIME_LINE_SIZE,
  LOCAL_MAX_LEVEL_GRANTED,
  availableLessonIds,
  computeTimeLine,
  levelUpIds,
  numUpcomingReviews,
  upcomingReviewDate,
  upcomingReviewIds,
  type TimeLine,
  type TimeLineOptions,
} from './timeLine';
export { computeLevelProgress, type LevelProgressBar, type LevelProgressOptions } from './levelProgress';
export { SRS_BREAKDOWN_BUCKETS, computePost60Breakdown, computeSrsBreakdown } from './srsBreakdown';
export {
  limitPreviousLevelProgression,
  previousLevelProgressionLimitedAmount,
  showLevelProgression,
  showOverLevelProgression,
  showSrsBreakdown,
  showTimeLine,
  timeLineChartSize,
} from './settings';
