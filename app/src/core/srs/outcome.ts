import { SECOND, topOfHour } from '../time';
import { LOCKED_STAGE_ID, type SrsSystem } from './system';

/**
 * The SRS and review-statistic columns of a subject's progress (`subject` table), the part a
 * finished lesson or review changes.
 */
export interface SrsProgress {
  srsStage: number;
  unlockedAt: number;
  startedAt: number;
  availableAt: number;
  passedAt: number;
  burnedAt: number;
  resurrectedAt: number;
  passed: number;
  meaningCorrect: number;
  meaningIncorrect: number;
  meaningMaxStreak: number;
  meaningCurrentStreak: number;
  readingCorrect: number;
  readingIncorrect: number;
  readingMaxStreak: number;
  readingCurrentStreak: number;
  percentageCorrect: number;
  lastIncorrectAnswer: number;
}

/** Patches the assignment: a subject that isn't unlocked is stored at stage -999. */
function patchAssignment(p: SrsProgress, stageId: number, startedAt: number, availableAt: number, passedAt: number,
  burnedAt: number): SrsProgress {
  return {
    ...p,
    srsStage: p.unlockedAt === 0 ? LOCKED_STAGE_ID : stageId,
    startedAt,
    availableAt,
    passedAt,
    burnedAt,
  };
}

/** A finished lesson: the first started stage, due at the top of the hour. */
function lessonFinished(system: SrsSystem, p: SrsProgress, ts: number): SrsProgress {
  const stage = system.firstStartedStage;
  const available = ts + stage.interval + 30 * SECOND;
  return patchAssignment(p, stage.id, ts, topOfHour(available), p.passedAt, p.burnedAt);
}

/**
 * A finished review: the new stage, due time, passed/burned times, and the
 * review statistics.
 */
function reviewFinished(system: SrsSystem, p: SrsProgress, meaningWrong: number, readingWrong: number,
  ts: number): { progress: SrsProgress; firstPassed: boolean } {
  const newStage = system.getStage(p.srsStage).getNewStage(meaningWrong + readingWrong);
  const available = ts + newStage.interval + 30 * SECOND;
  let burnedAt = p.burnedAt;
  let passedAt = p.passedAt;
  let availableAt: number;
  if (newStage.isCompleted) {
    if (burnedAt === 0) {
      burnedAt = ts;
    }
    availableAt = 0;
  } else {
    availableAt = topOfHour(available);
  }
  let firstPassed = false;
  if (newStage.isPassed && p.passedAt === 0) {
    passedAt = ts;
    firstPassed = true;
  }
  const q = patchAssignment(p, newStage.id, p.startedAt, availableAt, passedAt, burnedAt);

  let { meaningCorrect, meaningIncorrect, meaningCurrentStreak, meaningMaxStreak } = q;
  let { readingCorrect, readingIncorrect, readingCurrentStreak, readingMaxStreak } = q;
  if (meaningWrong === 0) {
    meaningCorrect++;
    meaningCurrentStreak++;
    meaningMaxStreak = Math.max(meaningMaxStreak, meaningCurrentStreak);
  } else {
    meaningIncorrect++;
    meaningCurrentStreak = 0;
  }
  if (readingWrong === 0) {
    readingCorrect++;
    readingCurrentStreak++;
    readingMaxStreak = Math.max(readingMaxStreak, readingCurrentStreak);
  } else {
    readingIncorrect++;
    readingCurrentStreak = 0;
  }
  const total = meaningCorrect + meaningIncorrect + readingCorrect + readingIncorrect;
  const percentageCorrect = Math.trunc(((meaningCorrect + readingCorrect) * 100) / total);
  return {
    progress: {
      ...q,
      meaningCorrect, meaningIncorrect, meaningCurrentStreak, meaningMaxStreak,
      readingCorrect, readingIncorrect, readingCurrentStreak, readingMaxStreak,
      percentageCorrect,
    },
    firstPassed,
  };
}

/** The review statistic's leech score (not part of the progress file). */
export function leechScore(p: Pick<SrsProgress, 'meaningIncorrect' | 'meaningCurrentStreak' | 'readingIncorrect'
  | 'readingCurrentStreak'>): number {
  const streak = (n: number): number => (n === 0 ? 0.5 : Math.pow(n, 1.5));
  return Math.trunc(1000 * Math.max(p.meaningIncorrect / streak(p.meaningCurrentStreak),
    p.readingIncorrect / streak(p.readingCurrentStreak)));
}

/** `SessionType`; only lessons and reviews change SRS (self-study only records wrong answers). */
export type ReportType = 'LESSON' | 'REVIEW' | 'SELF_STUDY';

export interface ReportedItem {
  type: ReportType;
  /** Wrong answers in this session (a lesson quiz counts too, for `lastIncorrectAnswer`). */
  meaningIncorrect: number;
  readingIncorrect: number;
  /** When the item was finished; 0 means "now". */
  timestamp: number;
}

export interface ReportOutcome {
  progress: SrsProgress;
  /**
   * A review took the subject to a passed stage for the first time. The server-mode `justPassed` is
   * this and "has amalgamations"; it only drives the server-mode sync reminder (local mode unlocks through
   * progression instead).
   */
  firstPassed: boolean;
  /** The time used. */
  ts: number;
}

/**
 * A lesson or review result, the subject's own row: a finished lesson starts the subject,
 * a finished review moves its stage and statistics; any wrong answer sets `lastIncorrectAnswer`.
 * Side effects on other rows (unlocks, fast-travel probation, the session item) are elsewhere.
 */
export function reportSessionItem(system: SrsSystem, before: SrsProgress, item: ReportedItem, now: number): ReportOutcome {
  const ts = item.timestamp > 0 ? item.timestamp : now;
  let progress = before;
  let firstPassed = false;
  if (item.type === 'LESSON') {
    progress = lessonFinished(system, progress, ts);
  } else if (item.type === 'REVIEW') {
    ({ progress, firstPassed } = reviewFinished(system, progress, item.meaningIncorrect, item.readingIncorrect, ts));
  }
  if (item.meaningIncorrect > 0 || item.readingIncorrect > 0) {
    progress = { ...progress, lastIncorrectAnswer: ts };
  }
  return { progress, firstPassed, ts };
}
