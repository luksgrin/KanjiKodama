/** Auto-download audio (`auto_download_audio`): the scan rules and the device glue that runs them. */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioApi, AudioDownloadResult } from '../../src/platform';
import {
  LAST_AUDIO_SCAN_META_KEY,
  audioScanDue,
  autoDownloadAudio,
  canDownloadAudio,
  networkRule,
  timelineScanSubjects,
} from '../../src/sync/audioScan';
import { createLearnerDb, updateProgression } from '../../src/core/progression';
import { emptyProgress } from '../../src/core/progressFile';
import { NO_JLPT, smallContent } from '../progress-storage/helpers';
import { fakePlatform, makeApp, type Harness } from '../app/fixtures';
import { KkDb } from '../../src/storage/db';

const DONE: AudioDownloadResult = { downloaded: 1, failed: 0, bytes: 10, aborted: false };

describe('audio scan rules', () => {
  it('reads the settings with their defaults', () => {
    expect(autoDownloadAudio({})).toBe(true);
    expect(autoDownloadAudio({ auto_download_audio: false })).toBe(false);
    expect(networkRule({})).toBe('DOWNLOAD_WIFI_ONLY');
    expect(networkRule({ network_rule: 'ALWAYS' })).toBe('ALWAYS');
    expect(networkRule({ network_rule: 'junk' })).toBe('DOWNLOAD_WIFI_ONLY');
  });

  it('downloads on Wi-Fi, on mobile data only with "any connection", never offline', () => {
    expect(canDownloadAudio({}, 'wifi')).toBe(true);
    expect(canDownloadAudio({}, undefined)).toBe(true);
    expect(canDownloadAudio({}, 'cellular')).toBe(false);
    expect(canDownloadAudio({ network_rule: 'WIFI_ONLY' }, 'cellular')).toBe(false);
    expect(canDownloadAudio({ network_rule: 'ALWAYS' }, 'cellular')).toBe(true);
    expect(canDownloadAudio({ network_rule: 'ALWAYS' }, 'none')).toBe(false);
    expect(canDownloadAudio({}, 'wifi', false)).toBe(false);
  });

  it('scans every 12 hours', () => {
    expect(audioScanDue(0, 5)).toBe(true);
    expect(audioScanDue(1000, 1000 + 12 * 3600_000)).toBe(false);
    expect(audioScanDue(1000, 1001 + 12 * 3600_000)).toBe(true);
  });

  it('picks the lessons, the upcoming reviews, then the current level', () => {
    const db = createLearnerDb(smallContent(), NO_JLPT);
    db.progress = emptyProgress();
    updateProgression(db, 1000); // level 1: radicals 1, 2 unlocked
    const ids = timelineScanSubjects(db, {}, 2000, { maxLevel: 60, vacationMode: false });
    expect(ids.slice(0, 2)).toEqual([1, 2]);
    expect(ids).toEqual(expect.arrayContaining([10, 11, 100]));
    expect(ids).not.toContain(3); // level 2
    expect(timelineScanSubjects(db, {}, 2000, { maxLevel: 60, vacationMode: true })).toEqual([1, 2, 10, 11, 100]);
  });
});

describe('auto-download in the app (Android)', () => {
  let h: Harness | undefined;
  afterEach(() => h?.app.dispose?.());

  function start() {
    const downloadSubjects = vi.fn(async (_ids: readonly number[], _max: number) => DONE);
    const audio = { supported: true, setCatalog: vi.fn(), play: vi.fn(), download: vi.fn(), status: vi.fn(), deleteAll: vi.fn(), downloadSubjects } as unknown as AudioApi;
    const platform = { ...fakePlatform({}, { audioDownload: true, audio: true, audioPlayback: true }), audio };
    h = makeApp({ platform });
    return { h, downloadSubjects };
  }

  const settle = () => new Promise((r) => setTimeout(r, 50));

  it('scans at start-up, once per 12 hours, and downloads a new session\'s subjects', async () => {
    const { h: harness, downloadSubjects } = start();
    await harness.app.start();
    await settle();
    expect(downloadSubjects).toHaveBeenCalledTimes(1);
    const [ids, max] = downloadSubjects.mock.calls[0]!;
    expect(max).toBe(100);
    expect(ids).toEqual(expect.arrayContaining([1, 2]));
    expect((await harness.app.db.meta.get(LAST_AUDIO_SCAN_META_KEY))?.value).toBe(harness.clock.now());

    await harness.app.reload(); // modeChanged: scans again only after 12 hours
    await settle();
    expect(downloadSubjects).toHaveBeenCalledTimes(1);

    await harness.app.db.session.bulkPut([{ subjectId: 0, kind: 'properties' }, { subjectId: 10, kind: 'item' }, { subjectId: 11, kind: 'item' }]);
    await harness.app.write(() => undefined);
    await new Promise((r) => setTimeout(r, 1700));
    expect(downloadSubjects).toHaveBeenCalledTimes(2);
    expect(downloadSubjects.mock.calls[1]![0]).toEqual([10, 11]);
    await harness.app.write(() => undefined); // same session: nothing new
    await new Promise((r) => setTimeout(r, 1700));
    expect(downloadSubjects).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('does nothing with the setting off', async () => {
    const { h: harness, downloadSubjects } = start();
    const kk = new KkDb(harness.dbName);
    await kk.open();
    await kk.settings.put({ key: 'auto_download_audio', value: false });
    kk.close();
    await harness.app.start();
    await settle();
    await harness.app.db.session.put({ subjectId: 10, kind: 'item' });
    await harness.app.write(() => undefined);
    await new Promise((r) => setTimeout(r, 1700));
    expect(downloadSubjects).not.toHaveBeenCalled();
  }, 10_000);
});
