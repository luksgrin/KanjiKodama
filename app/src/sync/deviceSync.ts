/**
 * The app controller's server-mode and device glue (`createAppController` creates one):
 *
 * - server mode: the `SyncEngine` (created when `state.mode` is 'server'), its content (the
 *   downloaded subjects, `loadServerContent`), the session report hook (predict locally, queue,
 *   send after the write is saved), syncs on start and resume with the learner reloaded afterwards;
 * - the token store (platform secrets, with the move from the old `state` row);
 * - on resume: `tick`, re-count, notifications rescheduled, sync (server mode); on pause:
 *   notifications rescheduled; after writes, syncs and lifecycle events: the home-screen widget's
 *   counts (Android);
 * - background sync (Android): the periodic worker on in server mode with "Allow background sync";
 * - auto-download audio (Android, `auto_download_audio`): the timeline scan every 12 hours (start,
 *   resume, after a sync) and a new session's subjects (after writes), see `audioScan.ts`.
 *
 * Everything device-related is fire-and-forget: a failure never breaks a write or start-up.
 */
import type { AppState } from '../app/appController';
import type { Clock as AppClock } from '../app/clock';
import type { LoadedContent } from '../content/contentFile';
import { LOCAL_MAX_LEVEL_GRANTED } from '../core/dashboard';
import { planWidget } from '../core/notifications';
import { prefBoolean } from '../core/settings';
import type { AudioApi, Platform } from '../platform';
import { rescheduleReviewNotifications } from '../platform/reviewNotifications';
import type { KkDb } from '../storage/db';
import {
  AUDIO_SCAN_MAX,
  LAST_AUDIO_SCAN_META_KEY,
  audioScanDue,
  autoDownloadAudio,
  canDownloadAudio,
  timelineScanSubjects,
} from './audioScan';
import { realClock } from './client';
import { SyncEngine, type EngineDeps, type SyncResult } from './engine';
import { secretsTokenStore } from './secretsTokenStore';
import { loadServerContent } from './serverContent';
import { createServerReporter, enqueueReports, type ServerReporter } from './serverSession';
import { stateTokenStore, type TokenStore } from './store';

/** `enable_background_sync` (Java default false). */
export const BACKGROUND_SYNC_PREF = 'enable_background_sync';

export interface DeviceSyncDeps {
  kk: KkDb;
  clock: AppClock;
  sync?: Partial<Pick<EngineDeps, 'tries' | 'retryDelay' | 'clock' | 'limiter' | 'appVersion'>>;
  get(): AppState;
  /** Reload the learner from the database (in the controller's write queue). */
  reload(o: { content?: boolean; inPlace?: boolean }): Promise<void>;
  tick(): void;
  /** Widget redraw delay after a write (ms). Default 1 s. */
  widgetDelayMs?: number;
  /** Delay before looking for a new session's audio after a write (ms). Default 1.5 s. */
  sessionAudioDelayMs?: number;
  /** The connection type for the network access rule (default: `navigator.connection.type`). */
  connectionType?(): string | undefined;
}

export interface DeviceSync {
  readonly reporter: ServerReporter;
  /** The content to use in server mode (`bundled` with the downloaded subjects). */
  contentFor(bundled: LoadedContent): Promise<LoadedContent>;
  /** Start-up finished: create the engine, subscribe to the lifecycle, first sync. */
  ready(platform: Platform): void;
  tokens(): TokenStore;
  engine(): SyncEngine | null;
  syncNow(opts?: { manual?: boolean }): Promise<SyncResult | null>;
  flushUploads(opts?: { manual?: boolean }): Promise<SyncResult | null>;
  /** After every saved write (in the write queue). */
  afterWrite(): Promise<void>;
  preferenceChanged(key: string): void;
  /** After `reload()` for a mode switch: engine, background sync, widget follow the new mode. */
  modeChanged(): void;
  /** Re-count now: notifications and widget (also after sessions). */
  refresh(): Promise<void>;
  dispose(): void;
}

/** A sync that wrote something the learner in memory doesn't have yet. */
function wroteData(r: SyncResult): { any: boolean; content: boolean } {
  let any = r.accountChanged || (r.uploads?.sent ?? 0) > 0;
  let content = r.accountChanged;
  for (const s of r.steps) {
    if (s.outcome !== 'ok' || (s.count === 0 && s.step !== 'user')) continue;
    any = true;
    if (s.step === 'subjects' || s.step === 'spaced_repetition_systems') content = true;
  }
  return { any, content };
}

/**
 * Java `AbstractActivity.onResume`: with "Sync on open" (`sync_on_open`, default false), sync when the
 * app comes back after more than 3 minutes away. (Java's first-resume case is the start-up sync.)
 */
export function shouldSyncOnResume(prefs: AppState['prefs'], lastPause: number, now: number): boolean {
  return prefBoolean(prefs, 'sync_on_open', false) && lastPause !== 0 && now - lastPause > 3 * 60_000;
}

export function createDeviceSync(deps: DeviceSyncDeps): DeviceSync {
  const reporter = createServerReporter();
  let platform: Platform | null = null;
  let tokenStore: TokenStore | null = null;
  let engine: SyncEngine | null = null;
  let unsubscribe: (() => void)[] = [];
  let widgetTimer: ReturnType<typeof setTimeout> | undefined;
  let audioTimer: ReturnType<typeof setTimeout> | undefined;
  let audioRunning = false;
  let lastSessionAudio = '';
  let disposed = false;

  const mode = () => deps.get().mode;
  const quiet = (p: Promise<unknown>): void => void p.catch(() => undefined);

  function tokens(): TokenStore {
    if (tokenStore) return tokenStore;
    const secrets = platform?.secrets ?? deps.get().platform?.secrets;
    if (!secrets && !platform && !deps.get().platform) throw new Error('the app is not ready');
    tokenStore = secrets ? secretsTokenStore(secrets, deps.kk) : stateTokenStore(deps.kk);
    return tokenStore;
  }

  function ensureEngine(): SyncEngine | null {
    if (mode() !== 'server' || !platform?.http) {
      engine = null;
      return null;
    }
    engine ??= new SyncEngine({
      kk: deps.kk,
      http: platform.http,
      tokens: tokens(),
      appVersion: deps.sync?.appVersion ?? (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined),
      clock: deps.sync?.clock ?? { now: () => deps.clock.now(), sleep: realClock.sleep },
      limiter: deps.sync?.limiter,
      tries: deps.sync?.tries,
      retryDelay: deps.sync?.retryDelay,
    });
    return engine;
  }

  async function limits(): Promise<{ maxLevel: number; vacationMode: boolean }> {
    if (mode() !== 'server' || !engine) return { maxLevel: LOCAL_MAX_LEVEL_GRANTED, vacationMode: false };
    const st = await engine.status();
    return { maxLevel: st.maxLevelGranted, vacationMode: st.vacation };
  }

  async function updateWidget(): Promise<void> {
    const s = deps.get();
    const w = platform?.widget;
    if (!w?.supported || !s.learner || s.status.kind !== 'ready') return;
    const now = deps.clock.now();
    const { maxLevel } = await limits();
    await w.update(planWidget(s.learner, now, { maxLevel }));
  }

  async function rescheduleNotifications(): Promise<void> {
    const s = deps.get();
    if (!platform?.notifications?.supported || !s.learner || s.status.kind !== 'ready') return;
    await rescheduleReviewNotifications(platform.notifications, s.learner, s.prefs, deps.clock.now(), await limits());
  }

  async function refresh(): Promise<void> {
    await Promise.allSettled([rescheduleNotifications(), updateWidget()]);
  }

  function scheduleWidget(): void {
    if (!platform?.widget?.supported || disposed) return;
    if (widgetTimer !== undefined) clearTimeout(widgetTimer);
    widgetTimer = setTimeout(() => {
      widgetTimer = undefined;
      quiet(updateWidget());
    }, deps.widgetDelayMs ?? 1000);
  }

  function configureBackground(): void {
    const bg = platform?.backgroundSync;
    if (!bg?.supported) return;
    quiet(bg.configure(mode() === 'server' && prefBoolean(deps.get().prefs, BACKGROUND_SYNC_PREF, false)));
  }

  /** The audio API when auto-download may run now (setting on, Android, connection allowed). */
  function audioForAutoDownload(): AudioApi | null {
    const s = deps.get();
    const audio = platform?.audio;
    if (!platform?.capabilities.audioDownload || !audio?.downloadSubjects || !s.learner || s.status.kind !== 'ready') return null;
    if (!autoDownloadAudio(s.prefs)) return null;
    const nav = globalThis.navigator as (Navigator & { connection?: { type?: string } }) | undefined;
    const type = deps.connectionType ? deps.connectionType() : nav?.connection?.type;
    return canDownloadAudio(s.prefs, type, nav?.onLine !== false) ? audio : null;
  }

  /** One download at a time (Java's one task queue); a scan while one runs is skipped. */
  async function downloadAudio(audio: AudioApi, ids: readonly number[]): Promise<boolean> {
    if (audioRunning) return false;
    if (ids.length === 0) return true;
    audioRunning = true;
    try {
      return !(await audio.downloadSubjects!(ids, AUDIO_SCAN_MAX)).aborted;
    } finally {
      audioRunning = false;
    }
  }

  /** `LiveTimeLine.updateLocal`'s audio scan, at most every 12 hours. */
  async function timelineAudioScan(): Promise<void> {
    const audio = audioForAutoDownload();
    if (!audio) return;
    const now = deps.clock.now();
    const last = (await deps.kk.meta.get(LAST_AUDIO_SCAN_META_KEY))?.value;
    if (!audioScanDue(typeof last === 'number' ? last : 0, now)) return;
    const o = await limits();
    const s = deps.get();
    if (!s.learner) return;
    // The scan time is kept once the downloads ran (not while the catalog is still loading).
    if (await downloadAudio(audio, timelineScanSubjects(s.learner, s.prefs, now, o))) {
      await deps.kk.meta.put({ key: LAST_AUDIO_SCAN_META_KEY, value: now });
    }
  }

  /** `Session.startNewSession`'s download: the subjects of a session not seen before. */
  async function sessionAudioScan(): Promise<void> {
    const audio = audioForAutoDownload();
    if (!audio) return;
    const ids = (await deps.kk.session.toArray()).filter((r) => r.kind !== 'properties' && r.subjectId > 0).map((r) => r.subjectId);
    const key = ids.join(',');
    if (key === lastSessionAudio) return;
    if (await downloadAudio(audio, ids)) lastSessionAudio = key;
  }

  function scheduleSessionAudio(): void {
    if (disposed || !platform?.capabilities.audioDownload) return;
    if (audioTimer !== undefined) clearTimeout(audioTimer);
    audioTimer = setTimeout(() => {
      audioTimer = undefined;
      quiet(sessionAudioScan());
    }, deps.sessionAudioDelayMs ?? 1500);
  }

  async function afterSync(r: SyncResult): Promise<SyncResult> {
    const wrote = wroteData(r);
    if (wrote.any) await deps.reload({ content: wrote.content, inPlace: true });
    await refresh();
    quiet(timelineAudioScan());
    return r;
  }

  async function syncNow(opts: { manual?: boolean } = {}): Promise<SyncResult | null> {
    const e = ensureEngine();
    if (!e) return null;
    return afterSync(await e.syncNow(opts));
  }

  async function flushUploads(opts: { manual?: boolean } = {}): Promise<SyncResult | null> {
    const e = ensureEngine();
    if (!e) return null;
    return afterSync(await e.flushUploads(opts));
  }

  let lastPause = 0;

  function onResume(): void {
    deps.tick();
    if (mode() === 'server') {
      const syncOnOpen = shouldSyncOnResume(deps.get().prefs, lastPause, deps.clock.now());
      // The background worker may have written while we were away.
      quiet(deps.reload({ content: true, inPlace: true }).then(() => refresh()).then(() => (syncOnOpen ? syncNow() : null)));
    } else {
      quiet(refresh());
    }
    quiet(timelineAudioScan());
    configureBackground();
  }

  function onPause(): void {
    lastPause = deps.clock.now();
    quiet(refresh());
  }

  return {
    reporter,

    async contentFor(bundled) {
      return { ...bundled, content: await loadServerContent(deps.kk, bundled.content) };
    },

    ready(p) {
      platform = p;
      if (unsubscribe.length === 0 && p.lifecycle) {
        unsubscribe = [p.lifecycle.onResume(onResume), p.lifecycle.onPause(onPause)];
      }
      this.modeChanged();
    },

    tokens,
    engine: () => (mode() === 'server' ? ensureEngine() : null),
    syncNow,
    flushUploads,

    async afterWrite() {
      const reports = reporter.drain();
      if (reports.length > 0 && mode() === 'server') {
        await enqueueReports(deps.kk, reports, deps.clock.now());
        quiet(flushUploads());
      }
      scheduleWidget();
      scheduleSessionAudio();
    },

    preferenceChanged(key) {
      if (key === BACKGROUND_SYNC_PREF) configureBackground();
      if (key === 'enable_notifications') quiet(rescheduleNotifications());
    },

    modeChanged() {
      engine = null; // a new mode or connection: start fresh
      configureBackground();
      if (mode() === 'server') quiet(syncNow());
      else quiet(refresh());
      quiet(timelineAudioScan());
    },

    refresh,

    dispose() {
      disposed = true;
      if (widgetTimer !== undefined) clearTimeout(widgetTimer);
      if (audioTimer !== undefined) clearTimeout(audioTimer);
      for (const u of unsubscribe) u();
      unsubscribe = [];
    },
  };
}
