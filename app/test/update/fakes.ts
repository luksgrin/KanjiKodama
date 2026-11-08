/** Fakes for the self-update tests: a release on a fake GitHub, and a fake native updater. */
import { vi } from 'vitest';
import { LATEST_RELEASE_URL } from '../../src/core/update';
import { UpdaterError, type InstallStatus, type UpdaterApi, type UpdaterErrorCode, type UpdaterInfo } from '../../src/platform';
import { FakeHttp, json } from '../sync/helpers';

export const SUMS_URL = 'https://github.test/download/v0.6.2/SHA256SUMS';
export const APK_URL = 'https://github.test/download/v0.6.2/kanjikodama-0.6.2.apk';
export const APK_SHA = 'ab'.repeat(32);

export function releaseJson(tag = 'v0.6.2', extra: Record<string, unknown> = {}) {
  const v = tag.replace(/^v/, '');
  return {
    tag_name: tag,
    html_url: `https://github.com/luksgrin/KanjiKodama/releases/tag/${tag}`,
    draft: false,
    prerelease: false,
    assets: [
      { name: `kanjikodama-${v}.apk`, browser_download_url: APK_URL, size: 50 * 1024 * 1024 },
      { name: `kanjikodama-${v}-web.apk`, browser_download_url: `https://github.test/download/${tag}/kanjikodama-${v}-web.apk`, size: 50 * 1024 * 1024 },
      { name: 'SHA256SUMS', browser_download_url: SUMS_URL, size: 300 },
    ],
    ...extra,
  };
}

/** GitHub answering with `release` and its checksum list. */
export function githubHttp(release: unknown = releaseJson()): FakeHttp {
  return new FakeHttp('native')
    .on('GET', LATEST_RELEASE_URL, json(200, release))
    .on('GET', SUMS_URL, { status: 200, headers: {}, body: `${APK_SHA}  kanjikodama-0.6.2.apk\n${'cd'.repeat(32)}  kanjikodama-0.6.2-web.apk\n` });
}

export interface FakeUpdater extends UpdaterApi {
  infoValue: UpdaterInfo;
  downloads: { url: string; sha256: string }[];
  installs: string[];
  failDownload: UpdaterErrorCode | null;
  /** Send an install status as Android would. */
  emit(s: InstallStatus): void;
  allowOnSettings: boolean;
}

export function fakeUpdater(info: Partial<UpdaterInfo> = {}): FakeUpdater {
  const listeners = new Set<(s: InstallStatus) => void>();
  const u: FakeUpdater = {
    infoValue: { appId: 'app.kanjikodama.wk', versionCode: 7001, versionName: '0.6.1', canInstall: true, testReleaseUrl: null, ...info },
    downloads: [],
    installs: [],
    failDownload: null,
    allowOnSettings: true,
    info: vi.fn(async () => ({ ...u.infoValue })),
    async download(url, sha256, onProgress) {
      u.downloads.push({ url, sha256 });
      onProgress?.(10, 100);
      onProgress?.(100, 100);
      if (u.failDownload !== null) throw new UpdaterError(u.failDownload, `refused: ${u.failDownload}`);
      return { path: '/cache/updates/update.apk', versionCode: 7002 };
    },
    openInstallSettings: vi.fn(async () => {
      if (u.allowOnSettings) u.infoValue = { ...u.infoValue, canInstall: true };
      return u.allowOnSettings;
    }),
    install: vi.fn(async (path: string) => {
      u.installs.push(path);
    }),
    onInstallStatus(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    cleanup: vi.fn(async () => undefined),
    emit(s) {
      listeners.forEach((l) => l(s));
    },
  };
  return u;
}
