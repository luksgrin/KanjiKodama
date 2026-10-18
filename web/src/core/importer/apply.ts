/**
 * `tasks/WaniKaniImporter.apply`: replace all local progress with downloaded WaniKani progress, as
 * the `SubjectSyncDao`/`LevelProgressionDao` SQL does it. Subjects the content doesn't have are
 * skipped and counted; in JLPT order the learner is then placed by what they know.
 */

import { parseApiStudyMaterial, serializeSynonymsColumn, type ApiStudyMaterial } from '../answer/synonyms';
import { afterChange, placeLearnerInDb, updateProgress, type LearnerDb } from '../progression';
import { emptyProgress } from '../progressFile';
import {
  parseApiAssignment,
  parseApiLevelProgression,
  parseApiReviewStatistic,
  parseApiUser,
  type ApiAssignment,
  type ApiEnvelope,
  type ApiLevelProgression,
  type ApiReviewStatistic,
  type ApiUser,
} from './api';

/** `WaniKaniImporter.Download`: everything fetched, in API order. */
export interface WaniKaniDownload {
  user: ApiUser;
  assignments: ApiAssignment[];
  statistics: ApiReviewStatistic[];
  materials: ApiStudyMaterial[];
  levels: ApiLevelProgression[];
}

/** The four collections as API envelopes, plus the user's `data`. */
export interface WaniKaniApiData {
  user: Record<string, unknown>;
  assignments?: readonly ApiEnvelope[];
  review_statistics?: readonly ApiEnvelope[];
  study_materials?: readonly ApiEnvelope[];
  level_progressions?: readonly ApiEnvelope[];
}

/** Parses the API data into a download, as `ApiTask.parseEntity` does item by item. */
export function parseDownload(api: WaniKaniApiData): WaniKaniDownload {
  return {
    user: parseApiUser(api.user),
    assignments: (api.assignments ?? []).map(parseApiAssignment),
    statistics: (api.review_statistics ?? []).map(parseApiReviewStatistic),
    materials: (api.study_materials ?? []).map(parseApiStudyMaterial),
    levels: (api.level_progressions ?? []).map(parseApiLevelProgression),
  };
}

/** Java `(int) d` for a double: truncated, saturating, NaN 0. */
function toJavaInt(d: number): number {
  if (Number.isNaN(d)) return 0;
  if (d >= 2147483647) return 2147483647;
  if (d <= -2147483648) return -2147483648;
  return Math.trunc(d);
}

/** `SubjectSyncDao.tryUpdateReviewStatistic`'s leech score. */
export function importedLeechScore(s: ApiReviewStatistic): number {
  let meaningStreak = Math.pow(s.meaningCurrentStreak, 1.5);
  if (meaningStreak === 0) meaningStreak = 0.5;
  let readingStreak = Math.pow(s.readingCurrentStreak, 1.5);
  if (readingStreak === 0) readingStreak = 0.5;
  return toJavaInt(1000 * Math.max(s.meaningIncorrect / meaningStreak, s.readingIncorrect / readingStreak));
}

/**
 * `WaniKaniImporter.apply` at `now`: returns the summary text. The caller drops any running
 * session (`resetProgress` deletes the session items).
 */
export function applyWaniKaniImport(db: LearnerDb, d: WaniKaniDownload, now: number): string {
  // ProgressStore.resetProgress: the curriculum mode lives outside the progress tables and stays.
  db.progress = emptyProgress(db.progress.curriculum);
  let skipped = 0;
  for (const a of d.assignments) {
    if (!db.table.has(a.subjectId)) {
      skipped++;
      continue;
    }
    updateProgress(db, a.subjectId, {
      assignmentId: a.id,
      srsStage: a.unlockedAt === 0 ? -999 : a.srsStageId,
      availableAt: a.availableAt,
      burnedAt: a.burnedAt,
      passedAt: a.passedAt,
      resurrectedAt: a.resurrectedAt,
      startedAt: a.startedAt,
      unlockedAt: a.unlockedAt,
      assignmentPatched: 0,
    });
  }
  for (const s of d.statistics) {
    if (!db.table.has(s.subjectId)) continue;
    updateProgress(db, s.subjectId, {
      reviewStatisticId: s.id,
      meaningCorrect: s.meaningCorrect,
      meaningIncorrect: s.meaningIncorrect,
      meaningCurrentStreak: s.meaningCurrentStreak,
      meaningMaxStreak: s.meaningMaxStreak,
      readingCorrect: s.readingCorrect,
      readingIncorrect: s.readingIncorrect,
      readingCurrentStreak: s.readingCurrentStreak,
      readingMaxStreak: s.readingMaxStreak,
      percentageCorrect: s.percentageCorrect,
      leechScore: importedLeechScore(s),
      statisticPatched: 0,
    });
  }
  for (const m of d.materials) {
    if (!db.table.has(m.subjectId)) continue;
    updateProgress(db, m.subjectId, {
      studyMaterialId: m.id,
      meaningNote: m.meaningNote,
      meaningSynonyms: serializeSynonymsColumn(m.meaningSynonyms),
      readingNote: m.readingNote,
      studyMaterialPatched: 0,
    });
  }
  for (const p of d.levels) {
    db.progress.levelProgression.set(p.id, {
      id: p.id,
      level: p.level,
      abandonedAt: p.abandonedAt,
      completedAt: p.completedAt,
      createdAt: p.createdAt,
      passedAt: p.passedAt,
      startedAt: p.startedAt,
      unlockedAt: p.unlockedAt,
    });
  }
  db.progress.userLevel = Math.max(1, d.user.level);
  if (db.progress.curriculum === 'JLPT') placeLearnerInDb(db, now);
  afterChange(db, now);

  return `Imported level ${db.progress.userLevel}: ${d.assignments.length - skipped} items, `
    + `${d.statistics.length} review statistics, ${d.materials.length} notes.`
    + (skipped > 0 ? ` Skipped ${skipped} items this app's content doesn't have.` : '');
}
