/**
 * Round trips through Dexie with the real content (private content DB; skipped when absent):
 * - the owner's Android export → TS import into Dexie → TS export is semantically equal JSON (same
 *   keys, types and values, number types included), and in fact byte-identical;
 * - every committed progress fixture text goes through preview + import, accepted or rejected
 *   exactly like `describe` says, never leaving a half-written database;
 * - a content update (one subject removed, one added) leaves stored progress untouched.
 *
 * Never print the export (personal data): failures report paths only.
 */
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Content } from '../../src/core/content';
import { makeContent } from '../../src/core/content';
import { JSONArray, JSONObject, TypedNumber, parseJsonValue, type JsonValue } from '../../src/core/progressFile/androidJson';
import { KkDb } from '../../src/storage/db';
import { loadLearnerDb, saveLearnerDb } from '../../src/storage/progressRepo';
import { ProgressImportError, importProgress, previewImport } from '../../src/progress/importFile';
import { exportProgressFile } from '../../src/progress/exportFile';
import { GOLDEN_DIR } from '../golden/harness';
import { NO_CONTENT_DB_MESSAGE, hasContentDb, loadContentWithExtras } from '../golden/content';
import { loadJlptKanji } from '../golden/scenario/runner';
import { dump, freshName, openDb } from './helpers';

const EXPORT_FILE = 'progress/android-export.json';
const readGolden = (file: string): string => readFileSync(join(GOLDEN_DIR, file), 'utf8');

/** A plain value keeping the number type: integral numbers as "I:<n>", doubles as "D:<n>". */
function typed(v: JsonValue | null): unknown {
  if (v instanceof TypedNumber) return `${v.type === 'Double' ? 'D' : 'I'}:${v.toString()}`;
  if (v instanceof JSONArray) return v.values.map(typed);
  if (v instanceof JSONObject) return Object.fromEntries([...v.map].map(([k, x]) => [k, typed(x)]));
  return v;
}

/** Differences as paths (no values: the file is personal data). Arrays of objects with `id` match by id. */
function differences(a: unknown, b: unknown, path = ''): string[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const idOf = (x: unknown): unknown => (x && typeof x === 'object' && 'id' in x ? (x as { id: unknown }).id : undefined);
    if (a.length > 0 && [...a, ...b].every((x) => idOf(x) !== undefined)) {
      const ma = new Map(a.map((x) => [idOf(x), x]));
      const mb = new Map(b.map((x) => [idOf(x), x]));
      return [...new Set([...ma.keys(), ...mb.keys()])].flatMap((k) => differences(ma.get(k), mb.get(k), `${path}[id=${String(k)}]`));
    }
    const out = a.length === b.length ? [] : [`${path}: length ${a.length} vs ${b.length}`];
    for (let i = 0; i < Math.min(a.length, b.length); i++) out.push(...differences(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    return [...new Set([...Object.keys(ra), ...Object.keys(rb)])].flatMap((k) => differences(ra[k], rb[k], `${path}.${k}`));
  }
  return a === b ? [] : [path];
}

const semanticDiff = (x: string, y: string): string[] => differences(typed(parseJsonValue(x)), typed(parseJsonValue(y)));

describe.skipIf(!hasContentDb())(`progress files through Dexie with the real content${hasContentDb() ? '' : ` (${NO_CONTENT_DB_MESSAGE})`}`, { timeout: 60_000 }, () => {
  let content: Content;
  let jlptKanji: Map<string, number>;
  beforeAll(async () => {
    content = await loadContentWithExtras();
    jlptKanji = loadJlptKanji();
  });

  it('Android export → import → export gives the same JSON', async () => {
    const source = readGolden(EXPORT_FILE);
    const exportedAt = Number(JSON.parse(source).exportedAt);
    const kk = await openDb();
    await importProgress(kk, source, { content, jlptKanji, now: exportedAt });
    const { text } = await exportProgressFile(kk, exportedAt, 'UTC');
    const diffs = semanticDiff(text, source);
    expect(diffs.slice(0, 20), `${diffs.length} differences`).toEqual([]);
    expect(text === source).toBe(true);

    // Second round, from a fresh KkDb instance on another database.
    const kk2 = await openDb();
    await importProgress(kk2, text, { content, jlptKanji, now: exportedAt });
    expect((await exportProgressFile(new KkDb(kk2.name), exportedAt, 'UTC')).text === text).toBe(true);
  });

  it('content update: one subject removed, one added, leaves progress untouched', async () => {
    const source = readGolden(EXPORT_FILE);
    const exportedAt = Number(JSON.parse(source).exportedAt);
    const name = freshName();
    const kk = await openDb(name);
    await importProgress(kk, source, { content, jlptKanji, now: exportedAt });
    const before = new Map((await kk.subjects.toArray()).map((r) => [r.id, r]));
    const beforeDump = await dump(kk);
    kk.close();

    // Remove a subject that has progress; add one with a new id.
    const removed = [...before.values()].find((r) => typeof r.srsStage === 'number' && r.srsStage > 0)!.id;
    const template = content.byId.get(removed)!;
    const added = { ...template, id: 999_999, characters: 'X', componentSubjectIds: [] };
    const v2 = makeContent([...content.subjects.filter((s) => s.id !== removed), added], content.srsSystems);

    const kk2 = new KkDb(name);
    const ldb = await loadLearnerDb(kk2, v2, jlptKanji);
    expect(ldb.ordering).toBe('JLPT'); // the export is in JLPT order; the layout is recomputed from the content
    let compared = 0;
    for (const [id, record] of before) {
      if (id === removed) continue;
      const { id: _id, ...row } = record;
      expect(ldb.progress.subjects.get(id)).toEqual(row);
      compared++;
    }
    expect(compared).toBeGreaterThan(1000);
    expect(ldb.progress.subjects.has(removed)).toBe(false);
    expect(ldb.progress.subjects.has(999_999)).toBe(false);
    // Loading touched nothing; saving keeps every row, including the removed subject's.
    expect(await dump(kk2)).toEqual(beforeDump);
    await saveLearnerDb(kk2, ldb);
    expect(new Map((await kk2.subjects.toArray()).map((r) => [r.id, r]))).toEqual(before);
  });

  it('every committed progress fixture text is accepted or rejected like describe, atomically', async () => {
    const fixture = JSON.parse(readGolden('progress/describe.json')) as {
      cases: Array<{ name: string; input: { text: string } | { file: string }; output: { ok: boolean; summary?: string } }>;
    };
    const kk = await openDb();
    await importProgress(kk, readGolden(EXPORT_FILE), { content, jlptKanji, now: 1792298260372 });
    let restored = 0;
    for (const c of fixture.cases) {
      const text = 'text' in c.input ? c.input.text : readGolden(c.input.file);
      const before = await dump(kk);
      if (!c.output.ok) {
        expect(() => previewImport(text, 'UTC'), c.name).toThrow(ProgressImportError);
        await expect(importProgress(kk, text, { content, jlptKanji }), c.name).rejects.toThrow(ProgressImportError);
        expect(await dump(kk), c.name).toEqual(before);
        continue;
      }
      expect(previewImport(text, 'UTC').summary, c.name).toBe(c.output.summary);
      try {
        await importProgress(kk, text, { content, jlptKanji, now: 1792298260372 });
        restored++;
      } catch (e) {
        // Passes describe but fails in the restore: nothing changed.
        expect(e, c.name).toBeInstanceOf(ProgressImportError);
        expect(await dump(kk), c.name).toEqual(before);
        continue;
      }
      // What was stored exports and re-imports to the same file.
      const first = (await exportProgressFile(kk, 1792298260372, 'UTC')).text;
      const other = await openDb();
      await importProgress(other, first, { content, jlptKanji, now: 1792298260372 });
      expect((await exportProgressFile(other, 1792298260372, 'UTC')).text === first, c.name).toBe(true);
      other.close();
    }
    expect(restored).toBeGreaterThan(10);
  });
});
