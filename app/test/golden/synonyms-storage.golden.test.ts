/**
 * `answers/synonyms-storage.json` (`SynonymStorageGoldenTest`): synonyms and notes through the
 * learner database: the save job, the WaniKani import, a progress-file restore, then export,
 * restore of that export, and the meaning checks with the stored synonyms.
 */

import { CLOSE_ENOUGH_ACTIONS, checkAnswer, type QuestionType } from '../../src/core/answer';
import { parseMeaningSynonyms, parseStudyMaterialJob } from '../../src/core/answer/synonyms';
import { storeStudyMaterialJob } from '../../src/core/answer/studyMaterials';
import { applyWaniKaniImport, parseDownload, type ApiEnvelope } from '../../src/core/importer';
import { TypedError } from '../../src/core/kana';
import {
  contentSubject,
  createLearnerDb,
  exportFromDb,
  progressRow,
  restoreIntoDb,
  updateProgress,
  type LearnerDb,
} from '../../src/core/progression';
import type { SqlValue } from '../../src/core/progressFile/format';
import { loadContentWithExtras } from './content';
import { goldenSuite } from './harness';
import { T0, loadJlptKanji, type RunnerResources } from './scenario/runner';

type Op = { save: string } | { import: ApiEnvelope[] } | { restore: unknown };

interface Input {
  subject: number;
  ops: Op[];
  answers: string[];
}

const COLUMNS = ['meaningNote', 'meaningSynonyms', 'readingNote', 'studyMaterialId', 'studyMaterialPatched', 'unlockedAt'] as const;

let resources: Promise<RunnerResources> | undefined;

function loadResources(): Promise<RunnerResources> {
  resources ??= loadContentWithExtras().then((content) => ({ content, jlptKanji: loadJlptKanji() }));
  return resources;
}

/** An empty WaniKani-order progress file. */
const EMPTY_FILE = JSON.stringify({
  format: 'kanjikodama-progress', version: 1, exportedAt: T0, userLevel: 1, levelProgression: [], subjects: [],
  curriculum: 'WANIKANI', probation: [], jumps: [],
});

/** The error type name the fixtures record (full or simple). */
function errorName(e: unknown, simple: boolean): string {
  if (e instanceof TypedError) return simple ? e.errorType.replace(/^.*\./, '') : e.errorType;
  if (e instanceof Error && 'errorType' in e && typeof e.errorType === 'string') {
    return simple ? e.errorType.replace(/^.*\./, '') : e.errorType;
  }
  throw e;
}

/** `SELECT col, typeof(col)`. */
function sqlTyped(value: SqlValue): { type: string; value: SqlValue } {
  if (value === null) return { type: 'null', value: null };
  if (typeof value === 'string') return { type: 'text', value };
  return { type: Number.isInteger(value) ? 'integer' : 'real', value };
}

function row(db: LearnerDb, id: number): Record<string, unknown> {
  const r = progressRow(db, id);
  return Object.fromEntries(COLUMNS.map((c) => [c, sqlTyped(r[c])]));
}

function storedSynonyms(db: LearnerDb, id: number): unknown {
  try {
    return parseMeaningSynonyms(progressRow(db, id).meaningSynonyms as string | null);
  } catch (e) {
    return { error: errorName(e, true) };
  }
}

function meaningType(object: string): QuestionType {
  switch (object) {
    case 'radical': return 'WANIKANI_RADICAL_NAME';
    case 'kanji': return 'WANIKANI_KANJI_MEANING';
    case 'kana_vocabulary': return 'WANIKANI_KANA_VOCAB_MEANING';
    default: return 'WANIKANI_VOCAB_MEANING';
  }
}

function runOp(db: LearnerDb, op: Op): Record<string, unknown> {
  try {
    if ('save' in op) {
      const job = parseStudyMaterialJob(op.save);
      updateProgress(db, job.subjectId, storeStudyMaterialJob(job));
      return { ok: true };
    }
    if ('import' in op) {
      const download = parseDownload({
        user: { level: 1, username: 'golden-user', max_level_granted_by_subscription: 60 },
        study_materials: op.import,
      });
      return { ok: true, summary: applyWaniKaniImport(db, download, T0) };
    }
    restoreIntoDb(db, JSON.stringify(op.restore), T0);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorName(e, false) };
  }
}

goldenSuite<Input, unknown>('answers/synonyms-storage.json', async (input) => {
  const res = await loadResources();
  // The base reset (seed 1): fresh database, clock at T0, the empty WaniKani file restored.
  const db = createLearnerDb(res.content, res.jlptKanji);
  restoreIntoDb(db, EMPTY_FILE, T0);
  const id = input.subject;
  const ops = input.ops.map((op) => runOp(db, op));

  const stored = row(db, id);
  const synonyms = storedSynonyms(db, id);
  const exportText = exportFromDb(db, T0);
  const exported = (JSON.parse(exportText) as { subjects: { id: number }[] }).subjects.find((s) => s.id === id) ?? null;
  restoreIntoDb(db, exportText, T0);
  const restored = row(db, id);
  const again = exportFromDb(db, T0);

  const subject = contentSubject(db, id);
  const q = meaningType(subject.object);
  const checks: Record<string, Record<string, unknown>> = {};
  for (const answer of input.answers) {
    const out: Record<string, unknown> = {};
    for (const action of CLOSE_ENOUGH_ACTIONS) {
      try {
        const meaningSynonyms = parseMeaningSynonyms(progressRow(db, id).meaningSynonyms as string | null);
        const v = checkAnswer(q, subject, answer, { closeEnoughAction: action, requireOnInKatakana: false, meaningSynonyms });
        out[action] = { ok: v.ok, retry: v.retry, nearMatch: v.nearMatch, givenAnswer: v.givenAnswer, matchedAnswer: v.matchedAnswer };
      } catch (e) {
        out[action] = { error: errorName(e, true) };
      }
    }
    checks[answer] = out;
  }
  return {
    ops,
    stored,
    storedSynonyms: synonyms,
    exported,
    restored,
    restoredSynonyms: storedSynonyms(db, id),
    exportIdentical: exportText === again,
    questionType: q,
    checks,
  };
}, { needsContent: true });
