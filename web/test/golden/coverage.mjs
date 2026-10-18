// Golden coverage report: for every fixture in manifest.json, whether a test registers an adapter
// for it (goldenSuite('<glob>', …) in test/golden/*.golden.test.ts) and the pass/fail counts of
// its latest run (test/golden-results/, written by the harness).
//
// Usage (from web/): npx vitest run test/golden; node test/golden/coverage.mjs [--all]
//   --all  list every file (default: only files that are not fully passing)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const goldenDir = fileURLToPath(new URL('.', import.meta.url));
const resultsDir = fileURLToPath(new URL('../golden-results/', import.meta.url));
const manifest = JSON.parse(readFileSync(join(goldenDir, 'manifest.json'), 'utf8'));

// Same rules as harness.ts globToRegExp.
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const globs = [];
for (const name of readdirSync(goldenDir)) {
  if (!name.endsWith('.golden.test.ts')) continue;
  const text = readFileSync(join(goldenDir, name), 'utf8');
  for (const m of text.matchAll(/goldenSuite\b[^(]*\(\s*(['"`])([^'"`]+)\1/g)) {
    globs.push({ test: name, re: globToRegExp(m[2]) });
  }
}

const rows = manifest.files.map((f) => {
  const adapter = globs.find((g) => g.re.test(f.path));
  const resultPath = join(resultsDir, `${f.path.replace(/\//g, '__')}.json`);
  const result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : null;
  const stale = result && statSync(join(goldenDir, f.path)).mtimeMs > Date.parse(result.at);
  return { ...f, adapter: adapter?.test ?? null, result, stale };
});

const all = process.argv.includes('--all');
const pad = (s, n) => String(s).padEnd(n);
const status = (r) => {
  if (!r.adapter) return 'no adapter';
  if (!r.result) return 'adapter, not run';
  const x = r.result;
  const parts = [`${x.passed}/${x.total} pass`];
  if (x.failed) parts.push(`${x.failed} fail`);
  if (x.excepted) parts.push(`${x.excepted} excepted`);
  if (x.skipped) parts.push(`${x.skipped} skipped`);
  if (r.stale) parts.push('STALE (fixture newer than run)');
  return parts.join(', ');
};
const done = (r) => r.result && !r.stale && r.result.failed === 0 && r.result.skipped === 0 &&
  r.result.passed + r.result.excepted === r.cases;

console.log(`${pad('fixture', 62)} ${pad('cases', 7)} status`);
for (const r of rows) {
  if (all || !done(r)) console.log(`${pad(r.path, 62)} ${pad(r.cases, 7)} ${status(r)}`);
}

const total = rows.reduce((n, r) => n + r.cases, 0);
const withAdapter = rows.filter((r) => r.adapter);
const passing = rows.reduce((n, r) => n + (r.result && !r.stale ? r.result.passed + r.result.excepted : 0), 0);
console.log(
  `\n${rows.length} fixture files, ${total} cases. Adapters: ${withAdapter.length} files ` +
  `(${withAdapter.reduce((n, r) => n + r.cases, 0)} cases). Fully passing: ${rows.filter(done).length} files. ` +
  `Cases passing: ${passing} (${((100 * passing) / total).toFixed(2)} %).`,
);
