/**
 * Server data into progress rows: `db/dao/SubjectSyncDao.insertOrUpdateAssignment`,
 * `insertOrUpdateReviewStatistic`, `insertOrUpdateStudyMaterial(m, false)` and
 * `LevelProgressionDao.insertOrUpdate`. A missing row starts from the empty defaults (Java's
 * `tryInsertIdOnly`). Every other column of the row is kept, so a merge of one collection never
 * undoes another.
 */

import { serializeSynonymsColumn, type ApiStudyMaterial } from '../answer/synonyms';
import { importedLeechScore } from '../importer/apply';
import type { ApiAssignment, ApiLevelProgression, ApiReviewStatistic } from '../importer/api';
import { emptySubjectRow, type LevelProgressionRow, type SubjectProgressRow } from '../progressFile/format';

export function mergeAssignment(row: SubjectProgressRow | undefined, a: ApiAssignment): SubjectProgressRow {
  return {
    ...(row ?? emptySubjectRow()),
    assignmentId: a.id,
    srsStage: a.unlockedAt === 0 ? -999 : a.srsStageId,
    availableAt: a.availableAt,
    burnedAt: a.burnedAt,
    passedAt: a.passedAt,
    resurrectedAt: a.resurrectedAt,
    startedAt: a.startedAt,
    unlockedAt: a.unlockedAt,
    assignmentPatched: 0,
  };
}

export function mergeReviewStatistic(row: SubjectProgressRow | undefined, s: ApiReviewStatistic): SubjectProgressRow {
  return {
    ...(row ?? emptySubjectRow()),
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
  };
}

export function mergeStudyMaterial(row: SubjectProgressRow | undefined, m: ApiStudyMaterial): SubjectProgressRow {
  return {
    ...(row ?? emptySubjectRow()),
    studyMaterialId: m.id,
    meaningNote: m.meaningNote,
    meaningSynonyms: serializeSynonymsColumn(m.meaningSynonyms),
    readingNote: m.readingNote,
    studyMaterialPatched: 0,
  };
}

export function levelProgressionRow(p: ApiLevelProgression): LevelProgressionRow {
  return {
    id: p.id,
    level: p.level,
    abandonedAt: p.abandonedAt,
    completedAt: p.completedAt,
    createdAt: p.createdAt,
    passedAt: p.passedAt,
    startedAt: p.startedAt,
    unlockedAt: p.unlockedAt,
  };
}
