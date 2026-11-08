/**
 * A lesson or review result in local mode: a finished lesson starts the subject, a
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

/** What a server-mode report hands to the upload queue. */
export interface ServerReport extends LocalReport {
  /** The session item's assignment id (0 when not known yet). */
  assignmentId: number;
  /** `processReviewFinished`'s `justPassed`: passed for the first time and has amalgamations. */
  justPassed: boolean;
  /** `ts`: the answer time, or `now` when the report had none. */
  at: number;
}

/**
 * A lesson or review result in server mode: the same local prediction as local mode (the
 * "patched" assignment and review statistic, `assignmentPatched`/`statisticPatched` = 1, replaced
 * when the server's data comes in), but no fast-travel probation and no local progression: the
 * server decides unlocks and level-ups. Returns what to upload, or null for a self-study item (no
 * reporting task) or an unknown subject.
 */
export function reportServer(db: LearnerDb, report: LocalReport & { assignmentId?: number }, now: number): ServerReport | null {
  const id = report.subjectId;
  const known = db.table.has(id);
  const ts = report.timestamp > 0 ? report.timestamp : now;
  let justPassed = false;
  if (known && (report.type === 'LESSON' || report.type === 'REVIEW')) {
    const reviewed = reportSessionItem(srsSystemOf(db, id), srsProgress(db, id), {
      type: report.type, meaningIncorrect: report.meaningIncorrect, readingIncorrect: report.readingIncorrect, timestamp: ts,
    }, now);
    const p = reviewed.progress;
    patchAssignment(db, id, p.srsStage, p.unlockedAt, p.startedAt, p.availableAt, p.passedAt, p.burnedAt, p.resurrectedAt);
    if (report.type === 'REVIEW') {
      justPassed = reviewed.firstPassed && (db.content.byId.get(id)?.amalgamationSubjectIds.length ?? 0) > 0;
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
    }
  }
  if (known && (report.meaningIncorrect > 0 || report.readingIncorrect > 0)) {
    updateProgress(db, id, { lastIncorrectAnswer: ts });
  }
  if (!known || (report.type !== 'LESSON' && report.type !== 'REVIEW')) return null;
  const assignmentId = report.assignmentId !== undefined && report.assignmentId !== 0
    ? report.assignmentId
    : num(progressRow(db, id), 'assignmentId');
  return { ...report, assignmentId, justPassed, at: ts };
}
