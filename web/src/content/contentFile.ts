/**
 * The built content file (`content-<hash>.db`, written by `scripts/build-content.ts`) and its manifest
 * (`content-manifest.json`): the types both sides share, reading an open file into what the app needs,
 * and loading it over `fetch` (PWA: same origin, Android: the bundled web assets).
 *
 * Table layout (schema version {@link CONTENT_SCHEMA_VERSION}; DDL in `scripts/content/schema.ts`):
 * - `subject`: the static columns of the WaniKani `subject` table (no progress columns), plus the
 *   extra kanji and words (ids from 100000). `level`/`lessonPosition` are the WaniKani order (extras on
 *   level 61), as the Android app's table holds them after the content import. `frequency`,
 *   `joyoGrade` and `jlptLevel` are the reference data (`LoadReferenceDataTask`), precomputed.
 * - `srs_system`: as in `wk-content.db`.
 * - `subject_order`: both curriculum orders per subject: `wkLevel`/`wkPosition` and
 *   `jlptLevel`/`jlptPosition` (here `jlptLevel` is the JLPT-order *level*, 1..58, not the N-level
 *   of `subject.jlptLevel`).
 * - `jlpt_block`: `level` → `block` (5 = N5 … 1 = N1, 0 = Obscure) of the JLPT order.
 * - `jlpt_kanji`: `jlpt-kanji.tsv` (`characters` → N-level), so the app can lay the JLPT order out
 *   again at run time (hiding subjects, switching curriculum).
 * - `stroke_data`, `pitch_info`: `id` → JSON text, exactly what the Java app stores in
 *   `subject.strokeData`/`subject.pitchInfo` (`ReferenceDataUtil.getStrokeData`/`getPitchInfo`); only
 *   subjects that have one. Kept out of `subject` so loading the subjects stays small.
 * - `title_image`: `id` → JSON `TitleImage` (`content/titleImages.ts`), the radicals the Java app draws
 *   as an image (`Subject.getTitleImageId`); optional (older files lack it: the slug is shown instead).
 * - `kanji_part`, `kanji_sound`, `series`, `series_member`: `sound-components.db` (Parts/Sound), as is.
 * - `content_meta`: `key` → `value` (`schemaVersion`, `variant`, source versions).
 */
import type { Database, SqlJsStatic } from 'sql.js';
import type { Content } from '../core/content';
import { readContent } from './readContent';
import { readTitleImages, registerTitleImages, type TitleImage } from './titleImages';

export const CONTENT_SCHEMA_VERSION = 1;
export const CONTENT_MANIFEST_FILE = 'content-manifest.json';

/** `private` holds WaniKani content (internal use only: never deploy); `public` holds open data only. */
export type ContentVariant = 'private' | 'public';

export interface ContentSourceInfo {
  sha256: string;
  bytes: number;
  /** Version the source states about itself (`meta.content_version`, lock tag), when it has one. */
  version?: string;
}

/** `content-manifest.json`. Deterministic: no timestamps. */
export interface ContentManifest {
  schemaVersion: number;
  variant: ContentVariant;
  /** `content-<first 16 hex of sha256>.db`, relative to the manifest. */
  file: string;
  sha256: string;
  bytes: number;
  counts: Record<string, number>;
  /** Input file name → hash, size, version. */
  sources: Record<string, ContentSourceInfo>;
}

export type Order = ReadonlyMap<number, readonly [number, number]>;

/** Everything the app reads from the content file at start-up. */
export interface LoadedContent {
  manifest: ContentManifest | null;
  /** Open; stroke data, pitch info and Parts/Sound are queried on demand. */
  db: Database;
  /** Subjects (WaniKani order) with reference data, and SRS systems: what core expects. */
  content: Content;
  /** `[level, lessonPosition]` per subject id in WaniKani order. */
  wkOrder: Order;
  /** `[level, lessonPosition]` per subject id in JLPT order. */
  jlptOrder: Order;
  /** Block code of every JLPT-order level (index 0 = level 1). */
  jlptBlocks: number[];
  /** `jlpt-kanji.tsv`: kanji → N-level. */
  jlptKanji: Map<string, number>;
  /** Radical images by subject id (also registered for `titleImageOf`). */
  titleImages?: Map<number, TitleImage>;
}

function all(db: Database, sql: string, params: (string | number)[] = []): unknown[][] {
  const stmt = db.prepare(sql);
  const out: unknown[][] = [];
  try {
    stmt.bind(params);
    while (stmt.step()) out.push(stmt.get());
  } finally {
    stmt.free();
  }
  return out;
}

/** `content_meta` as a map. */
export function readContentMeta(db: Database): Map<string, string> {
  return new Map(all(db, 'SELECT key, value FROM content_meta ORDER BY key').map(([k, v]) => [String(k), String(v)]));
}

/** Reads an open content file. Throws on an unknown schema version. */
export function readContentFile(db: Database, manifest: ContentManifest | null = null): LoadedContent {
  const meta = readContentMeta(db);
  const version = Number(meta.get('schemaVersion'));
  if (version !== CONTENT_SCHEMA_VERSION) {
    throw new Error(`content file schema ${meta.get('schemaVersion') ?? '?'} is not supported (expected ${CONTENT_SCHEMA_VERSION})`);
  }
  const wkOrder = new Map<number, readonly [number, number]>();
  const jlptOrder = new Map<number, readonly [number, number]>();
  for (const [id, wl, wp, jl, jp] of all(db, 'SELECT id, wkLevel, wkPosition, jlptLevel, jlptPosition FROM subject_order ORDER BY id')) {
    wkOrder.set(Number(id), [Number(wl), Number(wp)]);
    jlptOrder.set(Number(id), [Number(jl), Number(jp)]);
  }
  const titleImages = readTitleImages(db);
  registerTitleImages(titleImages);
  return {
    manifest,
    db,
    content: readContent(db),
    wkOrder,
    jlptOrder,
    jlptBlocks: all(db, 'SELECT block FROM jlpt_block ORDER BY level').map(([b]) => Number(b)),
    jlptKanji: new Map(all(db, 'SELECT characters, level FROM jlpt_kanji ORDER BY characters').map(([c, l]) => [String(c), Number(l)])),
    titleImages,
  };
}

/** `subject.strokeData` of the Java app: JSON array of stroke paths, or null. */
export function strokeData(db: Database, id: number): string | null {
  const r = all(db, 'SELECT data FROM stroke_data WHERE id = ?', [id])[0];
  return r === undefined ? null : String(r[0]);
}

/** `subject.pitchInfo` of the Java app: JSON array of `[reading, partOfSpeech, pitchNumber]`, or null. */
export function pitchInfo(db: Database, id: number): string | null {
  const r = all(db, 'SELECT data FROM pitch_info WHERE id = ?', [id])[0];
  return r === undefined ? null : String(r[0]);
}

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  // crypto.subtle exists only in secure contexts (not on a plain-http LAN address).
  if (subtle === undefined) return null;
  const digest = await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface LoadContentOptions {
  /** Directory URL holding `content-manifest.json` (e.g. `new URL('content/', document.baseURI)`). */
  baseUrl: string | URL;
  /** sql.js, initialised (the browser build needs its wasm URL; Node tests pass their own). */
  sql: () => Promise<SqlJsStatic>;
  fetch?: (url: string) => Promise<Response>;
  /** Check the SHA-256 of the file (default true). The Android build skips it: the file comes from the APK, and hashing ~33 MB costs start-up time; the size is still checked. */
  verifyHash?: boolean;
}

/** Fetches the manifest, then the hashed content file, checks size (and hash where possible), and reads it. */
export async function loadContentFile(options: LoadContentOptions): Promise<LoadedContent> {
  const doFetch = options.fetch ?? ((url: string) => fetch(url));
  const base = new URL(options.baseUrl);
  const manifestUrl = new URL(CONTENT_MANIFEST_FILE, base).href;
  // sql.js (wasm compile) in parallel with the manifest and content downloads.
  const sqlP = options.sql();
  sqlP.catch(() => undefined);
  const res = await doFetch(manifestUrl);
  if (!res.ok) throw new Error(`content manifest fetch failed: HTTP ${res.status} at ${manifestUrl} (run "npm run content")`);
  const manifest = (await res.json()) as ContentManifest;
  if (manifest.schemaVersion !== CONTENT_SCHEMA_VERSION) {
    throw new Error(`content schema ${manifest.schemaVersion} is not supported (expected ${CONTENT_SCHEMA_VERSION})`);
  }
  if (!/^content-[0-9a-f]+\.db$/.test(manifest.file)) throw new Error(`bad content file name in manifest: ${manifest.file}`);
  const [SQL, dbRes] = await Promise.all([sqlP, doFetch(new URL(manifest.file, base).href)]);
  if (!dbRes.ok) throw new Error(`content file fetch failed: HTTP ${dbRes.status} for ${manifest.file}`);
  const bytes = new Uint8Array(await dbRes.arrayBuffer());
  if (bytes.byteLength !== manifest.bytes) {
    throw new Error(`content file ${manifest.file} has ${bytes.byteLength} bytes, manifest says ${manifest.bytes}`);
  }
  const hash = options.verifyHash === false ? null : await sha256Hex(bytes);
  if (hash !== null && hash !== manifest.sha256) throw new Error(`content file ${manifest.file} does not match its manifest hash`);
  const db = new SQL.Database(bytes);
  try {
    return readContentFile(db, manifest);
  } catch (e) {
    db.close();
    throw e;
  }
}
