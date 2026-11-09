import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

import type { WritingRecord } from '../../src/core/writing';
import { exportProgressFile } from '../../src/progress/exportFile';
import { importProgress } from '../../src/progress/importFile';
import { resetLocalDatabase } from '../../src/progress/resetDatabase';
import {
  cachedWritingRecords, clearWritingRecords, loadWritingRecords, mergeWritingRecords, recordWrites, subscribeWritingRecords,
} from '../../src/progress/writingStore';
import { NO_JLPT, openDb, progressFile, smallContent } from './helpers';

const content = smallContent();
const ctx = { content, jlptKanji: NO_JLPT, now: 5000 };
const DAY = 86_400_000;
const rec = (over: Partial<WritingRecord>): WritingRecord =>
  ({ id: 10, attempts: 1, clean: 1, level: 1, lastPracticed: 1000, nextDue: 1000 + DAY, ...over });

describe('writing records in the database', () => {
  it('records writes, caches them and notifies', async () => {
    const kk = await openDb();
    const seen: number[] = [];
    const off = subscribeWritingRecords(kk, (r) => seen.push(r.size));
    await recordWrites(kk, [{ id: 10, misses: 0, hints: 0, revealed: 0 }, { id: 1, misses: 1, hints: 0, revealed: 0 }], 'recall', 1000);
    expect(await kk.writing.get(10)).toEqual(rec({}));
    expect((await kk.writing.get(1))?.level).toBe(0);
    expect(cachedWritingRecords(kk)?.size).toBe(2);
    expect(seen).toEqual([2]);
    await recordWrites(kk, [{ id: 10, misses: 0, hints: 0, revealed: 0 }], 'recall', 1000 + DAY);
    expect(await kk.writing.get(10)).toMatchObject({ attempts: 2, clean: 2, level: 2 });
    off();
  });

  it('the progress file carries them only when there are any; a restore merges, the later practice winning', async () => {
    const kk = await openDb();
    const empty = await exportProgressFile(kk, 7000, 'UTC');
    expect(JSON.parse(empty.text)).not.toHaveProperty('writing');

    await kk.writing.bulkPut([rec({ id: 10, lastPracticed: 2000, level: 3 }), rec({ id: 11, lastPracticed: 9000, level: 4 })]);
    await loadWritingRecords(kk);
    const saved = await exportProgressFile(kk, 7000, 'UTC');
    expect((JSON.parse(saved.text) as { writing: WritingRecord[] }).writing.map((r) => r.id)).toEqual([10, 11]);

    // The file: 10 practised later (wins), 11 earlier (the stored one stays), 20 new, 999 unknown (skipped).
    await importProgress(kk, progressFile({ writing: [
      rec({ id: 10, lastPracticed: 3000, level: 0 }), rec({ id: 11, lastPracticed: 8000, level: 1 }),
      rec({ id: 20, lastPracticed: 100 }), rec({ id: 999 }),
    ] }), ctx);
    const after = new Map((await kk.writing.toArray()).map((r) => [r.id, r.level]));
    expect([...after]).toEqual([[10, 0], [11, 4], [20, 1]]);
    expect(cachedWritingRecords(kk)?.get(10)?.level).toBe(0);

    // A file without writing records leaves them alone.
    await importProgress(kk, progressFile({}), ctx);
    expect(await kk.writing.count()).toBe(3);
  });

  it('merge with nothing reloads; Reset database clears them', async () => {
    const kk = await openDb();
    await kk.writing.put(rec({}));
    await mergeWritingRecords(kk, []);
    expect(cachedWritingRecords(kk)?.size).toBe(1);
    await resetLocalDatabase(kk, { content, jlptKanji: NO_JLPT, now: 5000 });
    expect(await kk.writing.count()).toBe(0);
    expect(cachedWritingRecords(kk)?.size).toBe(0);
    await kk.writing.put(rec({}));
    await clearWritingRecords(kk);
    expect(await kk.writing.count()).toBe(0);
  });
});
