/**
 * Release version rules (the manual release workflow, .github/workflows/release.yml, and
 * scripts/release-android.sh): the version given to a release must be the `version` in
 * app/package.json, and higher than every release tag (`v<major>.<minor>.<patch>`) already made, so a
 * release can't reuse or go back to an old version. The Android versionCode is derived from it, so it
 * grows with the version too.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** `1.2.3` (no `v`, no pre-release or build suffix), or null. */
export function parseVersion(text: string): Version | null {
  const m = VERSION.exec(text.trim());
  if (m === null) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function formatVersion(v: Version): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/** Release tags are `v1.2.3`; other tags are ignored. */
export function tagVersion(tag: string): Version | null {
  return tag.startsWith('v') ? parseVersion(tag.slice(1)) : null;
}

/**
 * The Android versionCode for a version: 1000 + major·1,000,000 + minor·1,000 + patch, so it grows
 * with the version and stays above every earlier build (the highest was 1000, a 0.6.0 built locally
 * before this rule). Minor and patch must stay below 1000.
 */
export function versionCode(v: Version): number {
  if (v.minor > 999 || v.patch > 999) throw new Error(`${formatVersion(v)}: minor and patch must be at most 999 (versionCode)`);
  const code = 1000 + v.major * 1_000_000 + v.minor * 1_000 + v.patch;
  if (code > 2_100_000_000) throw new Error(`${formatVersion(v)}: versionCode ${code} is above Android's limit`);
  return code;
}

export type ReleaseCheck =
  | { ok: true; version: Version; versionCode: number; latestTag: string | null }
  | { ok: false; error: string };

/** Checks a release's version against package.json's and the existing tags. */
export function checkReleaseVersion(input: string, packageVersion: string, tags: readonly string[]): ReleaseCheck {
  const requested = parseVersion(input.replace(/^v/, ''));
  if (requested === null) return { ok: false, error: `"${input}" is not a version like 1.2.3` };
  const pkg = parseVersion(packageVersion);
  if (pkg === null) return { ok: false, error: `app/package.json's version "${packageVersion}" is not a version like 1.2.3` };
  if (compareVersions(requested, pkg) !== 0) {
    return { ok: false, error: `version ${formatVersion(requested)} doesn't match app/package.json's ${formatVersion(pkg)}: bump package.json first` };
  }
  let latest: { tag: string; version: Version } | null = null;
  for (const tag of tags) {
    const v = tagVersion(tag);
    if (v !== null && (latest === null || compareVersions(v, latest.version) > 0)) latest = { tag, version: v };
  }
  if (latest !== null && compareVersions(requested, latest.version) <= 0) {
    const same = compareVersions(requested, latest.version) === 0;
    return {
      ok: false,
      error: `version ${formatVersion(requested)} ${same ? 'was already released' : 'is older than the latest release'} (${latest.tag}): versions can only grow`,
    };
  }
  let code: number;
  try {
    code = versionCode(requested);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return { ok: true, version: requested, versionCode: code, latestTag: latest?.tag ?? null };
}
