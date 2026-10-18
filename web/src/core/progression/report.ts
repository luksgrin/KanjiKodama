/**
 * `jobs/ReportSessionItemJob.runLocal` in local mode: a finished lesson starts the subject, a
 * finished review moves its stage and statistics (and takes it off fast-travel probation), then
 * local progression runs; any wrong answer sets `lastIncorrectAnswer`. The session item update is
 * the session's own business.
 */

import { onReviewed } from '../fastTravel/fastTravel';
import { leechScore, reportSessionItem, type ReportType, type SrsProgress } from '../srs';
import { num, patchAssignment, progressRow, srsSystemOf, updateProgress, type LearnerDb } from './db';
import { updateProgression } from './localProgression';

export interface LocalReport {
  subjectId: number;
  type: ReportType;
  meaningIncorrect: number;
  readingIncorrect: number;
  /** When the item was answered; 0 means `now`. */
  timestamp: number;
}

function srsProgress(db: LearnerDb, id: number): SrsProgress {
  const row = progressRow(db, id);
  return {
    srsStage: num(row, 'srsStage'),
    unlockedAt: num(row, 'unlockedAt'),
    startedAt: num(row, 'startedAt'),
    availableAt: num(row, 'availableAt'),
    passedAt: num(row, 'passedAt'),
    burnedAt: num(row, 'burnedAt'),
    resurrectedAt: num(row, 'resurrectedAt'),
    passed: num(row, 'passed'),
    meaningCorrect: num(row, 'meaningCorrect'),
    meaningIncorrect: num(row, 'meaningIncorrect'),
    meaningMaxStreak: num(row, 'meaningMaxStreak'),
    meaningCurrentStreak: num(row, 'meaningCurrentStreak'),
    readingCorrect: num(row, 'readingCorrect'),
    readingIncorrect: num(row, 'readingIncorrect'),
    readingMaxStreak: num(row, 'readingMaxStreak'),
    readingCurrentStreak: num(row, 'readingCurrentStreak'),
    percentageCorrect: num(row, 'percentageCorrect'),
    lastIncorrectAnswer: num(row, 'lastIncorrectAnswer'),
  };
}

/**
 * Reports one finished item at `now` (the clock; `report.timestamp` is the answer time). Returns
 * whether a review made the subject pass for the first time.
 */
export function reportLocal(db: LearnerDb, report: LocalReport, now: number): boolean {
  const id = report.subjectId;
  let firstPassed = false;
  const known = db.table.has(id);
  const ts = report.timestamp > 0 ? report.timestamp : now;
  if (known && (report.type === 'LESSON' || report.type === 'REVIEW')) {
    const reviewed = reportSessionItem(srsSystemOf(db, id), srsProgress(db, id), {
      type: report.type, meaningIncorrect: report.meaningIncorrect, readingIncorrect: report.readingIncorrect, timestamp: ts,
    }, now);
    const p = reviewed.progress;
    patchAssignment(db, id, p.srsStage, p.unlockedAt, p.startedAt, p.availableAt, p.passedAt, p.burnedAt, p.resurrectedAt);
    if (report.type === 'REVIEW') {
      firstPassed = reviewed.firstPassed;
      updateProgress(db, id, {
        meaningCorrect: p.meaningCorrect,
        meaningIncorrect: p.meaningIncorrect,
        meaningCurrentStreak: p.meaningCurrentStreak,
        meaningMaxStreak: p.meaningMaxStreak,
        readingCorrect: p.readingCorrect,
        readingIncorrect: p.readingIncorrect,
        readingCurrentStreak: p.readingCurrentStreak,
        readingMaxStreak: p.readingMaxStreak,
        percentageCorrect: p.percentageCorrect,
        leechScore: leechScore(p),
        statisticPatched: 1,
      });
      onReviewed(db, id, report.meaningIncorrect + report.readingIncorrect > 0);
    }
  }
  updateProgression(db, now);
  if (known && (report.meaningIncorrect > 0 || report.readingIncorrect > 0)) {
    updateProgress(db, id, { lastIncorrectAnswer: ts });
  }
  return firstPassed;
}
