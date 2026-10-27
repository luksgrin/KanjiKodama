// Checks a release version (scripts/release/version.ts) and prints its Android versionCode.
// Usage (from app/): node --import ./scripts/ts-hooks.mjs scripts/release-version.ts [version]
//   version   the release's version (default: app/package.json's); must equal package.json's and be
//             higher than every v* tag (run `git fetch --tags` first)
//   --code    print only the versionCode (for scripts)
//   --local   skip the tag check (local builds: scripts/release-android.sh)
// Exits 1 with the reason when the version can't be released. In GitHub Actions it also writes
// `version` and `version_code` to $GITHUB_OUTPUT.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { checkReleaseVersion, formatVersion } from './release/version';

const args = process.argv.slice(2);
const codeOnly = args.includes('--code');
const pkgVersion: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const input = args.find((a) => !a.startsWith('--')) ?? pkgVersion;
const tags = args.includes('--local')
  ? []
  : execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).split('\n').filter((t) => t !== '');

const result = checkReleaseVersion(input, pkgVersion, tags);
if (!result.ok) {
  console.error(`release-version: ${result.error}`);
  process.exit(1);
}
const version = formatVersion(result.version);
if (codeOnly) {
  console.log(result.versionCode);
} else {
  console.log(`release-version: ${version} (versionCode ${result.versionCode}; latest release ${result.latestTag ?? 'none'})`);
}
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nversion_code=${result.versionCode}\n`);
}
