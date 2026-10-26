import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

import { updateProgress } from '../../src/core/progression';
import { KkDb, lastSavedStore } from '../../src/storage/db';
import { ensurePersistence, getPersistenceInfo } from '../../src/storage/persistence';
import { loadLearnerDb, saveLearnerDb, saveSubjects } from '../../src/storage/progressRepo';
import { importProgress } from '../../src/progress/importFile';
import { NO_JLPT, freshName, openDb, progressFile, smallContent, smallSubjects, subject } from './helpers';

describe('progress repository', () => {
  it('saves and loads a LearnerDb', async () => {
    const kk = await openDb();
    const content = smallContent();
    const ldb = await loadLearnerDb(kk, content, NO_JLPT);
    expect(ldb.progress.subjects.size).toBe(0);
    updateProgress(ldb, 10, { srsStage: 5, passedAt: 1000, meaningNote: 'note', percentageCorrect: 87.5 });
    ldb.progress.userLevel = 2;
    ldb.progress.probation.set(10, 1234);
    ldb.progress.jumps.push({ at: 5, fromLevel: 1, toLevel: 2 }, { at: 5, fromLevel: 2, toLevel: 3 }, { at: 1, fromLevel: 3, toLevel: 4 });
    ldb.progress.levelProgression.set(1, { id: 1, level: 1, abandonedAt: 0, completedAt: 0, createdAt: 1, passedAt: 2, startedAt: 1, unlockedAt: 1 });
    ldb.state.set('level_test', 'DONE');
    ldb.levelTest.set(11, { round: 2, known: 1 });
    await saveLearnerDb(kk, ldb);

    const again = await loadLearnerDb(new KkDb(kk.name), content, NO_JLPT);
    expect(again.progress).toEqual(ldb.progress);
    expect(again.progress.jumps).toEqual(ldb.progress.jumps); // duplicates and insertion order kept
    expect(again.state.get('level_test')).toBe('DONE');
    expect(again.levelTest.get(11)).toEqual({ round: 2, known: 1 });
    expect(again.ordering).toBe('WANIKANI');
  });

  it('saveSubjects writes only the given rows', async () => {
    const kk = await openDb();
    const ldb = await loadLearnerDb(kk, smallContent(), NO_JLPT);
    updateProgress(ldb, 1, { srsStage: 1 });
    updateProgress(ldb, 2, { srsStage: 2 });
    await saveSubjects(kk, ldb, [1]);
    expect(await kk.subjects.toCollection().primaryKeys()).toEqual([1]);
  });

  it('a content update leaves progress untouched (synthetic content)', async () => {
    const name = freshName();
    const kk = await openDb(name);
    const v1 = smallContent();
    await importProgress(kk, progressFile({
      userLevel: 1,
      subjects: [
        { id: 1, srsStage: 5, unlockedAt: 10, startedAt: 11, passedAt: 12, meaningCorrect: 3 },
        { id: 2, srsStage: 6, unlockedAt: 10, startedAt: 11, passedAt: 12, readingNote: 'mine' },
        { id: 11, srsStage: 2, unlockedAt: 10, startedAt: 11 },
      ],
      probation: [[11, 99]],
    }), { content: v1, jlptKanji: NO_JLPT, now: 1000 });
    const before = new Map((await kk.subjects.toArray()).map((r) => [r.id, r]));
    kk.close();

    // v2: subject 11 removed, subject 12 added.
    const v2 = smallContent([...smallSubjects().filter((s) => s.id !== 11), subject(12, 'kanji', 1, [1], '十')]);
    const kk2 = new KkDb(name);
    const ldb = await loadLearnerDb(kk2, v2, NO_JLPT);
    for (const [id, row] of before) {
      if (id === 11) continue;
      const { id: _id, ...progress } = row;
      expect(ldb.progress.subjects.get(id)).toEqual(progress);
    }
    expect(ldb.progress.subjects.has(11)).toBe(false);
    expect(ldb.progress.subjects.has(12)).toBe(false);
    await saveLearnerDb(kk2, ldb);
    // Stored rows are unchanged, including the removed subject's row and probation.
    const after = new Map((await kk2.subjects.toArray()).map((r) => [r.id, r]));
    expect(after).toEqual(before);
    expect(await kk2.probation.get(11)).toEqual({ id: 11, since: 99 });
  });
});

describe('persistence', () => {
  const api = (persisted: boolean, grant: boolean, fail = false) => ({
    calls: [] as string[],
    async persisted() { this.calls.push('persisted'); if (fail) throw new Error('nope'); return persisted; },
    async persist() { this.calls.push('persist'); return grant; },
  });

  it('records an existing grant without asking', async () => {
    const kk = await openDb();
    const a = api(true, false);
    expect(await ensurePersistence(a, kk, 5)).toEqual({ persisted: true, requested: false, checkedAt: 5 });
    expect(a.calls).toEqual(['persisted']);
    expect(await getPersistenceInfo(kk)).toEqual({ persisted: true, requested: false, checkedAt: 5 });
  });

  it('asks when not persisted and records the answer', async () => {
    const kk = await openDb();
    expect(await ensurePersistence(api(false, true), kk, 6)).toEqual({ persisted: true, requested: true, checkedAt: 6 });
    expect(await ensurePersistence(api(false, false), kk, 7)).toEqual({ persisted: false, requested: true, checkedAt: 7 });
    expect((await getPersistenceInfo(kk))?.checkedAt).toBe(7);
  });

  it('records a platform error', async () => {
    const kk = await openDb();
    expect(await ensurePersistence(api(false, true, true), kk, 8)).toEqual({ persisted: false, requested: true, checkedAt: 8, error: 'nope' });
  });
});

describe('lastSavedStore', () => {
  it('keeps lastSavedAt in meta', async () => {
    const kk = await openDb();
    const store = lastSavedStore(kk);
    expect(await store.getLastSavedAt()).toBeNull();
    await store.setLastSavedAt(42);
    expect(await store.getLastSavedAt()).toBe(42);
    expect(await kk.meta.get('lastSavedAt')).toEqual({ key: 'lastSavedAt', value: 42 });
  });
});
