/**
 * The built content file for the item page tests: `public/content/` when `npm run content` has written
 * it (and its schema is current), otherwise built in memory from the private inputs. Both need the
 * git-ignored `wk-content.db`; suites skip without it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { buildContent } from '../../scripts/content/buildContent';
import { readInputs, WK_CONTENT_PATH } from '../../scripts/content/inputs';
import { CONTENT_MANIFEST_FILE, CONTENT_SCHEMA_VERSION, readContentFile, type ContentManifest, type LoadedContent } from '../../src/content/contentFile';

export const HAS_WK_CONTENT = existsSync(WK_CONTENT_PATH);

const PUBLIC_CONTENT = fileURLToPath(new URL('../../public/content/', import.meta.url));
const require = createRequire(import.meta.url);

let sqlPromise: Promise<SqlJsStatic> | undefined;
export const sqlJs = (): Promise<SqlJsStatic> =>
  (sqlPromise ??= initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) }));

let loaded: Promise<LoadedContent> | undefined;

/** The private content file, opened and read. */
export function loadBuiltContent(): Promise<LoadedContent> {
  loaded ??= (async () => {
    const SQL = await sqlJs();
    const manifestPath = `${PUBLIC_CONTENT}${CONTENT_MANIFEST_FILE}`;
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ContentManifest;
      const file = `${PUBLIC_CONTENT}${manifest.file}`;
      if (manifest.schemaVersion === CONTENT_SCHEMA_VERSION && manifest.variant === 'private' && existsSync(file)) {
        return readContentFile(new SQL.Database(readFileSync(file)), manifest);
      }
    }
    const built = buildContent(SQL, readInputs('private'));
    return readContentFile(new SQL.Database(built.bytes), built.manifest);
  })();
  return loaded;
}
