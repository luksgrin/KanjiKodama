/**
 * Progress files written by the TypeScript core, for the TS export → Java restore → Java export
 * round trip (`progress/ts-roundtrip.json`, `ScenarioGoldenTest#progressTsExports`). Each file is
 * `exportFromDb` of a state the TS core reached; `progress-ts-inputs.test.ts` writes them to
 * `progress/ts-export/` (committed inputs; the retired Java app's `durtles/golden/run.sh` pushed them to the device) and
 * checks that the committed files are still what the core produces.
 *
 * Every file is settled: restoring it with the TS core (which, like `ProgressStore.restore`,
 * adopts the curriculum and recomputes unlocks) and exporting at its `exportedAt` gives the same
 * bytes, so any difference in Java's re-export is a difference between the two apps.
 */

import { formJobData, parseStudyMaterialJob } from '../../src/core/answer/synonyms';
import { storeStudyMaterialJob } from '../../src/core/answer/studyMaterials';
import { fastTravel, fastTravelStatus } from '../../src/core/fastTravel';
import { applyWaniKaniImport, parseDownload, type ApiEnvelope } from '../../src/core/importer';
import {
  createLearnerDb,
  exportFromDb,
  progressRow,
  reportLocal,
  restoreIntoDb,
  sqlAtMost,
  updateProgress,
  type LearnerDb,
} from '../../src/core/progression';
import { HOUR } from '../../src/core/time';
import { T0, readGoldenInput, type RunnerResources } from './scenario/runner';
import { select } from './scenario/select';

export interface TsProgressInput {
  /** File name under `progress/ts-export/`. */
  name: string;
  text: string;
}

export const TS_EXPORT_DIR = 'progress/ts-export';

/** `ScenarioRunner.emptyFile(mode)`. */
function emptyFile(mode: 'WANIKANI' | 'JLPT', at: number): string {
  return JSON.stringify({
    format: 'kanjikodama-progress', version: 1, exportedAt: at, userLevel: 1, levelProgression: [], subjects: [],
    curriculum: mode, probation: [], jumps: [],
  });
}

/** The Java base state: a fresh database with the empty WaniKani file restored at `at`. */
function freshDb(res: RunnerResources, at: number): LearnerDb {
  const db = createLearnerDb(res.content, res.jlptKanji);
  restoreIntoDb(db, emptyFile('WANIKANI', at), at);
  return db;
}

/** The study-materials screen's save (`SaveStudyMaterialJob.runLocal`). */
function saveNotes(db: LearnerDb, id: number, meaningNote: string, readingNote: string, synonyms: string[]): void {
  const job = parseStudyMaterialJob(formJobData(id, meaningNote, readingNote, synonyms));
  updateProgress(db, id, storeStudyMaterialJob(job));
}

/** Earliest due time of the visible reviews after `now`, or null. */
function nextDue(db: LearnerDb, now: number): number | null {
  let best: number | null = null;
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id)!;
    if (t.hiddenAt !== 0 || t.level > 60) continue;
    const a = progressRow(db, s.id).availableAt;
    if (typeof a === 'number' && a > now && (best === null || a < best)) best = a;
  }
  return best;
}

/**
 * Reviews everything due and takes every lesson, round after round (the clock jumps to the next due
 * time), until the level went up and `extraRounds` more rounds ran. Some answers are wrong.
 */
function grind(db: LearnerDb, now: number, extraRounds: number): number {
  const startLevel = db.progress.userLevel;
  let after = -1;
  let n = 0;
  for (let round = 0; round < 500; round++) {
    for (const id of select(db, now, null, true)) {
      reportLocal(db, { subjectId: id, type: 'LESSON', meaningIncorrect: 0, readingIncorrect: 0, timestamp: now }, now);
    }
    for (const id of select(db, now, null, false)) {
      // Every 7th answer is wrong (meaning once; every 14th also the reading twice).
      const wrong = n % 7 === 3;
      const object = db.content.byId.get(id)!.object;
      const reading = wrong && n % 14 === 3 && object !== 'radical' && object !== 'kana_vocabulary' ? 2 : 0;
      reportLocal(db, { subjectId: id, type: 'REVIEW', meaningIncorrect: wrong ? 1 : 0, readingIncorrect: reading, timestamp: now }, now);
      n++;
      now += 7_000 + (n % 5) * 1_111;
    }
    if (db.progress.userLevel > startLevel && after < 0) after = round;
    if (after >= 0 && round - after >= extraRounds) return now;
    const due = nextDue(db, now);
    if (due === null) throw new Error('nothing left to review');
    now = Math.max(now, due) + 1_234;
  }
  throw new Error(`no level-up after 500 rounds (level ${db.progress.userLevel})`);
}

/** Every due review answered right, 9 s apart. */
function reviewRound(db: LearnerDb, now: number): number {
  for (const id of select(db, now, null, false)) {
    reportLocal(db, { subjectId: id, type: 'REVIEW', meaningIncorrect: 0, readingIncorrect: 0, timestamp: now }, now);
    now += 9_000;
  }
  return now;
}

/** The owner's export, then a level-up, a fast-travel jump with probation, probation reviews and notes. */
function realAfterSteps(res: RunnerResources): string {
  const real = readGoldenInput('progress/android-export.json');
  let now = (JSON.parse(real) as { exportedAt: number }).exportedAt;
  const db = createLearnerDb(res.content, res.jlptKanji);
  restoreIntoDb(db, real, now);
  now = grind(db, now, 2);
  // Past the 72 h fast-travel cooldown, then one more round of reviews.
  now += 80 * HOUR;
  now = reviewRound(db, now);
  const status = fastTravelStatus(db, now);
  if (status.blocked !== null) throw new Error(`fast travel blocked: ${status.blocked}`);
  fastTravel(db, Math.min(status.level + 2, status.options.at(-1)!.target), now);
  // The first probation slot is due at once: one answered right (leaves probation), one wrong (back to lessons).
  const due = [...db.progress.probation.keys()].filter((id) => sqlAtMost(progressRow(db, id).availableAt, now)).sort((a, b) => a - b);
  if (due.length < 2) throw new Error('expected two due probation items');
  now += 60_000;
  reportLocal(db, { subjectId: due[0]!, type: 'REVIEW', meaningIncorrect: 0, readingIncorrect: 0, timestamp: now }, now);
  reportLocal(db, { subjectId: due[1]!, type: 'REVIEW', meaningIncorrect: 1, readingIncorrect: 1, timestamp: now }, now);
  // Notes and synonyms on a started kanji, a probation item and a locked subject.
  const started = select(db, now + 400 * 24 * HOUR, { object: 'kanji', limit: 1 }, false)[0]!;
  const probationId = [...db.progress.probation.keys()].sort((a, b) => a - b).at(-1)!;
  const locked = db.content.subjects.find((s) => s.object === 'vocabulary' && progressRow(db, s.id).unlockedAt === 0)!.id;
  saveNotes(db, started, 'メモ：「日」と似ている 🐉', '  leading and trailing  ', ['sun', ' day ', 'お日様', '']);
  saveNotes(db, probationId, '', '', []);
  saveNotes(db, locked, 'line one\nline two\ttab', 'quote " backslash \\ slash / </script>', ['a/b', 'été', '\u{1F37A}']);
  now += HOUR + 1;
  return exportFromDb(db, now);
}

/** A WaniKani import with large, zero and far-future values, then notes with edge-case text and a few reviews. */
function importedWaniKani(res: RunnerResources): { text: string; db: LearnerDb; now: number } {
  let now = T0;
  const db = freshDb(res, now);
  const level1 = db.content.subjects.filter((s) => s.level === 1 && s.hiddenAt === 0).map((s) => s.id).slice(0, 6);
  const [a, b, c, d, e, f] = level1 as [number, number, number, number, number, number];
  const assignment = (id: number, subject: number, stage: number, data: Record<string, unknown>): ApiEnvelope => ({
    id, object: 'assignment', data: { subject_id: subject, srs_stage: stage, ...data },
  });
  const stats = (id: number, subject: number, data: Record<string, unknown>): ApiEnvelope => ({
    id, object: 'review_statistic', data: { subject_id: subject, ...data },
  });
  const download = parseDownload({
    user: { level: 2, username: 'golden-user', max_level_granted_by_subscription: 60 },
    assignments: [
      assignment(9_007_199_254_740_000, a, 5, {
        unlocked_at: ('2025-12-01T00:00:00.000000Z'), started_at: ('2025-12-01T01:02:03.456789Z'),
        passed_at: ('2025-12-10T00:00:00Z'), available_at: ('2026-01-06T10:00:00.000Z'),
      }),
      assignment(1, b, 9, {
        unlocked_at: ('2025-11-01T00:00:00Z'), started_at: ('2025-11-01T00:00:00Z'),
        passed_at: ('2025-11-05T00:00:00Z'), burned_at: ('2025-12-30T23:59:59.999Z'),
      }),
      assignment(2_147_483_648, c, 1, {
        unlocked_at: ('2025-12-31T23:59:59+09:00'), started_at: ('2026-01-01T00:00:00-05:30'),
        available_at: ('2100-01-01T00:00:00Z'),
      }),
      assignment(3, d, 0, { unlocked_at: ('2026-01-04T00:00:00Z') }),
    ],
    review_statistics: [
      stats(4_000_000_000_001, a, {
        meaning_correct: 2_147_483_647, meaning_incorrect: 0, meaning_max_streak: 2_147_483_647, meaning_current_streak: 1,
        reading_correct: 3, reading_incorrect: 1, reading_max_streak: 3, reading_current_streak: 0, percentage_correct: 99,
      }),
      stats(5, b, {
        meaning_correct: 0, meaning_incorrect: 7, meaning_max_streak: 0, meaning_current_streak: 0,
        reading_correct: 0, reading_incorrect: 0, reading_max_streak: 0, reading_current_streak: 0, percentage_correct: 0,
      }),
      // Statistics without an assignment: saved for a locked subject.
      stats(6, e, {
        meaning_correct: 1, meaning_incorrect: 1, meaning_max_streak: 1, meaning_current_streak: 1,
        reading_correct: 0, reading_incorrect: 0, reading_max_streak: 0, reading_current_streak: 0, percentage_correct: 50,
      }),
    ],
    study_materials: [
      { id: 7_777_777_777, object: 'study_material', data: { subject_id: c, meaning_note: '', reading_note: null, meaning_synonyms: [' padded ', '', 'x'] } },
      { id: 0, object: 'study_material', data: { subject_id: f, meaning_note: 'note on a locked subject', reading_note: '', meaning_synonyms: [] } },
    ],
    level_progressions: [
      { id: 12_345_678_901, object: 'level_progression', data: { level: 1, created_at: ('2025-11-01T00:00:00Z'), unlocked_at: ('2025-11-01T00:00:00Z'), started_at: ('2025-11-01T00:00:00Z'), passed_at: null, completed_at: null, abandoned_at: null } },
      { id: 2, object: 'level_progression', data: { level: 2, created_at: ('2025-12-20T00:00:00Z'), unlocked_at: null, started_at: null, passed_at: null, completed_at: null, abandoned_at: ('2026-01-01T00:00:00Z') } },
    ],
  });
  applyWaniKaniImport(db, download, now);
  // Notes typed on the study-materials screen: non-ASCII, control characters, separators, whitespace only.
  saveNotes(db, a, ' line separators\u0001\u001f\u007f', ' \t \n ', ['いち', 'one, two', 'say "one"', 'back\\slash', '﻿bom', 'zero​width']);
  saveNotes(db, d, '', '読み：いち', []);
  // Lessons, then reviews a day later.
  for (const id of select(db, now, null, true)) {
    reportLocal(db, { subjectId: id, type: 'LESSON', meaningIncorrect: 0, readingIncorrect: 0, timestamp: now }, now);
  }
  now += 30 * HOUR + 17;
  for (const [i, id] of select(db, now, null, false).entries()) {
    reportLocal(db, { subjectId: id, type: 'REVIEW', meaningIncorrect: i % 2, readingIncorrect: 0, timestamp: now - 1000 * i }, now);
  }
  return { text: exportFromDb(db, now), db, now };
}

/**
 * A hand-edited file restored by the TS core and exported again: values only a hand-edited file can
 * hold (text in numeric columns, non-integral numbers, booleans, negative and huge numbers, an
 * extra-kanji subject, two level rows for one level), as the TS port stores them (SQLite affinity).
 * No NULLs: the export leaves NULL columns out and a restore resets missing ones to 0, so a file
 * with them would not be settled (the TS export of the restored state is the same either way).
 */
function handEdited(res: RunnerResources): string {
  const now = T0 + 5 * 24 * HOUR;
  const db = freshDb(res, now);
  const kanji = db.content.subjects.filter((s) => s.object === 'kanji' && s.level === 1).map((s) => s.id);
  const radicals = db.content.subjects.filter((s) => s.object === 'radical' && s.level === 1).map((s) => s.id);
  const extra = db.content.subjects.find((s) => s.id >= 100_000);
  const vocab = db.content.subjects.find((s) => s.object === 'vocabulary' && s.level === 3)!.id;
  const subjects: Record<string, unknown>[] = [
    { id: radicals[0], unlockedAt: T0, startedAt: T0 + 1, availableAt: T0 + 4 * HOUR, srsStage: 1, percentageCorrect: 33.5,
      leechScore: -7, levelProgressScore: 9_007_199_254_740_991, assignmentId: -1, studyMaterialId: 0 },
    { id: radicals[1], unlockedAt: T0, startedAt: '1767604620001', availableAt: ' 1767620000000 ', srsStage: '2',
      meaningCorrect: 1.0, readingCorrect: 2.5e-3 },
    { id: radicals[2], unlockedAt: T0, startedAt: T0, availableAt: 1.5e12, srsStage: 3, passed: true, resurrected: false,
      meaningNote: 12, readingNote: 0.1, meaningSynonyms: '["typed", "by hand"]', reviewStatisticId: 'not a number' },
    { id: kanji[0], unlockedAt: T0, meaningIncorrect: 1e15, readingIncorrect: -2_147_483_649, percentageCorrect: -0.0 },
    { id: vocab, meaningNote: '   ', readingNote: '\u0000nul', meaningSynonyms: 'papa, daddy' },
    ...(extra ? [{ id: extra.id, unlockedAt: T0, startedAt: T0, availableAt: T0 + 2 * HOUR, srsStage: 1, meaningSynonyms: '[]' }] : []),
  ];
  const file = {
    format: 'kanjikodama-progress', version: 1, exportedAt: now, userLevel: 1,
    levelProgression: [
      { id: 3, level: 1, createdAt: T0, unlockedAt: T0, startedAt: T0 },
      { id: 4, level: 1, createdAt: T0 + 1, abandonedAt: -1, completedAt: '0', passedAt: 4_102_444_800_000 },
    ],
    subjects, curriculum: 'WANIKANI', probation: [], jumps: [[T0, 3, 1], [T0, 1, 2], [-1, 0, 0]],
  };
  restoreIntoDb(db, JSON.stringify(file), now);
  return exportFromDb(db, now);
}

/** A fresh JLPT-order learner: nothing but the curriculum and level 1. */
function emptyJlpt(res: RunnerResources): string {
  const now = T0;
  const db = freshDb(res, now);
  restoreIntoDb(db, emptyFile('JLPT', now), now);
  return exportFromDb(db, now);
}

/** All inputs, in file order. */
export function buildTsProgressInputs(res: RunnerResources): TsProgressInput[] {
  const imported = importedWaniKani(res);
  // The same state under the format tag of files saved before the rename.
  const legacy = imported.text.replace('"format": "kanjikodama-progress"', '"format": "mojimori-progress"');
  if (legacy === imported.text) throw new Error('format tag not found');
  return [
    { name: '01-real-after-steps.json', text: realAfterSteps(res) },
    { name: '02-imported-wanikani.json', text: imported.text },
    { name: '03-legacy-format.json', text: legacy },
    { name: '04-hand-edited.json', text: handEdited(res) },
    { name: '05-empty-jlpt.json', text: emptyJlpt(res) },
  ];
}
