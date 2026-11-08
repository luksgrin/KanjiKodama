import { describe, expect, it } from 'vitest';
import { CHECK_INTERVAL_MS, LATEST_RELEASE_URL } from '../../src/core/update';
import type { Preferences, PreferenceValue } from '../../src/core/settings';
import {
  UPDATE_CHECK_AT_START_KEY,
  UPDATE_LAST_CHECK_KEY,
  UPDATE_LATER_AT_KEY,
  UPDATE_LATER_VERSION_KEY,
  UpdateController,
} from '../../src/ui/update/updateController';
import { FakeHttp, json } from '../sync/helpers';
import { APK_SHA, APK_URL, fakeUpdater, githubHttp, releaseJson } from './fakes';

const T0 = 1_800_000_000_000;

function setup(opts: { http?: FakeHttp; prefs?: Preferences; version?: string; updater?: ReturnType<typeof fakeUpdater> } = {}) {
  const prefs: Record<string, PreferenceValue> = { ...(opts.prefs ?? {}) };
  let now = T0;
  const http = opts.http ?? githubHttp();
  const updater = opts.updater ?? fakeUpdater();
  const c = new UpdateController({
    http,
    updater,
    appVersion: opts.version ?? '0.6.1',
    now: () => now,
    prefs: () => prefs,
    setPreference: async (k: string, v: PreferenceValue) => { prefs[k] = v; },
  });
  return { c, http, updater, prefs, advance: (ms: number) => { now += ms; } };
}

describe('UpdateController', () => {
  it('offers a newer release at start-up, downloads with the checksum from SHA256SUMS, then installs', async () => {
    const { c, http, updater, prefs } = setup();
    const phases: string[] = [];
    c.subscribe(() => phases.push(c.get().phase));
    await c.startupCheck();
    expect(c.get()).toMatchObject({ phase: 'offer', offer: { version: '0.6.2' } });
    expect(prefs[UPDATE_LAST_CHECK_KEY]).toBe(T0);
    expect(http.calls('GET', LATEST_RELEASE_URL)[0]!.headers).toEqual({ Accept: 'application/vnd.github+json' });

    await c.update();
    expect(updater.downloads).toEqual([{ url: APK_URL, sha256: APK_SHA }]);
    expect(updater.installs).toEqual(['/cache/updates/update.apk']);
    expect(c.get().phase).toBe('installing');
    expect(phases).toEqual(['offer', 'downloading', 'downloading', 'downloading', 'installing']);
  });

  it('checks at most once a day at start-up, and not when switched off', async () => {
    const s = setup();
    await s.c.startupCheck();
    await s.c.later();
    s.advance(CHECK_INTERVAL_MS - 1);
    await s.c.startupCheck();
    expect(s.http.calls('GET', LATEST_RELEASE_URL)).toHaveLength(1);
    const off = setup({ prefs: { [UPDATE_CHECK_AT_START_KEY]: false } });
    await off.c.startupCheck();
    expect(off.http.requests).toHaveLength(0);
    expect(off.updater.cleanup).toHaveBeenCalled(); // an APK left by an earlier update is deleted anyway
  });

  it('"Later" keeps that version quiet at start-up for a day; "Check now" still shows it', async () => {
    const s = setup();
    await s.c.startupCheck();
    await s.c.later();
    expect(s.prefs[UPDATE_LATER_VERSION_KEY]).toBe('0.6.2');
    expect(s.prefs[UPDATE_LATER_AT_KEY]).toBe(T0);
    expect(s.updater.cleanup).toHaveBeenCalled();
    s.prefs[UPDATE_LAST_CHECK_KEY] = 0; // force a start-up check
    await s.c.startupCheck();
    expect(s.c.get().phase).toBe('idle');
    await s.c.check(true);
    expect(s.c.get().phase).toBe('offer');
    s.c.dismiss();
    s.advance(CHECK_INTERVAL_MS);
    await s.c.startupCheck();
    expect(s.c.get().phase).toBe('offer');
  });

  it('says "up to date" on Check now, and nothing at start-up', async () => {
    const s = setup({ version: '0.6.2' });
    await s.c.startupCheck();
    expect(s.c.get().phase).toBe('idle');
    await s.c.check(true);
    expect(s.c.get().phase).toBe('upToDate');
  });

  it('gives a notice (no download) for a new major version', async () => {
    const s = setup({ http: githubHttp(releaseJson('v1.0.0')) });
    await s.c.check(true);
    expect(s.c.get()).toMatchObject({ phase: 'notice', notice: { version: '1.0.0', reason: 'major' } });
    await s.c.update();
    expect(s.updater.downloads).toHaveLength(0);
  });

  it('stays silent at start-up when offline or GitHub refuses, and reports it on Check now', async () => {
    const offline = setup({ http: new FakeHttp('native').on('GET', LATEST_RELEASE_URL, 'network') });
    await offline.c.startupCheck();
    expect(offline.c.get().phase).toBe('idle');
    await offline.c.check(true);
    expect(offline.c.get()).toMatchObject({ phase: 'error', message: expect.stringContaining("Couldn't check for updates") });
    const limited = setup({ http: new FakeHttp('native').on('GET', LATEST_RELEASE_URL, json(403, { message: 'API rate limit exceeded' })) });
    await limited.c.check(true);
    expect(limited.c.get()).toMatchObject({ phase: 'error', message: expect.stringContaining('403') });
  });

  it('uses a debug build\'s test release URL', async () => {
    const http = new FakeHttp('native').on('GET', 'http://127.0.0.1:8765/latest.json', json(200, releaseJson()));
    const s = setup({ http, updater: fakeUpdater({ testReleaseUrl: 'http://127.0.0.1:8765/latest.json' }) });
    await s.c.check(true);
    expect(s.c.get().phase).toBe('offer');
  });

  it('refuses without a checksum entry and reports refused downloads plainly', async () => {
    const noSum = setup({ http: githubHttp().on('GET', 'https://github.test/download/v0.6.2/SHA256SUMS', { status: 200, headers: {}, body: '' }) });
    await noSum.c.check(true);
    await noSum.c.update();
    expect(noSum.c.get()).toMatchObject({ phase: 'error', message: expect.stringContaining('no entry for kanjikodama-0.6.2.apk') });
    expect(noSum.updater.downloads).toHaveLength(0);

    for (const [code, text] of [['CHECKSUM', 'checksum'], ['SIGNATURE', 'signed'], ['NOT_NEWER', 'newer'], ['NOT_THIS_APP', 'this app']] as const) {
      const s = setup();
      s.updater.failDownload = code;
      await s.c.check(true);
      await s.c.update();
      expect(s.c.get(), code).toMatchObject({ phase: 'error', message: expect.stringContaining(text), pageUrl: expect.stringContaining('v0.6.2') });
      expect(s.updater.installs).toHaveLength(0);
    }
  });

  it('asks once to allow installs, then installs; stays on the explanation when not allowed', async () => {
    const s = setup({ updater: fakeUpdater({ canInstall: false }) });
    await s.c.check(true);
    await s.c.update();
    expect(s.c.get().phase).toBe('permission');
    s.updater.allowOnSettings = false;
    await s.c.allowInstalls();
    expect(s.c.get().phase).toBe('permission');
    expect(s.updater.installs).toHaveLength(0);
    s.updater.allowOnSettings = true;
    await s.c.allowInstalls();
    expect(s.c.get().phase).toBe('installing');
    expect(s.updater.installs).toEqual(['/cache/updates/update.apk']);
  });

  it('goes back to the offer when the user cancels Android\'s dialog, and shows a failure', async () => {
    const s = setup();
    await s.c.check(true);
    await s.c.update();
    s.updater.emit({ status: 'cancelled' });
    expect(s.c.get().phase).toBe('offer');
    await s.c.update();
    s.updater.emit({ status: 'failed', message: 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' });
    expect(s.c.get()).toMatchObject({ phase: 'error', message: expect.stringContaining('INSTALL_FAILED_UPDATE_INCOMPATIBLE') });
  });
});
