import { describe, expect, it } from 'vitest';
import { checkReleaseVersion, compareVersions, parseVersion, versionCode } from '../../scripts/release/version';

const TAGS = ['v0.1.0', 'v0.2.0', 'v0.3.0', 'v0.3.1', 'v0.4.0', 'v0.5.0'];

function error(input: string, pkg: string, tags: readonly string[] = TAGS): string {
  const r = checkReleaseVersion(input, pkg, tags);
  if (r.ok) throw new Error(`expected ${input} to be refused`);
  return r.error;
}

describe('release version', () => {
  it('releases the next version when it matches package.json', () => {
    const r = checkReleaseVersion('0.6.0', '0.6.0', TAGS);
    expect(r).toEqual({ ok: true, version: { major: 0, minor: 6, patch: 0 }, versionCode: 7000, latestTag: 'v0.5.0' });
    expect(checkReleaseVersion('v0.6.0', '0.6.0', TAGS).ok).toBe(true);
    expect(checkReleaseVersion('1.0.0', '1.0.0', []).ok).toBe(true);
  });

  it('refuses a version that differs from package.json', () => {
    expect(error('0.6.1', '0.6.0')).toMatch(/doesn't match app\/package\.json's 0\.6\.0/);
    expect(error('0.5.9', '0.6.0')).toMatch(/doesn't match/);
  });

  it('refuses an old or already released version (regression: versions only grow)', () => {
    expect(error('0.5.0', '0.5.0')).toMatch(/already released \(v0\.5\.0\)/);
    expect(error('0.4.1', '0.4.1')).toMatch(/older than the latest release \(v0\.5\.0\)/);
    expect(error('0.3.0', '0.3.0')).toMatch(/older/);
    // Compared as numbers, not text: 0.10.0 > 0.9.0, and 0.9.0 < 0.10.0.
    expect(checkReleaseVersion('0.10.0', '0.10.0', [...TAGS, 'v0.9.0']).ok).toBe(true);
    expect(error('0.9.0', '0.9.0', [...TAGS, 'v0.10.0'])).toMatch(/older than the latest release \(v0\.10\.0\)/);
  });

  it('ignores tags that are not releases', () => {
    expect(checkReleaseVersion('0.6.0', '0.6.0', [...TAGS, 'wk-content-2026-10-10', 'v9.9', 'vnext']).ok).toBe(true);
  });

  it('refuses malformed versions', () => {
    for (const bad of ['', '0.6', '0.6.0.1', '06.0.0', '0.6.0-beta', 'latest']) {
      expect(error(bad, '0.6.0')).toMatch(/not a version/);
    }
    expect(error('0.6.0', 'x')).toMatch(/package\.json's version "x"/);
  });

  it('derives a versionCode that grows with the version and stays above the installed 1000', () => {
    const order = ['0.6.0', '0.6.1', '0.6.999', '0.7.0', '0.999.999', '1.0.0', '1.2.3', '2.0.0'];
    const codes = order.map((v) => versionCode(parseVersion(v)!));
    expect(codes[0]).toBeGreaterThan(1000);
    for (let i = 1; i < codes.length; i++) {
      expect(compareVersions(parseVersion(order[i]!)!, parseVersion(order[i - 1]!)!)).toBeGreaterThan(0);
      expect(codes[i]).toBeGreaterThan(codes[i - 1]!);
    }
    expect(versionCode(parseVersion('1.2.3')!)).toBe(1_003_003);
    expect(error('0.1000.0', '0.1000.0', [])).toMatch(/at most 999/);
  });
});
