/**
 * Progress files for the tests, in the app's own format (`core/progressFile`: kanjikodama-progress v1),
 * so a test can start from a known state through the real Restore flow. Subject ids come from the
 * content DB at run time.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TestInfo } from '@playwright/test';
import { subjectsAt, type Subject } from './content';

const HOUR = 3_600_000;

interface Row { id: number; [k: string]: number | string | null }

function row(s: Subject, stage: number, now: number, availableAt: number | null, passed = false): Row {
  return {
    id: s.id,
    availableAt,
    burnedAt: null,
    passedAt: passed ? now - 48 * HOUR : null,
    resurrectedAt: null,
    startedAt: now - 72 * HOUR,
    unlockedAt: now - 96 * HOUR,
    srsStage: stage,
    meaningCorrect: stage,
    meaningIncorrect: 0,
    readingCorrect: s.object === 'radical' ? 0 : stage,
    readingIncorrect: 0,
    passed: passed ? 1 : 0,
  };
}

export interface ReviewSeed {
  /** Level-1 radicals due now (stage 1, Apprentice 1). */
  radicals?: number;
  /** Level-1 kanji due now (stage 1); the radicals they need are passed. */
  kanji?: number;
  /** Level-1 vocabulary due now. */
  vocabulary?: number;
  curriculum?: 'WANIKANI' | 'JLPT';
}

export interface SeedFile {
  path: string;
  /** Reviews the dashboard should show. */
  due: number;
  /** Subjects in the file ("N items with progress"). */
  items: number;
  level: number;
}

/**
 * A level-1 learner with some reviews due now: all level-1 radicals passed except the first
 * `radicals` ones, which are due; `kanji` kanji due; nothing else started.
 */
export async function writeReviewSeed(info: TestInfo, seed: ReviewSeed, now = Date.now()): Promise<SeedFile> {
  const radicals = await subjectsAt(1, 'radical');
  const kanji = await subjectsAt(1, 'kanji');
  const vocab = await subjectsAt(1, 'vocabulary');
  const nRad = seed.radicals ?? 0;
  const nKanji = seed.kanji ?? 0;
  const nVocab = seed.vocabulary ?? 0;
  const due = now - 60_000;
  const rows: Row[] = [];
  radicals.forEach((s, i) => rows.push(i < nRad ? row(s, 1, now, due) : row(s, 5, now, now + 200 * HOUR, true)));
  kanji.slice(0, nKanji).forEach((s) => rows.push(row(s, 1, now, due)));
  vocab.slice(0, nVocab).forEach((s) => rows.push(row(s, 1, now, due)));
  rows.sort((a, b) => a.id - b.id);
  const file = {
    format: 'kanjikodama-progress',
    version: 1,
    exportedAt: now - HOUR,
    userLevel: 1,
    levelProgression: [],
    subjects: rows,
    curriculum: seed.curriculum ?? 'WANIKANI',
  };
  const path = info.outputPath(`seed-${nRad}-${nKanji}-${nVocab}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file, null, 1));
  return { path, due: nRad + nKanji + nVocab, items: rows.length, level: 1 };
}

export function tmpFile(info: TestInfo, name: string, text: string): string {
  const path = join(info.outputDir, name);
  mkdirSync(info.outputDir, { recursive: true });
  writeFileSync(path, text);
  return path;
}
