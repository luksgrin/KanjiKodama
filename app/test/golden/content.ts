/**
 * Access to the private content DB from Node tests. `wk-content.db` is git-ignored (WaniKani data),
 * so suites that need it are skipped when it is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import initSqlJs, { type Database } from 'sql.js';
import type { Content } from '../../src/core/content';
import { readContent } from '../../src/content/readContent';
import { mergeExtraContent } from '../../src/content/extraContent';

/** `content/private/wk-content.db` (git-ignored), or `GOLDEN_CONTENT_DB` if set. */
export const CONTENT_DB_PATH =
  process.env.GOLDEN_CONTENT_DB ??
  fileURLToPath(new URL('../../../content/private/wk-content.db', import.meta.url));

export function hasContentDb(): boolean {
  return existsSync(CONTENT_DB_PATH);
}

export const NO_CONTENT_DB_MESSAGE = `content DB not found at ${CONTENT_DB_PATH} (private, not committed): skipped`;

let dbPromise: Promise<Database> | undefined;
let contentPromise: Promise<Content> | undefined;

/** The content DB opened with sql.js (read-only use; shared by all suites of a test file). */
export function contentDb(): Promise<Database> {
  dbPromise ??= (async () => {
    const require = createRequire(import.meta.url);
    const SQL = await initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) });
    return new SQL.Database(readFileSync(CONTENT_DB_PATH));
  })();
  return dbPromise;
}

/** All content as core types (`readContent`), loaded once per test file. */
export function loadContent(): Promise<Content> {
  contentPromise ??= contentDb().then(readContent);
  return contentPromise;
}

/** `content/inputs/extra-kanji.db` (committed open data: the JLPT kanji WaniKani doesn't teach). */
export const EXTRA_DB_PATH = fileURLToPath(new URL('../../../content/inputs/extra-kanji.db', import.meta.url));

let extrasPromise: Promise<Content> | undefined;

/**
 * The content with the extras: WaniKani content plus the extra kanji and words (ids from 100000).
 * The device fixtures were recorded on this.
 */
export function loadContentWithExtras(): Promise<Content> {
  extrasPromise ??= (async () => {
    const base = await loadContent();
    if (!existsSync(EXTRA_DB_PATH)) return base;
    const require = createRequire(import.meta.url);
    const SQL = await initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) });
    const extra = new SQL.Database(readFileSync(EXTRA_DB_PATH));
    try {
      return mergeExtraContent(base, extra);
    } finally {
      extra.close();
    }
  })();
  return extrasPromise;
}
