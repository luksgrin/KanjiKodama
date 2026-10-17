// Copies the private WaniKani content DB into public/content/ (git-ignored via web/.gitignore).
// The DB is internal-use only: never commit, publish or upload it.
import { copyFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../durtles/app/src/main/assets/wk-content.db');
const destDir = resolve(here, '../public/content');
const dest = resolve(destDir, 'wk-content.db');

if (!existsSync(src)) {
  console.error(`Content DB not found at ${src}`);
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`Copied ${(statSync(dest).size / 1e6).toFixed(1)} MB -> ${dest}`);
