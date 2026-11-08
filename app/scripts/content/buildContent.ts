/**
 * The content builder: WaniKani content (private variant only), extra kanji, Parts/Sound, the JLPT
 * kanji list and the reference data of `res/raw/` → one SQLite file plus its manifest. Table layout:
 * `src/content/contentFile.ts`. Same inputs give the same bytes (no timestamps, fixed row order).
 *
 * What it adds to the WaniKani content:
 * - the extra kanji (ids from 100000, WaniKani level 61, kanji components resolved to radicals by
 *   character): the subject rows via `mergeExtraContent`, plus their text columns;
 * - reference data: frequency, Jōyō grade, JLPT level (`withReferenceData`), stroke data (with the
 *   overrides in `strokeOverrides.ts`) and pitch info;
 * - the JLPT order of every subject (`curriculumLayout`, which runs the JLPT plan) next to the
 *   WaniKani order.
 */
import { createHash } from 'node:crypto';
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { makeContent, type Content, type ContentSubject } from '../../src/core/content';
import { curriculumLayout, parseJlptKanjiTsv } from '../../src/core/curriculum';
import { mergeExtraContent } from '../../src/content/extraContent';
import { readContent } from '../../src/content/readContent';
import { withReferenceData, type ReferenceTables } from '../../src/content/referenceData';
import {
  CONTENT_SCHEMA_VERSION,
  type ContentManifest,
  type ContentSourceInfo,
  type ContentVariant,
} from '../../src/content/contentFile';
import { SCHEMA_SQL, SOUND_TABLES, SRS_SYSTEM_COLUMNS, SUBJECT_COLUMNS, type SubjectColumn } from './schema';
import { STROKE_DATA_OVERRIDE } from './strokeOverrides';
import { parseVectorDrawable } from './titleImages';

/** One input file: its name (for the manifest) and bytes. */
export interface InputFile {
  name: string;
  bytes: Uint8Array;
}

export interface ContentInputs {
  variant: ContentVariant;
  /** `wk-content.db`; required for `private`, never read for `public`. */
  wkContent?: InputFile;
  /** `tools/wk-content.lock.json` (optional): its tag goes into the manifest. */
  wkLock?: InputFile;
  soundComponents: InputFile;
  extraKanji: InputFile;
  jlptKanjiTsv: InputFile;
  strokeData: InputFile;
  pitchInfo: InputFile;
  kanjiJlptLevels: InputFile;
  vocabJlptLevels: InputFile;
  kanjidicFreq: InputFile;
  joyoGrades: InputFile;
  /** `res/drawable/radical_<id>.xml` of every `Subject.getTitleImageId` radical (`src/content/titleImages.ts`). */
  titleImages: { id: number; file: InputFile }[];
}

export interface BuiltContent {
  bytes: Uint8Array;
  manifest: ContentManifest;
}

const HASH_PREFIX = 16;

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const text = (f: InputFile): string => new TextDecoder().decode(f.bytes);

function rows(db: Database, sql: string): SqlValue[][] {
  const stmt = db.prepare(sql);
  const out: SqlValue[][] = [];
  try {
    while (stmt.step()) out.push(stmt.get());
  } finally {
    stmt.free();
  }
  return out;
}

function insertAll(db: Database, table: string, columns: readonly string[], values: Iterable<SqlValue[]>): number {
  const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
  let n = 0;
  try {
    for (const v of values) {
      stmt.run(v);
      n++;
    }
  } finally {
    stmt.free();
  }
  return n;
}

function jsonTable<T>(f: InputFile): Map<string, T> {
  return new Map(Object.entries(JSON.parse(text(f)) as Record<string, T>));
}

function meta(db: Database, key: string): string | undefined {
  const r = rows(db, `SELECT value FROM meta WHERE key = '${key}'`)[0];
  return r === undefined ? undefined : String(r[0]);
}

/** Characters twice, then every meaning and reading. */
function extraSearchTarget(characters: string, meanings: string, readings: string): string {
  const parts = [characters, characters];
  for (const m of JSON.parse(meanings) as { meaning: string }[]) parts.push(m.meaning);
  for (const r of JSON.parse(readings) as { reading: string }[]) parts.push(r.reading);
  return parts.join(' ');
}

type Row = Record<SubjectColumn, SqlValue>;

/** The extra subject's full row, as inserted into a fresh table. */
function extraRows(extraDb: Database, merged: ReadonlyMap<number, ContentSubject>): Map<number, Row> {
  const out = new Map<number, Row>();
  const q = 'SELECT id, object, characters, meanings, auxiliary_meanings, readings, meaning_mnemonic, meaning_hint,'
    + ' reading_mnemonic, reading_hint, parts_of_speech, context_sentences FROM extra_subject ORDER BY id';
  for (const [id, object, characters, meanings, aux, readings, mm, mh, rm, rh, pos, ctx] of rows(extraDb, q)) {
    const s = merged.get(Number(id))!;
    out.set(s.id, {
      id: s.id,
      object: String(object),
      typeCode: object === 'kanji' ? 1 : 2,
      hiddenAt: 0,
      lessonPosition: s.lessonPosition,
      srsSystemId: 1,
      level: s.level,
      characters: String(characters),
      slug: String(characters),
      documentUrl: '',
      meanings: meanings ?? null,
      meaningMnemonic: mm ?? null,
      meaningHint: mh ?? null,
      auxiliaryMeanings: aux ?? null,
      readings: readings ?? null,
      readingMnemonic: rm ?? null,
      readingHint: rh ?? null,
      componentSubjectIds: JSON.stringify(s.componentSubjectIds),
      amalgamationSubjectIds: JSON.stringify(s.amalgamationSubjectIds),
      visuallySimilarSubjectIds: '[]',
      partsOfSpeech: pos ?? null,
      contextSentences: ctx ?? null,
      pronunciationAudios: '[]',
      searchTarget: extraSearchTarget(String(characters), String(meanings), String(readings)),
      smallSearchTarget: String(characters),
      frequency: 0,
      joyoGrade: 0,
      jlptLevel: 0,
    });
  }
  return out;
}

/** Stroke data: the per-id override first, then radicals and kanji by characters. */
function strokeDataOf(s: ContentSubject, strokes: ReadonlyMap<string, string[]>): string | null {
  const override = STROKE_DATA_OVERRIDE[s.id];
  if (override !== undefined) return JSON.stringify(override);
  if (s.characters === null || (s.object !== 'radical' && s.object !== 'kanji')) return null;
  const data = strokes.get(s.characters);
  return data === undefined ? null : JSON.stringify(data);
}

type PitchEntry = [string | null, string | null, number];

/** Pitch info: vocabulary and kana vocabulary by characters (`[]` is kept). */
function pitchInfoOf(s: ContentSubject, pitch: ReadonlyMap<string, PitchEntry[]>): string | null {
  if (s.characters === null || (s.object !== 'vocabulary' && s.object !== 'kana_vocabulary')) return null;
  const info = pitch.get(s.characters);
  if (info === undefined) return null;
  // PitchInfoSerializer: [reading, partOfSpeech, pitchNumber].
  return JSON.stringify(info.map(([r, p, n]) => [r ?? null, p ?? null, Math.trunc(n)]));
}

function sourceInfo(f: InputFile, version?: string): ContentSourceInfo {
  return version === undefined ? { sha256: sha256(f.bytes), bytes: f.bytes.byteLength } : { sha256: sha256(f.bytes), bytes: f.bytes.byteLength, version };
}

/** Builds the content file. `public` leaves out every WaniKani row (and the SRS systems, which come from WaniKani). */
export function buildContent(SQL: SqlJsStatic, inputs: ContentInputs): BuiltContent {
  const isPrivate = inputs.variant === 'private';
  if (isPrivate && inputs.wkContent === undefined) throw new Error('the private variant needs wk-content.db');

  const wkDb = isPrivate ? new SQL.Database(inputs.wkContent!.bytes) : null;
  const extraDb = new SQL.Database(inputs.extraKanji.bytes);
  const soundDb = new SQL.Database(inputs.soundComponents.bytes);
  const out = new SQL.Database();
  try {
    // --- subjects: WaniKani + extras + reference data ---------------------------------------
    const base: Content = wkDb === null ? makeContent([], []) : readContent(wkDb);
    const tables: ReferenceTables = {
      frequency: JSON.parse(text(inputs.kanjidicFreq)) as Record<string, number>,
      joyoGrade: JSON.parse(text(inputs.joyoGrades)) as Record<string, number>,
      kanjiJlptLevel: JSON.parse(text(inputs.kanjiJlptLevels)) as Record<string, number>,
      vocabJlptLevel: JSON.parse(text(inputs.vocabJlptLevels)) as Record<string, number>,
    };
    const content = withReferenceData(mergeExtraContent(base, extraDb), tables);

    const columns = SUBJECT_COLUMNS.map(([n]) => n);
    const wkRows = new Map<number, Row>();
    if (wkDb !== null) {
      for (const r of rows(wkDb, `SELECT ${columns.join(', ')} FROM subject ORDER BY id`)) {
        const row = Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null])) as Row;
        wkRows.set(Number(row.id), row);
      }
    }
    const extras = extraRows(extraDb, content.byId);

    out.run(SCHEMA_SQL);
    out.run('BEGIN');

    const subjectRows: SqlValue[][] = content.subjects.map((s) => {
      const row = wkRows.get(s.id) ?? extras.get(s.id);
      if (row === undefined) throw new Error(`subject ${s.id} has no source row`);
      const full: Row = { ...row, frequency: s.frequency, joyoGrade: s.joyoGrade, jlptLevel: s.jlptLevel };
      return columns.map((c) => full[c]);
    });
    insertAll(out, 'subject', columns, subjectRows);

    if (wkDb !== null) {
      insertAll(out, 'srs_system', SRS_SYSTEM_COLUMNS, rows(wkDb, `SELECT ${SRS_SYSTEM_COLUMNS.join(', ')} FROM srs_system ORDER BY id`));
    }

    // --- reference data, as JSON text per subject ------------------------------------------
    const strokes = jsonTable<string[]>(inputs.strokeData);
    const pitch = jsonTable<PitchEntry[]>(inputs.pitchInfo);
    const strokeCount = insertAll(out, 'stroke_data', ['id', 'data'], content.subjects.flatMap((s) => {
      const d = strokeDataOf(s, strokes);
      return d === null ? [] : [[s.id, d]];
    }));
    const pitchCount = insertAll(out, 'pitch_info', ['id', 'data'], content.subjects.flatMap((s) => {
      const d = pitchInfoOf(s, pitch);
      return d === null ? [] : [[s.id, d]];
    }));

    // Radical images (`Subject.getTitleImageId`): only for subjects in this variant (none in public).
    const titleImageCount = insertAll(out, 'title_image', ['id', 'data'], inputs.titleImages.flatMap(({ id, file }) => {
      const s = content.byId.get(id);
      return s === undefined || s.object !== 'radical' ? [] : [[id, JSON.stringify(parseVectorDrawable(text(file), file.name))]];
    }));

    // --- both orders --------------------------------------------------------------------------
    const jlptKanji = parseJlptKanjiTsv(text(inputs.jlptKanjiTsv));
    const wkOrder = new Map<number, readonly [number, number]>(content.subjects.map((s) => [s.id, [s.level, s.lessonPosition]]));
    const layout = curriculumLayout(
      'JLPT',
      content.subjects.map((s) => ({
        id: s.id, object: s.object, characters: s.characters, componentSubjectIds: s.componentSubjectIds, hidden: s.hiddenAt !== 0,
      })),
      wkOrder,
      jlptKanji,
    );
    insertAll(out, 'subject_order', ['id', 'wkLevel', 'wkPosition', 'jlptLevel', 'jlptPosition'], content.subjects.map((s) => {
      const j = layout.placement.get(s.id);
      if (j === undefined) throw new Error(`subject ${s.id} has no JLPT placement`);
      return [s.id, s.level, s.lessonPosition, j[0], j[1]];
    }));
    insertAll(out, 'jlpt_block', ['level', 'block'], layout.blocks.map((b, i) => [i + 1, b]));
    const jlptKanjiCount = insertAll(out, 'jlpt_kanji', ['characters', 'level'],
      [...jlptKanji.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));

    // --- Parts/Sound --------------------------------------------------------------------------
    const soundCounts: Record<string, number> = {};
    for (const t of SOUND_TABLES) {
      const ddl = rows(soundDb, `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${t}'`)[0];
      if (ddl === undefined) throw new Error(`sound-components.db has no table ${t}`);
      out.run(String(ddl[0]));
      const cols = rows(soundDb, `PRAGMA table_info(${t})`).map((r) => String(r[1]));
      soundCounts[t] = insertAll(out, t, cols, rows(soundDb, `SELECT ${cols.join(', ')} FROM ${t} ORDER BY rowid`));
    }
    for (const [ddl] of rows(soundDb, "SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name")) {
      out.run(String(ddl));
    }

    // --- meta ---------------------------------------------------------------------------------
    const extraVersion = meta(extraDb, 'content_version');
    const soundVersion = meta(soundDb, 'schema_version');
    const wkTag = inputs.wkLock === undefined ? undefined : (JSON.parse(text(inputs.wkLock)) as { tag?: string }).tag;
    const metaRows: [string, string][] = [
      ['schemaVersion', String(CONTENT_SCHEMA_VERSION)],
      ['variant', inputs.variant],
      ['extraContentVersion', extraVersion ?? ''],
      ['soundSchemaVersion', soundVersion ?? ''],
      ['soundSource', meta(soundDb, 'source') ?? ''],
    ];
    if (isPrivate) metaRows.push(['wkContentSha256', sha256(inputs.wkContent!.bytes)]);
    insertAll(out, 'content_meta', ['key', 'value'], metaRows.sort((a, b) => (a[0] < b[0] ? -1 : 1)));
    out.run('COMMIT');

    const bytes = out.export();
    const hash = sha256(bytes);

    const byObject: Record<string, number> = { radical: 0, kanji: 0, vocabulary: 0, kana_vocabulary: 0 };
    for (const s of content.subjects) byObject[s.object] = (byObject[s.object] ?? 0) + 1;
    const sources: Record<string, ContentSourceInfo> = {};
    if (isPrivate) sources[inputs.wkContent!.name] = sourceInfo(inputs.wkContent!, wkTag);
    sources[inputs.extraKanji.name] = sourceInfo(inputs.extraKanji, extraVersion);
    sources[inputs.soundComponents.name] = sourceInfo(inputs.soundComponents, soundVersion);
    for (const f of [inputs.jlptKanjiTsv, inputs.strokeData, inputs.pitchInfo, inputs.kanjiJlptLevels, inputs.vocabJlptLevels,
      inputs.kanjidicFreq, inputs.joyoGrades]) {
      sources[f.name] = sourceInfo(f);
    }
    // The radical drawables as one source: their names and bytes, concatenated.
    const drawables = inputs.titleImages.map(({ file }) => file);
    const joined = new Uint8Array(drawables.reduce((n, f) => n + f.name.length + 1 + f.bytes.byteLength, 0));
    let at = 0;
    for (const f of drawables) {
      joined.set(new TextEncoder().encode(`${f.name}\n`), at);
      at += f.name.length + 1;
      joined.set(f.bytes, at);
      at += f.bytes.byteLength;
    }
    sources['radical-drawables'] = sourceInfo({ name: 'radical-drawables', bytes: joined });
    const manifest: ContentManifest = {
      schemaVersion: CONTENT_SCHEMA_VERSION,
      variant: inputs.variant,
      file: `content-${hash.slice(0, HASH_PREFIX)}.db`,
      sha256: hash,
      bytes: bytes.byteLength,
      counts: {
        subjects: content.subjects.length,
        ...byObject,
        wanikaniSubjects: wkRows.size,
        extraSubjects: extras.size,
        hiddenSubjects: content.subjects.filter((s) => s.hiddenAt !== 0).length,
        srsSystems: content.srsSystems.length,
        strokeData: strokeCount,
        pitchInfo: pitchCount,
        titleImages: titleImageCount,
        jlptLevels: layout.blocks.length,
        jlptKanji: jlptKanjiCount,
        ...Object.fromEntries(Object.entries(soundCounts).map(([k, v]) => [k.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase()), v])),
      },
      sources,
    };
    return { bytes, manifest };
  } finally {
    out.close();
    soundDb.close();
    extraDb.close();
    wkDb?.close();
  }
}
