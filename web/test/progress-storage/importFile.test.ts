import 'fake-indexeddb/auto';
import type { DBCore, Middleware } from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';

import { KkDb } from '../../src/storage/db';
import { ProgressImportError, importProgress, previewImport } from '../../src/progress/importFile';
import { exportProgressFile } from '../../src/progress/exportFile';
import { NO_JLPT, dump, freshName, openDb, progressFile, smallContent } from './helpers';

const content = smallContent();
const ctx = { content, jlptKanji: NO_JLPT, now: 5000 };

/** A database with some progress, a session and level test state, to check "unchanged". */
async function seeded(name = freshName()): Promise<KkDb> {
  const kk = await openDb(name);
  await importProgress(kk, progressFile({
    userLevel: 1,
    subjects: [
      { id: 1, srsStage: 5, unlockedAt: 10, startedAt: 11, passedAt: 12, meaningCorrect: 3 },
      { id: 2, srsStage: 1, unlockedAt: 10, startedAt: 11, meaningNote: 'a note' },
    ],
    probation: [[2, 77]],
    jumps: [[3, 1, 2]],
  }), ctx);
  await kk.session.put({ subjectId: 1, question: 'meaning' });
  await kk.levelTest.put({ id: 10, round: 1, known: 1 });
  await kk.state.put({ key: 'mm_state.level_test', value: 'DONE' });
  return kk;
}

describe('previewImport', () => {
  it('summarizes a valid file like the Android app', () => {
    const text = progressFile({ userLevel: 3, subjects: [{ id: 1 }, { id: 2 }] });
    expect(previewImport(text, 'UTC').summary).toBe('Saved Oct 17, 2025 12:00 AM, WaniKani order, level 3, 2 items with progress.');
    expect(previewImport(progressFile({ format: 'mojimori-progress', curriculum: 'JLPT' }), 'UTC').summary)
      .toBe('Saved Oct 17, 2025 12:00 AM, JLPT order, level 1, 0 items with progress.');
  });

  it('accepts unknown keys', () => {
    expect(() => previewImport(progressFile({ somethingNew: [1, 2], subjects: [{ id: 1, futureField: 'x' }] }), 'UTC')).not.toThrow();
  });

  it.each([
    ['not JSON', 'my progress', /not a valid KanjiKodama progress file/],
    ['wrong format', progressFile({ format: 'other' }), /^This is not a KanjiKodama progress file\.$/],
    ['newer version', progressFile({ version: 2 }), /newer KanjiKodama/],
    ['no subjects', progressFile({ subjects: null }), /not a valid KanjiKodama progress file/],
  ])('rejects %s', (_label, text, message) => {
    expect(() => previewImport(text, 'UTC')).toThrow(ProgressImportError);
    expect(() => previewImport(text, 'UTC')).toThrow(message);
  });
});

describe('importProgress', () => {
  let kk: KkDb;
  beforeEach(async () => {
    kk = await seeded();
  });

  it('replaces all progress, keeps level test state, drops the session, recomputes unlocks', async () => {
    const result = await importProgress(kk, progressFile({
      userLevel: 0, // at least 1
      subjects: [
        { id: 10, srsStage: 2, unlockedAt: 100, startedAt: 101, meaningSynonyms: 'x' },
        { id: 99999, srsStage: 9 }, // unknown id: ignored
      ],
      probation: [[10, 5], [99999, 6]],
      unknownKey: true,
    }), ctx);
    expect(result.userLevel).toBe(1);
    expect(result.message).toBe('Progress restored, level 1.');
    const subjects = new Map((await kk.subjects.toArray()).map((r) => [r.id, r]));
    expect(subjects.has(99999)).toBe(false);
    expect(subjects.get(10)).toMatchObject({ srsStage: 2, unlockedAt: 100, startedAt: 101, meaningSynonyms: 'x' });
    // Radicals 1 and 2 (no components) are unlocked again by LocalProgression.update at `now`; the old progress is gone.
    expect(subjects.get(1)).toMatchObject({ unlockedAt: 5000, srsStage: 0, meaningCorrect: 0, passedAt: 0 });
    expect(subjects.get(2)).toMatchObject({ unlockedAt: 5000, meaningNote: null });
    expect(await kk.probation.toArray()).toEqual([{ id: 10, since: 5 }]);
    expect(await kk.jumps.count()).toBe(0);
    expect((await kk.levelProgression.toArray()).map((r) => r.level)).toEqual([1]);
    expect(await kk.session.count()).toBe(0);
    expect(await kk.levelTest.get(10)).toEqual({ id: 10, round: 1, known: 1 });
    expect((await kk.state.get('mm_state.level_test'))?.value).toBe('DONE');
    expect((await kk.state.get('userLevel'))?.value).toBe(1);
  });

  it.each([
    ['not JSON', '{"format":'],
    ['wrong format', progressFile({ format: 'other' })],
    ['newer version', progressFile({ version: 9 })],
    ['subjects not a list', progressFile({ subjects: {} })],
  ])('leaves the database untouched for a rejected file (%s)', async (_label, text) => {
    const before = await dump(kk);
    await expect(importProgress(kk, text, ctx)).rejects.toThrow(ProgressImportError);
    expect(await dump(kk)).toEqual(before);
  });

  it('leaves the database untouched when the restore fails inside the transaction', async () => {
    // Passes `describe`, then fails in the restore (Room's NOT NULL on srsStage), after the reads.
    const text = progressFile({ subjects: [{ id: 10, unlockedAt: 1 }, { id: 11, srsStage: null }] });
    expect(() => previewImport(text, 'UTC')).not.toThrow();
    const before = await dump(kk);
    await expect(importProgress(kk, text, ctx)).rejects.toThrow(/NOT NULL constraint failed: subject.srsStage/);
    expect(await dump(kk)).toEqual(before);
  });

  it('leaves the database untouched when a write fails mid-transaction', async () => {
    const before = await dump(kk);
    kk.close();
    // Same database, with a middleware that fails writes to `state` (after subjects were rewritten).
    let subjectWrites = 0;
    const failing: Middleware<DBCore> = {
      stack: 'dbcore',
      name: 'fail-state-writes',
      create: (down) => ({
        ...down,
        table: (tableName) => {
          const table = down.table(tableName);
          return {
            ...table,
            mutate: (req) => {
              if (tableName === 'subjects') subjectWrites++;
              if (tableName === 'state') return Promise.reject(new Error('forced failure'));
              return table.mutate(req);
            },
          };
        },
      }),
    };
    const broken = new KkDb(kk.name);
    broken.use(failing);
    await expect(importProgress(broken, progressFile({ subjects: [{ id: 10, unlockedAt: 1, srsStage: 1 }] }), ctx))
      .rejects.toThrow('forced failure');
    expect(subjectWrites).toBeGreaterThan(0);
    broken.close();
    expect(await dump(new KkDb(kk.name))).toEqual(before);
  });

  it('round-trips its own export', async () => {
    const first = await exportProgressFile(kk, 7000, 'UTC');
    expect(first.name).toBe('kanjikodama-progress-1970-01-01.json');
    const other = await openDb();
    await importProgress(other, first.text, ctx);
    expect((await exportProgressFile(other, 7000, 'UTC')).text).toBe(first.text);
  });
});

describe('exportFile name', () => {
  it('uses the local date like SimpleDateFormat("yyyy-MM-dd")', async () => {
    const { progressFileName } = await import('../../src/progress/exportFile');
    const at = Date.UTC(2026, 9, 24, 20, 0); // Oct 24 20:00 UTC = Oct 25 in Tokyo
    expect(progressFileName(at, 'UTC')).toBe('kanjikodama-progress-2026-10-24.json');
    expect(progressFileName(at, 'Asia/Tokyo')).toBe('kanjikodama-progress-2026-10-25.json');
  });
});
