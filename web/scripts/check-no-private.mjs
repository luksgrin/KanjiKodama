// Leak check: fails when WaniKani-derived data (internal use only) is where it must never be.
//
// Usage (from web/):
//   node scripts/check-no-private.mjs              the repository's tracked files (git ls-files), minus web/test/golden/
//   node scripts/check-no-private.mjs --dir dist   also a build output (every file, ignored or not), e.g. before a deploy
//   --no-git                                       skip the tracked-files check (only the --dir ones)
//
// What counts as WaniKani-derived:
// - a file named wk-content.db, anything under wani-data/;
// - tracked: any built content file (content-<hash>.db, content-manifest.json) or anything under web/public/content/;
// - a content-manifest.json whose variant is not "public";
// - an SQLite file whose content_meta says a variant other than "public", or with a `subject` table holding
//   WaniKani ids (below 100000; the extra kanji and words start there);
// - any file containing WaniKani content URLs (files.wanikani.com audio, wanikani.com/radicals|kanji|vocabulary/ pages).
//
// web/test/golden/ is excluded from the tracked-files check: the golden fixtures are the owner's call.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = resolve(webDir, '..');
const EXCLUDED_TRACKED = ['web/test/golden/'];
const MARKERS = ['files.wanikani.com/', 'wanikani.com/radicals/', 'wanikani.com/kanji/', 'wanikani.com/vocabulary/'];
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');
const BUILT_CONTENT = /^content-[0-9a-f]+\.db$/;

const args = process.argv.slice(2);
const dirs = [];
let git = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dir') dirs.push(resolve(args[++i] ?? ''));
  else if (args[i] === '--no-git') git = false;
  else {
    console.error(`unknown argument: ${args[i]}`);
    process.exit(2);
  }
}

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const problems = [];

function sqliteProblems(bytes) {
  const out = [];
  let db;
  try {
    db = new SQL.Database(bytes);
    const tables = new Set(db.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values.map((r) => r[0]) ?? []);
    if (tables.has('content_meta')) {
      const v = db.exec("SELECT value FROM content_meta WHERE key = 'variant'")[0]?.values[0]?.[0];
      if (v !== 'public') out.push(`content file of variant "${v}" (WaniKani content)`);
    }
    if (tables.has('subject')) {
      const n = db.exec('SELECT COUNT(*) FROM subject WHERE id < 100000')[0]?.values[0]?.[0] ?? 0;
      if (n > 0) out.push(`subject table with ${n} WaniKani ids`);
    }
  } catch (e) {
    out.push(`unreadable SQLite file (${e instanceof Error ? e.message : e})`);
  } finally {
    db?.close();
  }
  return out;
}

/** @param {string} path absolute; @param {string} shown; @param {boolean} tracked */
function checkFile(path, shown, tracked) {
  const name = path.split(sep).pop();
  const posix = shown.split(sep).join('/');
  const found = [];
  if (name === 'wk-content.db') found.push('WaniKani content DB');
  if (posix.includes('wani-data/')) found.push('under wani-data/ (WaniKani data)');
  if (tracked && (BUILT_CONTENT.test(name) || name === 'content-manifest.json' || posix.startsWith('web/public/content/'))) {
    found.push('built content is never committed');
  }
  const bytes = readFileSync(path);
  if (name === 'content-manifest.json') {
    try {
      const variant = JSON.parse(bytes.toString('utf8')).variant;
      if (variant !== 'public') found.push(`content manifest of variant "${variant}" (WaniKani content)`);
    } catch {
      found.push('unreadable content manifest');
    }
  }
  if (bytes.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) found.push(...sqliteProblems(bytes));
  for (const m of MARKERS) {
    if (bytes.includes(m)) {
      found.push(`contains WaniKani content URLs (${m})`);
      break;
    }
  }
  for (const f of found) problems.push(`${shown}: ${f}`);
}

function walk(dir, visit) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, visit);
    else if (entry.isFile()) visit(p);
  }
}

let checked = 0;
if (git) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8').split('\0').filter((f) => f !== '' && !EXCLUDED_TRACKED.some((x) => f.startsWith(x)));
  for (const f of files) {
    const p = join(repoRoot, f);
    if (!existsSync(p) || !lstatSync(p).isFile()) continue; // deleted in the work tree, symlink, submodule
    checkFile(p, f, true);
    checked++;
  }
}
for (const dir of dirs) {
  if (!existsSync(dir)) {
    problems.push(`${dir}: does not exist`);
    continue;
  }
  walk(dir, (p) => {
    checkFile(p, relative(process.cwd(), p) || p, false);
    checked++;
  });
}

if (problems.length > 0) {
  console.error(`check-no-private: WaniKani-derived data found (internal use only: never commit, upload or deploy):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-no-private: ${checked} files, no WaniKani-derived data${git ? ' in tracked files' : ''}${dirs.length ? ` or ${dirs.join(', ')}` : ''}.`);
