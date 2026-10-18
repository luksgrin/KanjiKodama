// Fails if code under src/core/ imports anything outside src/core/ (packages, node: builtins,
// or relative paths leaving the folder). Tests (*.test.ts) are exempt: they never ship.
//
// Usage (from web/): node scripts/check-core-imports.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreDir = join(webDir, 'src', 'core');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// import … from 'x', export … from 'x', import 'x', import('x'), require('x')
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"]+)\1/g;

const problems = [];
for (const file of walk(coreDir)) {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const m of text.matchAll(SPECIFIER)) {
    const spec = m[2];
    const rel = relative(webDir, file).split(sep).join('/');
    if (!spec.startsWith('.')) {
      problems.push(`${rel}: imports '${spec}' (core may only import from src/core)`);
      continue;
    }
    const target = resolve(dirname(file), spec);
    if (target !== coreDir && !target.startsWith(coreDir + sep)) {
      problems.push(`${rel}: imports '${spec}', outside src/core`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('core imports OK');
