import { Capacitor } from '@capacitor/core';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { loadContentFile, type LoadedContent } from './contentFile';
import { subjectFromRow, type KanjiSubject } from './subject';

/** Where `npm run content` writes `content-manifest.json` and `content-<hash>.db` (relative to the app). */
export const CONTENT_DIR = 'content/';
/** The service-worker cache holding the content file (vite.config.ts `runtimeCaching`). */
export const CONTENT_CACHE = 'kk-content-v1';

export interface LoadTimings {
  /** Where the bytes came from: service-worker cache, network/HTTP, or Capacitor-bundled assets. */
  source: 'sw-cache' | 'network' | 'app-asset';
  bytes: number;
  wasmMs: number;
  fetchMs: number;
  openMs: number;
  queryMs: number;
  totalMs: number;
}

let sqlPromise: Promise<SqlJsStatic> | undefined;
function sql(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl });
  return sqlPromise;
}

async function inSwCache(url: string): Promise<boolean> {
  try {
    if (!('caches' in window)) return false;
    const c = await caches.open(CONTENT_CACHE);
    return (await c.match(url)) !== undefined;
  } catch {
    return false;
  }
}

/** Fetch the manifest and the content file, open and read it, and query the level-1 kanji. Every phase is timed. */
export async function loadContent(): Promise<{ db: Database; timings: LoadTimings; kanji: KanjiSubject[]; loaded: LoadedContent }> {
  const t0 = performance.now();
  await sql();
  const t1 = performance.now();
  let cached = false;
  let bytes = 0;
  let fetchMs = 0;
  const timedFetch = async (url: string): Promise<Response> => {
    const start = performance.now();
    if (url.endsWith('.db')) cached = await inSwCache(url);
    const res = await fetch(url);
    // Read the body here so the fetch phase includes the download.
    const body = await res.arrayBuffer();
    if (url.endsWith('.db')) bytes = body.byteLength;
    fetchMs += performance.now() - start;
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
  const loaded = await loadContentFile({ baseUrl: new URL(CONTENT_DIR, document.baseURI), sql, fetch: timedFetch });
  const t3 = performance.now();
  const kanji = queryKanji(loaded.db, 1);
  const t4 = performance.now();
  return {
    db: loaded.db,
    kanji,
    loaded,
    timings: {
      source: Capacitor.isNativePlatform() ? 'app-asset' : cached ? 'sw-cache' : 'network',
      bytes,
      wasmMs: t1 - t0,
      fetchMs,
      // Opening the DB and reading all subjects, orders and the JLPT kanji (readContentFile).
      openMs: t3 - t1 - fetchMs,
      queryMs: t4 - t3,
      totalMs: t4 - t0,
    },
  };
}

export function queryKanji(db: Database, level: number): KanjiSubject[] {
  const stmt = db.prepare(
    `SELECT id, level, characters, meanings, auxiliaryMeanings, readings
       FROM subject WHERE object = 'kanji' AND level = ? AND (hiddenAt IS NULL OR hiddenAt = 0)
      ORDER BY lessonPosition, id`,
  );
  const out: KanjiSubject[] = [];
  try {
    stmt.bind([level]);
    while (stmt.step()) out.push(subjectFromRow(stmt.getAsObject()));
  } finally {
    stmt.free();
  }
  return out;
}
