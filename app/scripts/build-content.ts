// Builds the content file and its manifest (see scripts/content/buildContent.ts, src/content/contentFile.ts).
//
// Usage (from app/): npm run content                       (private variant into public/content/)
//                    node --import ./scripts/ts-hooks.mjs scripts/build-content.ts --variant public --out <dir>
//
// The private variant holds WaniKani content (published with WaniKani's permission, 2026-10-27: the
// APK and GitHub Pages). Its output (public/content/, dist/, the Android assets copy) is git-ignored:
// never commit it.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import initSqlJs from 'sql.js';
import { CONTENT_MANIFEST_FILE, type ContentVariant } from '../src/content/contentFile';
import { buildContent } from './content/buildContent';
import { readInputs } from './content/inputs';

function usage(message: string): never {
  console.error(`${message}\nUsage: build-content.ts --variant private|public --out <dir>`);
  process.exit(2);
}

function parseArgs(argv: string[]): { variant: ContentVariant; out: string } {
  let variant: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--variant') variant = argv[++i];
    else if (a === '--out') out = argv[++i];
    else usage(`unknown argument: ${a}`);
  }
  if (variant !== 'private' && variant !== 'public') usage('--variant must be private or public');
  if (out === undefined) usage('--out is required');
  return { variant, out: resolve(out) };
}

const t0 = performance.now();
const { variant, out } = parseArgs(process.argv.slice(2));
const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) });
const { bytes, manifest } = buildContent(SQL, readInputs(variant));

mkdirSync(out, { recursive: true });
// Only the current file stays: older hashed files and the spike's wk-content.db go.
for (const name of readdirSync(out)) {
  if ((/^content-[0-9a-f]+\.db$/.test(name) && name !== manifest.file) || name === 'wk-content.db') rmSync(join(out, name));
}
writeFileSync(join(out, manifest.file), bytes);
writeFileSync(join(out, CONTENT_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);

const c = manifest.counts;
console.log(
  `content (${variant}): ${manifest.file}, ${(bytes.byteLength / 1e6).toFixed(1)} MB, ${c.subjects} subjects`
  + ` (${c.wanikaniSubjects} WaniKani, ${c.extraSubjects} extra), ${c.jlptLevels} JLPT levels,`
  + ` ${((performance.now() - t0) / 1000).toFixed(1)} s -> ${out}`,
);
if (variant === 'private') console.log('Private WaniKani content: never commit it.');
