import { Capacitor } from '@capacitor/core';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { subjectFromRow, type KanjiSubject } from './subject';

export const CONTENT_DB_PATH = 'content/wk-content.db';
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

/** Fetch + open the content DB, and query the level-1 kanji. Every phase is timed. */
export async function loadContent(): Promise<{ db: Database; timings: LoadTimings; kanji: KanjiSubject[] }> {
  const t0 = performance.now();
  const SQL = await sql();
  const t1 = performance.now();
  const url = new URL(CONTENT_DB_PATH, document.baseURI).href;
  const cached = await inSwCache(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Content DB fetch failed: HTTP ${res.status} (did you run "npm run content:spike"?)`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const t2 = performance.now();
  const db = new SQL.Database(buf);
  const t3 = performance.now();
  const kanji = queryKanji(db, 1);
  const t4 = performance.now();
  return {
    db,
    kanji,
    timings: {
      source: Capacitor.isNativePlatform() ? 'app-asset' : cached ? 'sw-cache' : 'network',
      bytes: buf.byteLength,
      wasmMs: t1 - t0,
      fetchMs: t2 - t1,
      openMs: t3 - t2,
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
