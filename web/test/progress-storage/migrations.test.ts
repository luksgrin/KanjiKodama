import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

import { emptySubjectRow } from '../../src/core/progressFile/format';
import { KkDb, SCHEMA_VERSION } from '../../src/storage/db';
import { exportProgressFile } from '../../src/progress/exportFile';
import { loadProgressState } from '../../src/storage/progressRepo';
import { freshName } from './helpers';

const ALL_TABLES = ['jumps', 'levelProgression', 'levelTest', 'meta', 'probation', 'session', 'settings', 'state', 'subjects', 'tasks'];

/**
 * Every earlier schema version: its Dexie schema, data as that version stored it, and the checks
 * after opening it with the current `KkDb`. Add an entry here with every new version.
 */
const EARLIER_VERSIONS: Array<{
  version: number;
  stores: Record<string, string>;
  seed(db: Dexie): Promise<void>;
  verify(kk: KkDb): Promise<void>;
}> = [
  {
    version: 1, // the spike (step 1)
    stores: { progress: 'id', meta: 'key' },
    async seed(db) {
      await db.table('progress').bulkPut([
        { id: 440, srsStage: 3, meaningCorrect: 2, meaningIncorrect: 1, readingCorrect: 4, readingIncorrect: 0,
          lastAnswer: 'one', lastAnsweredAt: 1700000000000, timesAnswered: 7 },
        { id: 441, srsStage: 0, meaningCorrect: 0, meaningIncorrect: 0, readingCorrect: 0, readingIncorrect: 0, timesAnswered: 0 },
      ]);
      await db.table('meta').bulkPut([
        { key: 'userLevel', value: 4 },
        { key: 'launchCount', value: 12 },
        { key: 'position', value: { index: 3, kind: 'reading' } },
      ]);
    },
    async verify(kk) {
      expect(await kk.subjects.get(440)).toEqual({
        ...emptySubjectRow(), id: 440, srsStage: 3, meaningCorrect: 2, meaningIncorrect: 1, readingCorrect: 4, readingIncorrect: 0,
      });
      expect(await kk.subjects.get(441)).toEqual({ ...emptySubjectRow(), id: 441 });
      expect(await kk.state.get('userLevel')).toEqual({ key: 'userLevel', value: 4 });
      expect(await kk.meta.get('userLevel')).toBeUndefined();
      expect((await kk.meta.get('launchCount'))?.value).toBe(12);
      const state = await loadProgressState(kk);
      expect(state.userLevel).toBe(4);
      const { text } = await exportProgressFile(kk, 1760659200000, 'UTC');
      const file = JSON.parse(text) as { subjects: Array<{ id: number }> };
      // 441 has no answers and isn't unlocked: not exported, like the Java filter.
      expect(file.subjects.map((s) => s.id)).toEqual([440]);
    },
  },
];

describe('schema migrations', () => {
  it('a fresh database is at the current version with every table', async () => {
    const kk = new KkDb(freshName());
    await kk.open();
    expect(kk.verno).toBe(SCHEMA_VERSION);
    expect(kk.tables.map((t) => t.name).sort()).toEqual(ALL_TABLES);
    expect((await kk.meta.get('schemaVersion'))?.value).toBe(SCHEMA_VERSION);
    kk.close();
  });

  it('every earlier version is listed', () => {
    expect(EARLIER_VERSIONS.map((v) => v.version)).toEqual(Array.from({ length: SCHEMA_VERSION - 1 }, (_, i) => i + 1));
  });

  for (const v of EARLIER_VERSIONS) {
    it(`migrates a version ${v.version} database`, async () => {
      const name = freshName();
      const old = new Dexie(name);
      old.version(v.version).stores(v.stores);
      await old.open();
      await v.seed(old);
      old.close();

      const kk = new KkDb(name);
      await kk.open();
      expect(kk.verno).toBe(SCHEMA_VERSION);
      expect(kk.tables.map((t) => t.name).sort()).toEqual(ALL_TABLES);
      expect((await kk.meta.get('schemaVersion'))?.value).toBe(SCHEMA_VERSION);
      await v.verify(kk);
      kk.close();
    });
  }
});
