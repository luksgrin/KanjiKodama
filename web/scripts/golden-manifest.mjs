// Writes web/test/golden/manifest.json after the golden fixtures were (re)generated from the
// Java app (Tier A: JVM unit tests, Tier B: emulator scenarios). See web/test/golden/README.md.
//
// Usage (from web/): node scripts/golden-manifest.mjs [--check]
//   --check  only verify that every listed file exists with the recorded sha256 and case count,
//            and that no fixture file is unlisted; exit 1 otherwise. Writes nothing.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Bump when the fixture file format (GoldenWriter) or this manifest's shape changes. */
const GENERATOR_VERSION = 1;

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(webDir, '..');
const goldenDir = join(webDir, 'test', 'golden');
const manifestPath = join(goldenDir, 'manifest.json');
const contentDb = join(repoDir, 'durtles', 'app', 'src', 'main', 'assets', 'wk-content.db');
// exceptions.json is the TS port's list of accepted differences (test/golden/harness.ts), not a fixture.
const NOT_FIXTURES = new Set(['manifest.json', 'README.md', 'exceptions.json']);
/** Inputs the Java tests read (not fixtures): listed under `inputs` with their hash, no case count. */
const INPUTS = new Set(['progress/android-export.json']);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim();

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.jsonl?$/.test(name) && !(dir === goldenDir && NOT_FIXTURES.has(name))) out.push(p);
  }
  return out;
}

/** Area and case count of one fixture; throws on a file that does not follow the format. */
function describeFixture(path, buf) {
  const text = buf.toString('utf8');
  if (path.endsWith('.jsonl')) {
    const lines = text.split('\n').filter((l) => l.length > 0);
    const header = JSON.parse(lines[0]);
    for (const l of lines.slice(1)) {
      const c = JSON.parse(l);
      if (typeof c.name !== 'string' || !('input' in c) || !('output' in c)) throw new Error(`${path}: bad case line`);
    }
    return { area: header.area, javaSource: header.javaSource, cases: lines.length - 1 };
  }
  const doc = JSON.parse(text);
  if (Array.isArray(doc.cases)) return { area: doc.area, javaSource: doc.javaSource, cases: doc.cases.length };
  if (Array.isArray(doc.steps)) return { area: doc.area ?? 'scenario', javaSource: doc.javaSource, cases: doc.steps.length };
  throw new Error(`${path}: neither "cases" nor "steps"`);
}

const relPath = (p) => relative(goldenDir, p).split(sep).join('/');
const inputs = walk(goldenDir).filter((p) => INPUTS.has(relPath(p))).map((p) => {
  const buf = readFileSync(p);
  return { path: relPath(p), bytes: buf.length, sha256: sha256(buf) };
});
const files = walk(goldenDir).filter((p) => !INPUTS.has(relPath(p))).map((p) => {
  const buf = readFileSync(p);
  const info = describeFixture(p, buf);
  return { path: relative(goldenDir, p).split(sep).join('/'), area: info.area, javaSource: info.javaSource,
    cases: info.cases, bytes: buf.length, sha256: sha256(buf) };
});

if (process.argv.includes('--check')) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const now = new Map(files.map((f) => [f.path, f]));
  const problems = [];
  for (const f of m.files) {
    const g = now.get(f.path);
    if (!g) problems.push(`missing: ${f.path}`);
    else if (g.sha256 !== f.sha256 || g.cases !== f.cases) problems.push(`changed: ${f.path}`);
    now.delete(f.path);
  }
  for (const p of now.keys()) problems.push(`not in manifest: ${p}`);
  const inputsNow = new Map(inputs.map((f) => [f.path, f]));
  for (const f of m.inputs ?? []) {
    const g = inputsNow.get(f.path);
    if (!g) problems.push(`missing input: ${f.path}`);
    else if (g.sha256 !== f.sha256) problems.push(`changed input: ${f.path}`);
    inputsNow.delete(f.path);
  }
  for (const p of inputsNow.keys()) problems.push(`input not in manifest: ${p}`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`manifest OK: ${m.files.length} files, ${(m.inputs ?? []).length} inputs`);
  process.exit(0);
}

const durtlesDirty = git('status', '--porcelain', '--', 'durtles').length > 0;
const manifest = {
  generatorVersion: GENERATOR_VERSION,
  generatedAt: new Date().toISOString(),
  durtlesCommit: git('rev-parse', 'HEAD'),
  durtlesDirty,
  contentDbSha256: existsSync(contentDb) ? sha256(readFileSync(contentDb)) : null,
  totalCases: files.reduce((n, f) => n + f.cases, 0),
  files,
  inputs,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${manifestPath}: ${files.length} files, ${manifest.totalCases} cases${durtlesDirty ? ' (durtles/ has uncommitted changes: regenerate after committing)' : ''}`);
