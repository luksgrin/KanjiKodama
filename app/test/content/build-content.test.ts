/**
 * Content builder → content file → loader. The private variant needs the git-ignored
 * `wk-content.db` and is skipped without it; the public variant always runs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContent, type BuiltContent } from '../../scripts/content/buildContent';
import { RAW_DIR, readInputs, WK_CONTENT_PATH } from '../../scripts/content/inputs';
import { CONTENT_MANIFEST_FILE, loadContentFile, pitchInfo, radicalEntries, readContentFile, strokeData, type LoadedContent } from '../../src/content/contentFile';
import { withReferenceData, type ReferenceTables } from '../../src/content/referenceData';
import { TITLE_IMAGE_IDS, titleImageOf } from '../../src/content/titleImages';
import { curriculumLayout } from '../../src/core/curriculum';
import { buildJlptPlan, type JlptPlanRow } from '../../src/core/curriculum/jlptPlan';
import { loadContentWithExtras } from '../golden/content';

const require = createRequire(import.meta.url);
const WEB_DIR = fileURLToPath(new URL('../../', import.meta.url));
const HAS_WK = existsSync(WK_CONTENT_PATH);
const TIMEOUT = 120_000;

let sqlPromise: Promise<SqlJsStatic> | undefined;
const sql = (): Promise<SqlJsStatic> => (sqlPromise ??= initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) }));

function writeBuild(built: BuiltContent): string {
  const dir = mkdtempSync(join(tmpdir(), 'kk-content-'));
  writeFileSync(join(dir, built.manifest.file), built.bytes);
  writeFileSync(join(dir, CONTENT_MANIFEST_FILE), JSON.stringify(built.manifest));
  return dir;
}

/** `fetch` over a directory, for `loadContentFile`. */
function dirFetch(dir: string): (url: string) => Promise<Response> {
  return async (url) => {
    const path = join(dir, new URL(url).pathname.split('/').pop()!);
    return existsSync(path) ? new Response(readFileSync(path)) : new Response('not found', { status: 404 });
  };
}

function leakCheck(dir: string): { status: number | null; output: string } {
  const r = spawnSync(process.execPath, ['scripts/check-no-private.mjs', '--no-git', '--dir', dir], { cwd: WEB_DIR, encoding: 'utf8' });
  return { status: r.status, output: r.stdout + r.stderr };
}

const tempDirs: string[] = [];
afterAll(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});

describe.skipIf(!HAS_WK)('content builder: private variant', () => {
  let built: BuiltContent;
  let db: Database;
  let loaded: LoadedContent;
  let dir: string;

  beforeAll(async () => {
    built = buildContent(await sql(), readInputs('private'));
    db = new (await sql()).Database(built.bytes);
    loaded = readContentFile(db, built.manifest);
    dir = writeBuild(built);
    tempDirs.push(dir);
  }, TIMEOUT);

  it('is deterministic: same inputs, same bytes', async () => {
    const again = buildContent(await sql(), readInputs('private'));
    expect(again.manifest.sha256).toBe(built.manifest.sha256);
    expect(Buffer.compare(Buffer.from(again.bytes), Buffer.from(built.bytes))).toBe(0);
    expect(built.manifest.file).toBe(`content-${built.manifest.sha256.slice(0, 16)}.db`);
  }, TIMEOUT);

  it('holds the content the golden harness builds from wk-content.db + extra-kanji.db, with reference data', async () => {
    const table = (name: string): Record<string, number> => JSON.parse(readFileSync(join(RAW_DIR, name), 'utf8')) as Record<string, number>;
    const tables: ReferenceTables = {
      frequency: table('kanjidic_freq.json'),
      joyoGrade: table('wikipedia_joyo_grades.json'),
      kanjiJlptLevel: table('kanji_jlpt_levels.json'),
      vocabJlptLevel: table('vocab_jlpt_levels.json'),
    };
    const expected = withReferenceData(await loadContentWithExtras(), tables);
    expect(loaded.content.subjects.length).toBe(expected.subjects.length);
    expect(loaded.content.subjects).toEqual(expected.subjects);
    expect(loaded.content.srsSystems).toEqual(expected.srsSystems);
    expect(built.manifest.counts).toMatchObject({ subjects: 9887, wanikaniSubjects: 9452, extraSubjects: 435, srsSystems: 2 });
  }, TIMEOUT);

  it('stores stroke data and pitch info as JSON text per subject', () => {
    const strokes = JSON.parse(readFileSync(join(RAW_DIR, 'stroke_data.json'), 'utf8')) as Record<string, string[]>;
    const pitch = JSON.parse(readFileSync(join(RAW_DIR, 'pitch_info.json'), 'utf8')) as Record<string, unknown[]>;
    expect(strokeData(db, 1)).toBe(JSON.stringify(strokes['一'])); // radical 一
    expect(strokeData(db, 440)).toBe(JSON.stringify(strokes['一'])); // kanji 一
    expect(strokeData(db, 2467)).toBeNull(); // vocabulary: no stroke data
    expect(JSON.parse(strokeData(db, 8763)!)[0]).toMatch(/^M14\.38,24\.73/); // STROKE_DATA_OVERRIDE
    expect(pitchInfo(db, 2467)).toBe(JSON.stringify(pitch['一'])); // vocabulary 一
    expect(pitchInfo(db, 440)).toBeNull(); // kanji: no pitch info
    for (const s of loaded.content.subjects) {
      if ((s.object === 'radical' || s.object === 'kanji') && s.characters !== null && strokes[s.characters] !== undefined) {
        expect(strokeData(db, s.id), `stroke data of ${s.id}`).not.toBeNull();
      }
    }
  });

  it('stores the radical images of Subject.getTitleImageId (res/drawable/radical_<id>.xml)', () => {
    expect(built.manifest.counts.titleImages).toBe(TITLE_IMAGE_IDS.length);
    expect([...loaded.titleImages!.keys()]).toEqual([...TITLE_IMAGE_IDS]);
    const yurt = loaded.titleImages!.get(8787)!;
    expect(yurt.size).toBe(1000);
    expect(yurt.paths.length).toBeGreaterThan(0);
    expect(yurt.paths.every((p) => p.w === 68)).toBe(true);
    expect(titleImageOf({ id: 8787, object: 'radical' })).toEqual(yurt);
    expect(titleImageOf({ id: 1, object: 'radical' })).toBeNull();
  });

  it("stores RADKFILE's parts with the content's kanji (every kanji but 々 has parts)", () => {
    const entries = radicalEntries(db);
    expect(built.manifest.counts.radicals).toBe(entries.length);
    expect(entries.length).toBeGreaterThan(230);
    const kanji = new Set(loaded.content.subjects.flatMap((s) => (s.object === 'kanji' && s.characters !== null ? [s.characters] : [])));
    const covered = new Set(entries.flatMap((e) => Array.from(e.kanji)));
    expect([...covered].every((k) => kanji.has(k))).toBe(true);
    expect([...kanji].filter((k) => !covered.has(k))).toEqual(['々']);
    expect(entries.find((e) => e.glyph === '亻')).toMatchObject({ strokes: 2 });
  });

  it('stores the WaniKani order as the subject table holds it', () => {
    for (const s of loaded.content.subjects) {
      expect(loaded.wkOrder.get(s.id)).toEqual([s.level, s.lessonPosition]);
    }
    expect(loaded.content.subjects.filter((s) => s.id >= 100000).every((s) => s.level === 61)).toBe(true);
  });

  it('places the WaniKani subjects in JLPT order exactly as the golden JlptPlan fixture', () => {
    const fixture = JSON.parse(readFileSync(join(WEB_DIR, 'test/golden/curriculum/jlpt-plan-content.json'), 'utf8')) as {
      cases: { name: string; input: { jlpt?: Record<string, number> }; output: { blockOfLevel: number[]; placement: [number, number, number][] } }[];
    };
    const golden = fixture.cases.find((c) => c.name === 'wk-content')!;
    expect(Object.fromEntries(loaded.jlptKanji)).toEqual(golden.input.jlpt);
    // JlptPlan on the WaniKani subjects alone (no extras), from the file's WaniKani order and kanji list.
    const rows: JlptPlanRow[] = loaded.content.subjects.filter((s) => s.id < 100000).map((s) => ({
      id: s.id,
      object: s.object,
      wkLevel: loaded.wkOrder.get(s.id)![0],
      wkPosition: loaded.wkOrder.get(s.id)![1],
      components: s.componentSubjectIds,
      hidden: s.hiddenAt !== 0,
      characters: s.characters,
    }));
    const plan = buildJlptPlan(rows, loaded.jlptKanji);
    expect(plan.blockOfLevel).toEqual(golden.output.blockOfLevel);
    expect([...plan.placement].sort((a, b) => a[0] - b[0]).map(([id, [l, p]]) => [id, l, p])).toEqual(golden.output.placement);
  });

  it('stores the JLPT order of all content (extras at the end of N1) as core lays it out', () => {
    const layout = curriculumLayout('JLPT', loaded.content.subjects.map((s) => ({
      id: s.id, object: s.object, characters: s.characters, componentSubjectIds: s.componentSubjectIds, hidden: s.hiddenAt !== 0,
    })), loaded.wkOrder, loaded.jlptKanji);
    expect(loaded.jlptBlocks).toEqual(layout.blocks);
    expect(new Map(loaded.jlptOrder)).toEqual(new Map(layout.placement));
    // As the scenario fixtures note: 58 levels, N1 ends at 54, and its last level holds only extras.
    expect(loaded.jlptBlocks.length).toBe(58);
    expect(loaded.jlptBlocks.lastIndexOf(1) + 1).toBe(54);
    const onLevel54 = loaded.content.subjects.filter((s) => s.object === 'kanji' && loaded.jlptOrder.get(s.id)![0] === 54);
    expect(onLevel54.length).toBeGreaterThan(0);
    expect(onLevel54.every((s) => s.id >= 100000)).toBe(true);
  });

  it('loads through the manifest with the same result', async () => {
    const fromFetch = await loadContentFile({ baseUrl: `file://${dir}/`, sql, fetch: dirFetch(dir) });
    try {
      expect(fromFetch.manifest).toEqual(built.manifest);
      expect(fromFetch.content.subjects).toEqual(loaded.content.subjects);
      expect(fromFetch.jlptBlocks).toEqual(loaded.jlptBlocks);
    } finally {
      fromFetch.db.close();
    }
  }, TIMEOUT);

  it('rejects a file that does not match its manifest', async () => {
    const bad = mkdtempSync(join(tmpdir(), 'kk-content-'));
    tempDirs.push(bad);
    writeFileSync(join(bad, built.manifest.file), built.bytes);
    writeFileSync(join(bad, CONTENT_MANIFEST_FILE), JSON.stringify({ ...built.manifest, sha256: '0'.repeat(64) }));
    await expect(loadContentFile({ baseUrl: `file://${bad}/`, sql, fetch: dirFetch(bad) })).rejects.toThrow(/hash/);
    await expect(loadContentFile({ baseUrl: 'file:///nowhere/', sql, fetch: dirFetch('/nowhere') })).rejects.toThrow(/manifest/);
  }, TIMEOUT);

  it('is caught by the leak check', () => {
    const r = leakCheck(dir);
    expect(r.status, r.output).toBe(1);
    expect(r.output).toMatch(/WaniKani/);
  });
});

describe('content builder: public variant', () => {
  let built: BuiltContent;
  let loaded: LoadedContent;

  beforeAll(async () => {
    built = buildContent(await sql(), readInputs('public'));
    loaded = readContentFile(new (await sql()).Database(built.bytes), built.manifest);
  }, TIMEOUT);

  it('holds only the extra kanji and words, Parts/Sound and reference data', () => {
    expect(built.manifest.variant).toBe('public');
    expect(Object.keys(built.manifest.sources)).not.toContain('wk-content.db');
    expect(loaded.content.subjects.length).toBe(435);
    expect(loaded.content.subjects.every((s) => s.id >= 100000)).toBe(true);
    expect(loaded.content.srsSystems).toEqual([]);
    expect(built.manifest.counts.kanjiPart).toBe(13529);
    expect(loaded.jlptOrder.size).toBe(435);
    expect(Buffer.from(built.bytes).includes('wanikani.com')).toBe(false);
    expect(built.manifest.counts.titleImages).toBe(0);
    expect(loaded.titleImages!.size).toBe(0);
    // Search by parts over the extra kanji only.
    const extraKanji = new Set(loaded.content.subjects.flatMap((s) => (s.object === 'kanji' ? [s.characters] : [])));
    const parts = radicalEntries(loaded.db);
    expect(parts.length).toBeGreaterThan(50);
    expect(parts.every((e) => Array.from(e.kanji).every((k) => extraKanji.has(k)))).toBe(true);
  });

  it('passes the leak check', () => {
    const dir = writeBuild(built);
    tempDirs.push(dir);
    const r = leakCheck(dir);
    expect(r.status, r.output).toBe(0);
  });
});
