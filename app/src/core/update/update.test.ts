import { describe, expect, it } from 'vitest';
import {
  CHECK_INTERVAL_MS,
  apkAssetName,
  decideUpdate,
  laterSuppresses,
  parseRelease,
  parseSha256Sums,
  parseVersion,
  startupCheckDue,
  type Release,
} from './index';

const asset = (name: string) => ({ name, browser_download_url: `https://example.test/${name}`, size: 10 });

function release(tag: string, extra: Partial<Release> = {}): Release {
  const v = tag.replace(/^v/, '');
  return {
    tag_name: tag,
    html_url: `https://github.com/luksgrin/KanjiKodama/releases/tag/${tag}`,
    assets: [asset(`kanjikodama-${v}.apk`), asset(`kanjikodama-${v}-web.apk`), asset(`kanjikodama-${v}-pwa.zip`), asset('SHA256SUMS')],
    ...extra,
  };
}

describe('decideUpdate', () => {
  it('offers a newer release of the same major with this app\'s APK and the checksum list', () => {
    const d = decideUpdate(release('v0.6.2'), '0.6.1', 'app.kanjikodama.wk');
    expect(d).toEqual({
      kind: 'offer', version: '0.6.2', pageUrl: 'https://github.com/luksgrin/KanjiKodama/releases/tag/v0.6.2',
      apk: asset('kanjikodama-0.6.2.apk'), sumsUrl: 'https://example.test/SHA256SUMS',
    });
    expect(decideUpdate(release('v0.10.0'), '0.9.9', 'app.kanjikodama.wk').kind).toBe('offer');
  });

  it('picks the side-by-side APK for app.kanjikodama.wk.web', () => {
    const d = decideUpdate(release('v0.7.0'), '0.6.1', 'app.kanjikodama.wk.web');
    expect(d.kind === 'offer' && d.apk.name).toBe('kanjikodama-0.7.0-web.apk');
    expect(apkAssetName('1.2.3', 'app.kanjikodama.wk')).toBe('kanjikodama-1.2.3.apk');
    expect(apkAssetName('1.2.3', 'app.kanjikodama.wk.debug')).toBe('kanjikodama-1.2.3.apk');
  });

  it('only gives a notice for a new major version', () => {
    expect(decideUpdate(release('v1.0.0'), '0.6.1', 'app.kanjikodama.wk')).toEqual({
      kind: 'notice', version: '1.0.0', pageUrl: 'https://github.com/luksgrin/KanjiKodama/releases/tag/v1.0.0', reason: 'major',
    });
  });

  it('falls back to a notice without the APK or the checksum list', () => {
    const noSums = release('v0.6.2', { assets: [asset('kanjikodama-0.6.2.apk')] });
    expect(decideUpdate(noSums, '0.6.1', 'app.kanjikodama.wk')).toMatchObject({ kind: 'notice', reason: 'manual' });
    const noApk = release('v0.6.2', { assets: [asset('SHA256SUMS'), asset('kanjikodama-0.6.2-pwa.zip')] });
    expect(decideUpdate(noApk, '0.6.1', 'app.kanjikodama.wk')).toMatchObject({ kind: 'notice', reason: 'manual' });
  });

  it('does nothing for equal, older, malformed, draft or pre-release versions', () => {
    for (const [tag, current] of [['v0.6.1', '0.6.1'], ['v0.6.0', '0.6.1'], ['v0.9.0', '0.10.0'], ['latest', '0.6.1'], ['v0.7.0-beta', '0.6.1'], ['v0.7', '0.6.1']] as const) {
      expect(decideUpdate(release(tag), current, 'app.kanjikodama.wk'), `${tag} vs ${current}`).toEqual({ kind: 'none' });
    }
    expect(decideUpdate(release('v0.7.0'), 'dev', 'app.kanjikodama.wk')).toEqual({ kind: 'none' });
    expect(decideUpdate(release('v0.7.0', { draft: true }), '0.6.1', 'app.kanjikodama.wk')).toEqual({ kind: 'none' });
    expect(decideUpdate(release('v0.7.0', { prerelease: true }), '0.6.1', 'app.kanjikodama.wk')).toEqual({ kind: 'none' });
  });
});

describe('parseRelease', () => {
  it('reads the fields it needs and skips broken assets', () => {
    const r = parseRelease(JSON.stringify({
      tag_name: 'v0.6.2', html_url: 'https://x.test/r', draft: false, prerelease: false, body: 'notes',
      assets: [{ name: 'SHA256SUMS', browser_download_url: 'https://x.test/s', size: 200, uploader: {} }, { name: 3 }, null],
    }));
    expect(r).toEqual({ tag_name: 'v0.6.2', html_url: 'https://x.test/r', draft: false, prerelease: false, assets: [{ name: 'SHA256SUMS', browser_download_url: 'https://x.test/s', size: 200 }] });
  });

  it('returns null for anything else', () => {
    for (const t of ['', 'not json', '[]', 'null', '{"message":"Not Found"}', '{"tag_name":5}']) expect(parseRelease(t), t).toBeNull();
  });

  it('parses versions strictly', () => {
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion('0.10.0')).toEqual({ major: 0, minor: 10, patch: 0 });
    for (const bad of ['1.2', '1.2.3.4', '01.2.3', '1.2.3-rc1', 'v', '']) expect(parseVersion(bad), bad).toBeNull();
  });
});

describe('parseSha256Sums', () => {
  it('reads sha256sum output in text and binary mode', () => {
    const a = 'a'.repeat(64);
    const b = 'B'.repeat(64);
    const sums = parseSha256Sums(`${a}  kanjikodama-0.6.2.apk\r\n${b} *kanjikodama-0.6.2-web.apk\n\nnot a line\n${'c'.repeat(63)}  short.apk\n`);
    expect([...sums]).toEqual([['kanjikodama-0.6.2.apk', a], ['kanjikodama-0.6.2-web.apk', 'b'.repeat(64)]]);
  });
});

describe('check timing', () => {
  const now = 1_800_000_000_000;

  it('checks at start-up at most once a day, and never when switched off', () => {
    expect(startupCheckDue(true, 0, now)).toBe(true);
    expect(startupCheckDue(true, now - CHECK_INTERVAL_MS + 1, now)).toBe(false);
    expect(startupCheckDue(true, now - CHECK_INTERVAL_MS, now)).toBe(true);
    expect(startupCheckDue(true, now + 60_000, now)).toBe(true); // clock moved back: check
    expect(startupCheckDue(false, 0, now)).toBe(false);
  });

  it('"Later" hides that version for a day; a newer version shows right away', () => {
    expect(laterSuppresses('0.6.2', now - 1000, '0.6.2', now)).toBe(true);
    expect(laterSuppresses('0.6.2', now - CHECK_INTERVAL_MS, '0.6.2', now)).toBe(false);
    expect(laterSuppresses('0.6.2', now - 1000, '0.6.3', now)).toBe(false);
    expect(laterSuppresses('', 0, '0.6.2', now)).toBe(false);
  });
});
