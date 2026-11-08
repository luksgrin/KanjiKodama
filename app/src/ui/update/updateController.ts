/**
 * The Android self-update flow, shared by the start-up check and Settings → "Check for updates
 * now": fetch the latest release, decide (core/update), offer, download with progress, ask once for
 * "Install unknown apps", and hand the APK to Android's installer. One store, so the dialog
 * (UpdateDialog.tsx) shows whichever check started it.
 */
import {
  LATEST_RELEASE_URL,
  decideUpdate,
  laterSuppresses,
  parseRelease,
  parseSha256Sums,
  startupCheckDue,
  type UpdateDecision,
} from '../../core/update';
import type { Preferences, PreferenceValue } from '../../core/settings';
import { UpdaterError, type HttpApi, type UpdaterApi } from '../../platform';

/** "Check for a new version at start" (default on). */
export const UPDATE_CHECK_AT_START_KEY = 'update_check_at_start';
/** When the last check ran (epoch ms). */
export const UPDATE_LAST_CHECK_KEY = 'kk_update_last_check';
/** "Later": the version put off, and when. */
export const UPDATE_LATER_VERSION_KEY = 'kk_update_later_version';
export const UPDATE_LATER_AT_KEY = 'kk_update_later_at';

type Offer = Extract<UpdateDecision, { kind: 'offer' }>;
type Notice = Extract<UpdateDecision, { kind: 'notice' }>;

export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'upToDate' }
  | { phase: 'offer'; offer: Offer }
  | { phase: 'notice'; notice: Notice }
  | { phase: 'downloading'; offer: Offer; received: number; total: number }
  /** Installs from this app aren't allowed yet: explain, then open Android's setting. */
  | { phase: 'permission'; offer: Offer; path: string }
  /** Handed to Android's installer, which asks the user to confirm. */
  | { phase: 'installing'; offer: Offer }
  | { phase: 'error'; message: string; pageUrl: string };

export interface UpdateDeps {
  http: HttpApi;
  updater: UpdaterApi;
  /** The running web app's version (`__APP_VERSION__`). */
  appVersion: string;
  now(): number;
  prefs(): Preferences;
  setPreference(key: string, value: PreferenceValue): Promise<void>;
}

const num = (v: PreferenceValue): number => (typeof v === 'number' ? v : 0);

/** Plain words for a refused download or install. */
export function updateErrorMessage(e: unknown): string {
  if (e instanceof UpdaterError) {
    switch (e.code) {
      case 'CHECKSUM': return 'The download was damaged or changed (its checksum doesn\'t match the release). Nothing was installed.';
      case 'SIGNATURE': return 'The download isn\'t signed with KanjiKodama\'s key, so it wasn\'t installed.';
      case 'NOT_THIS_APP': return 'The download isn\'t this app, so it wasn\'t installed.';
      case 'NOT_NEWER': return 'The download isn\'t newer than this app, so it wasn\'t installed.';
      case 'NETWORK': return `The download failed. Check your connection and try again. (${e.message})`;
      case 'PERMISSION': return 'Installing updates isn\'t allowed for KanjiKodama yet.';
      case 'INSTALL': return `Android couldn't install the update. (${e.message})`;
      default: return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

export class UpdateController {
  private state: UpdateState = { phase: 'idle' };
  private readonly listeners = new Set<() => void>();
  private unsubscribeInstall: (() => void) | null = null;

  constructor(private readonly deps: UpdateDeps) {}

  get = (): UpdateState => this.state;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  };

  private set(s: UpdateState): void {
    this.state = s;
    this.listeners.forEach((l) => l());
  }

  /**
   * The start-up check: when switched on and due; a version put off with "Later" stays quiet for a
   * day. First deletes an APK left from an earlier update (Android closes the app mid-install).
   */
  async startupCheck(): Promise<void> {
    await this.deps.updater.cleanup().catch(() => undefined);
    const p = this.deps.prefs();
    const enabled = p[UPDATE_CHECK_AT_START_KEY] !== false;
    if (!startupCheckDue(enabled, num(p[UPDATE_LAST_CHECK_KEY]), this.deps.now())) return;
    await this.check(false);
  }

  /** "Check now" (manual) or the start-up check: fetch the latest release and decide. */
  async check(manual: boolean): Promise<void> {
    if (this.state.phase === 'checking' || this.state.phase === 'downloading' || this.state.phase === 'installing') return;
    if (manual) this.set({ phase: 'checking' });
    let decision: UpdateDecision;
    try {
      const info = await this.deps.updater.info();
      const res = await this.deps.http.request({
        url: info.testReleaseUrl ?? LATEST_RELEASE_URL,
        method: 'GET',
        headers: { Accept: 'application/vnd.github+json' },
        timeoutMs: 20_000,
      });
      await this.deps.setPreference(UPDATE_LAST_CHECK_KEY, this.deps.now());
      const release = res.status === 200 ? parseRelease(res.body) : null;
      if (release === null) throw new Error(res.status === 200 ? 'Unexpected answer from GitHub' : `GitHub answered ${res.status}`);
      decision = decideUpdate(release, this.deps.appVersion, info.appId);
    } catch (e) {
      // A start-up check stays silent (offline, rate limit); "Check now" says what went wrong.
      if (manual) this.set({ phase: 'error', message: `Couldn't check for updates. ${e instanceof Error ? e.message : String(e)}`, pageUrl: '' });
      return;
    }
    if (decision.kind === 'none') {
      this.set(manual ? { phase: 'upToDate' } : { phase: 'idle' });
      return;
    }
    if (!manual) {
      const p = this.deps.prefs();
      const later = typeof p[UPDATE_LATER_VERSION_KEY] === 'string' ? (p[UPDATE_LATER_VERSION_KEY] as string) : '';
      if (laterSuppresses(later, num(p[UPDATE_LATER_AT_KEY]), decision.version, this.deps.now())) return;
    }
    this.set(decision.kind === 'offer' ? { phase: 'offer', offer: decision } : { phase: 'notice', notice: decision });
  }

  /** "Later": close, and don't offer this version at start-up for a day. */
  async later(): Promise<void> {
    const s = this.state;
    const version = s.phase === 'offer' ? s.offer.version : s.phase === 'notice' ? s.notice.version : null;
    this.set({ phase: 'idle' });
    if (version !== null) {
      await this.deps.setPreference(UPDATE_LATER_VERSION_KEY, version);
      await this.deps.setPreference(UPDATE_LATER_AT_KEY, this.deps.now());
    }
    await this.deps.updater.cleanup().catch(() => undefined);
  }

  /** Close the dialog (results, errors). */
  dismiss(): void {
    if (this.state.phase === 'downloading') return;
    this.set({ phase: 'idle' });
  }

  /** "Update": the checksum, the download, the one-time permission, then Android's installer. */
  async update(): Promise<void> {
    const s = this.state;
    if (s.phase !== 'offer') return;
    const offer = s.offer;
    this.set({ phase: 'downloading', offer, received: 0, total: offer.apk.size ?? 0 });
    let path: string;
    try {
      const sums = await this.deps.http.request({ url: offer.sumsUrl, method: 'GET', timeoutMs: 20_000 });
      const expected = sums.status === 200 ? parseSha256Sums(sums.body).get(offer.apk.name) : undefined;
      if (expected === undefined) throw new Error(`The release's checksum list has no entry for ${offer.apk.name}.`);
      const done = await this.deps.updater.download(offer.apk.browser_download_url, expected, (received, total) => {
        if (this.state.phase === 'downloading') this.set({ phase: 'downloading', offer, received, total: total > 0 ? total : this.state.total });
      });
      path = done.path;
    } catch (e) {
      this.set({ phase: 'error', message: updateErrorMessage(e), pageUrl: offer.pageUrl });
      return;
    }
    const info = await this.deps.updater.info().catch(() => null);
    if (info !== null && !info.canInstall) {
      this.set({ phase: 'permission', offer, path });
      return;
    }
    await this.install(offer, path);
  }

  /** "Open settings" in the permission explanation; installs when allowed on return. */
  async allowInstalls(): Promise<void> {
    const s = this.state;
    if (s.phase !== 'permission') return;
    let allowed = false;
    try {
      allowed = await this.deps.updater.openInstallSettings();
    } catch {
      allowed = false;
    }
    if (!allowed) return; // stays on the explanation; the user can try again or close
    await this.install(s.offer, s.path);
  }

  private async install(offer: Offer, path: string): Promise<void> {
    this.unsubscribeInstall?.();
    this.unsubscribeInstall = this.deps.updater.onInstallStatus((st) => {
      if (st.status === 'cancelled') {
        // Back on the offer: the user may try again.
        this.set({ phase: 'offer', offer });
      } else if (st.status === 'failed') {
        this.set({ phase: 'error', message: `Android couldn't install the update.${st.message ? ` (${st.message})` : ''}`, pageUrl: offer.pageUrl });
        void this.deps.updater.cleanup().catch(() => undefined);
      }
    });
    this.set({ phase: 'installing', offer });
    try {
      await this.deps.updater.install(path);
    } catch (e) {
      this.set({ phase: 'error', message: updateErrorMessage(e), pageUrl: offer.pageUrl });
      void this.deps.updater.cleanup().catch(() => undefined);
    }
  }
}
