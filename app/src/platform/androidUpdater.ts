/**
 * The app's self-update on Android: the local `Updater` plugin (app/android/.../UpdaterPlugin.java)
 * downloads a release APK with progress events, checks its checksum, package, signing key and
 * version, and installs it through Android's PackageInstaller (the user confirms).
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { UpdaterError, type InstallStatus, type UpdaterApi, type UpdaterErrorCode, type UpdaterInfo } from './index';

export interface UpdaterPlugin {
  info(): Promise<UpdaterInfo>;
  download(options: { url: string; sha256: string }): Promise<{ path: string; versionCode: number }>;
  openInstallSettings(): Promise<{ canInstall: boolean }>;
  install(options: { path: string }): Promise<void>;
  cleanup(): Promise<void>;
  addListener(event: 'downloadProgress', cb: (e: { received: number; total: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'installStatus', cb: (e: InstallStatus) => void): Promise<PluginListenerHandle>;
}

export const Updater = registerPlugin<UpdaterPlugin>('Updater');

const CODES: readonly UpdaterErrorCode[] = ['CHECKSUM', 'NOT_THIS_APP', 'SIGNATURE', 'NOT_NEWER', 'NETWORK', 'PERMISSION', 'INSTALL'];

/** The plugin's rejection as an `UpdaterError` (its `code` is one of ours, else UNKNOWN). */
export function toUpdaterError(err: unknown): UpdaterError {
  if (err instanceof UpdaterError) return err;
  const { code, message } = (typeof err === 'object' && err !== null ? err : {}) as { code?: unknown; message?: unknown };
  const c = typeof code === 'string' && (CODES as readonly string[]).includes(code) ? (code as UpdaterErrorCode) : 'UNKNOWN';
  return new UpdaterError(c, typeof message === 'string' && message !== '' ? message : String(err));
}

export function createAndroidUpdater(plugin: UpdaterPlugin = Updater): UpdaterApi {
  return {
    info: () => plugin.info(),
    async download(url, sha256, onProgress) {
      const handle = onProgress ? await plugin.addListener('downloadProgress', (e) => onProgress(e.received, e.total)) : null;
      try {
        return await plugin.download({ url, sha256 });
      } catch (e) {
        throw toUpdaterError(e);
      } finally {
        await handle?.remove();
      }
    },
    async openInstallSettings() {
      return (await plugin.openInstallSettings()).canInstall;
    },
    async install(path) {
      try {
        await plugin.install({ path });
      } catch (e) {
        throw toUpdaterError(e);
      }
    },
    onInstallStatus(cb) {
      const pending = plugin.addListener('installStatus', cb);
      return () => { void pending.then((h) => h.remove()); };
    },
    cleanup: () => plugin.cleanup(),
  };
}

export const androidUpdater: UpdaterApi = createAndroidUpdater();
