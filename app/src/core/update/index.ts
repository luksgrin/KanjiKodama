/**
 * The Android app's self-update decisions: which GitHub release to offer, which of its assets to
 * install, the checksum to expect, and when to check. Pure: the release JSON, the running version
 * and the times come in as arguments; the platform layer fetches, downloads and installs.
 *
 * A release is `v<major>.<minor>.<patch>` with these assets (the release workflow):
 * `kanjikodama-<v>.apk` (app.kanjikodama.wk), `kanjikodama-<v>-web.apk` (the side-by-side
 * app.kanjikodama.wk.web), `kanjikodama-<v>-pwa.zip` and `SHA256SUMS`.
 */

/** GitHub's "latest release" endpoint (drafts and pre-releases are never "latest"). */
export const LATEST_RELEASE_URL = 'https://api.github.com/repos/luksgrin/KanjiKodama/releases/latest';

/** The release page, for the notice and as the fallback when the in-app update fails. */
export const RELEASES_PAGE_URL = 'https://github.com/luksgrin/KanjiKodama/releases/latest';

/** The checksum list attached to every release. */
export const SHA256SUMS_ASSET = 'SHA256SUMS';

/** At most one automatic check per this long (start-up checks). */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface Version {
  major: number;
  minor: number;
  patch: number;
}

const VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** `1.2.3` or `v1.2.3`; null for anything else (pre-release and build suffixes included). */
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

/** The fields of GitHub's release JSON this module reads. */
export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

export interface Release {
  tag_name: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: readonly ReleaseAsset[];
}

/** Parses GitHub's release JSON; null when it isn't one. */
export function parseRelease(text: string): Release | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const r = data as Record<string, unknown>;
  if (typeof r.tag_name !== 'string') return null;
  const assets: ReleaseAsset[] = [];
  if (Array.isArray(r.assets)) {
    for (const a of r.assets as unknown[]) {
      if (typeof a !== 'object' || a === null) continue;
      const { name, browser_download_url: url, size } = a as Record<string, unknown>;
      if (typeof name !== 'string' || typeof url !== 'string') continue;
      assets.push({ name, browser_download_url: url, ...(typeof size === 'number' ? { size } : {}) });
    }
  }
  return {
    tag_name: r.tag_name,
    ...(typeof r.html_url === 'string' ? { html_url: r.html_url } : {}),
    draft: r.draft === true,
    prerelease: r.prerelease === true,
    assets,
  };
}

/** The APK this installed app updates from: the side-by-side app has its own asset. */
export function apkAssetName(version: string, appId: string): string {
  return appId.endsWith('.web') ? `kanjikodama-${version}-web.apk` : `kanjikodama-${version}.apk`;
}

export type UpdateDecision =
  | { kind: 'none' }
  /** A newer major version, or no checksum list: say so and link to the release page. */
  | { kind: 'notice'; version: string; pageUrl: string; reason: 'major' | 'manual' }
  /** A newer version of the same major: download and install in the app. */
  | { kind: 'offer'; version: string; pageUrl: string; apk: ReleaseAsset; sumsUrl: string };

/**
 * What to do about `release` for the app running `current` with application id `appId`. Newer
 * same-major releases are offered in the app when they carry this app's APK and the checksum list;
 * a newer major version (or a release without them) only gets a notice with the release page.
 * Drafts, pre-releases, malformed tags and versions not newer than `current`: nothing.
 */
export function decideUpdate(release: Release, current: string, appId: string): UpdateDecision {
  if (release.draft === true || release.prerelease === true) return { kind: 'none' };
  const latest = parseVersion(release.tag_name);
  const running = parseVersion(current);
  if (latest === null || running === null || compareVersions(latest, running) <= 0) return { kind: 'none' };
  const version = formatVersion(latest);
  const pageUrl = release.html_url ?? RELEASES_PAGE_URL;
  if (latest.major !== running.major) return { kind: 'notice', version, pageUrl, reason: 'major' };
  const assets = release.assets ?? [];
  const apk = assets.find((a) => a.name === apkAssetName(version, appId));
  const sums = assets.find((a) => a.name === SHA256SUMS_ASSET);
  if (apk === undefined || sums === undefined) return { kind: 'notice', version, pageUrl, reason: 'manual' };
  return { kind: 'offer', version, pageUrl, apk, sumsUrl: sums.browser_download_url };
}

/**
 * `sha256sum` output (`<64 hex>  <name>`, or `<hex> *<name>` in binary mode) as name → lower-case
 * hash. Lines that aren't checksums are skipped.
 */
export function parseSha256Sums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim());
    if (m !== null) sums.set(m[2]!.trim(), m[1]!.toLowerCase());
  }
  return sums;
}

/** Whether the start-up check is due: switched on, and the last check is at least a day old. */
export function startupCheckDue(enabled: boolean, lastCheckAt: number, now: number): boolean {
  if (!enabled) return false;
  return !(lastCheckAt > 0 && now >= lastCheckAt && now - lastCheckAt < CHECK_INTERVAL_MS);
}

/**
 * "Later" on the offer of `version`: the start-up check doesn't offer that version again until a
 * day has passed. A newer version is offered right away; "Check now" ignores it.
 */
export function laterSuppresses(snoozedVersion: string, snoozedAt: number, version: string, now: number): boolean {
  return snoozedVersion === version && now >= snoozedAt && now - snoozedAt < CHECK_INTERVAL_MS;
}
