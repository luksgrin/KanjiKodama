/** Small synthetic content and DB helpers for the storage tests (no private content DB needed). */
import 'fake-indexeddb/auto';
import { makeContent, type Content, type ContentSubject, type SubjectObject } from '../../src/core/content';
import { KkDb, PROGRESS_TABLES } from '../../src/storage/db';

export function subject(id: number, object: SubjectObject, level: number, componentSubjectIds: number[] = [],
  characters: string | null = null): ContentSubject {
  return {
    id, object, hiddenAt: 0, lessonPosition: id, srsSystemId: 1, level, characters, slug: null,
    meanings: [], auxiliaryMeanings: [], readings: [], componentSubjectIds, amalgamationSubjectIds: [],
    visuallySimilarSubjectIds: [], partsOfSpeech: [], frequency: 0, joyoGrade: 0, jlptLevel: 0,
  };
}

/** Level 1: radicals 1, 2; kanji 10 (1, 2), 11 (1); vocabulary 100 (10). Level 2: radical 3, kanji 20 (3). */
export function smallSubjects(): ContentSubject[] {
  return [
    subject(1, 'radical', 1), subject(2, 'radical', 1), subject(10, 'kanji', 1, [1, 2], '一'),
    subject(11, 'kanji', 1, [1], '二'), subject(100, 'vocabulary', 1, [10], '一つ'),
    subject(3, 'radical', 2), subject(20, 'kanji', 2, [3], '三'),
  ];
}

export function smallContent(subjects: ContentSubject[] = smallSubjects()): Content {
  return makeContent(subjects, []);
}

export const NO_JLPT: ReadonlyMap<string, number> = new Map();

export function freshName(): string {
  return `kk-test-${Math.random().toString(36).slice(2)}`;
}

export async function openDb(name = freshName()): Promise<KkDb> {
  const kk = new KkDb(name);
  await kk.open();
  return kk;
}

/** Every progress table's rows plus meta, for "unchanged" checks. */
export async function dump(kk: KkDb): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of [...PROGRESS_TABLES, 'tasks', 'settings', 'meta']) out[t] = await kk.table(t).toArray();
  return out;
}

/** A progress file (only the given parts). */
export function progressFile(parts: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 'kanjikodama-progress', version: 1, exportedAt: 1760659200000, userLevel: 1, curriculum: 'WANIKANI',
    levelProgression: [], subjects: [], probation: [], jumps: [], ...parts,
  }, null, 1);
}
