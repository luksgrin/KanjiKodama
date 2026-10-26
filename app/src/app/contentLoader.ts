/**
 * Loads the built content file in the browser / Android WebView: sql.js with its bundled wasm, and
 * `content/content-manifest.json` next to the app (PWA: same origin, cached by the service worker;
 * Android: the bundled web assets). See `content/contentFile.ts` for the format.
 */
import { Capacitor } from '@capacitor/core';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { CONTENT_MANIFEST_FILE, loadContentFile, type LoadedContent } from '../content/contentFile';
import { ContentMissingError } from './errors';

/** Where `npm run content` writes `content-manifest.json` and `content-<hash>.db` (relative to the app). */
export const CONTENT_DIR = 'content/';

let sqlPromise: Promise<SqlJsStatic> | undefined;
export function sqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl });
  return sqlPromise;
}

/**
 * `fetch` that reports a missing manifest clearly: a 404, or the dev server's / host's HTML
 * fallback page instead of JSON.
 */
async function contentFetch(url: string): Promise<Response> {
  const res = await fetch(url);
  if (url.endsWith(CONTENT_MANIFEST_FILE)) {
    const type = res.headers.get('content-type') ?? '';
    if (res.status === 404 || (res.ok && type.includes('text/html'))) {
      throw new ContentMissingError(`no ${CONTENT_MANIFEST_FILE} at ${url}`);
    }
  }
  return res;
}

export function loadBrowserContent(): Promise<LoadedContent> {
  return loadContentFile({ baseUrl: new URL(CONTENT_DIR, document.baseURI), sql: sqlJs, fetch: contentFetch,
    verifyHash: !Capacitor.isNativePlatform() });
}
