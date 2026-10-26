/**
 * Platform seam: everything that differs between the PWA (web.ts) and the Capacitor Android
 * build (android.ts) goes through this interface. The implementation is chosen at runtime.
 * See ./README.md for what each build does and its limitations.
 */
import { Capacitor } from '@capacitor/core';
import type { AudioCatalog, VoicePreference } from '../core/audio';
import type { ReviewTime } from '../core/notifications';

export type PlatformName = 'web' | 'android';

/** Drives what the UI shows; screens check these instead of `name === 'android'`. */
export interface Capabilities {
  notifications: boolean;
  /** @deprecated Same as `audioDownload` (kept for existing screens). */
  audio: boolean;
  /** Pronunciation audio plays (`audio.play`): both builds; the web build streams, online only. */
  audioPlayback: boolean;
  /** Downloads, per-level status, delete all (`audio.download`/`status`/`deleteAll`): Android only. */
  audioDownload: boolean;
  haptics: boolean;
  backgroundSync: boolean;
  widget: boolean;
  cleartextHttp: boolean;
  legacyMigration: boolean;
  /** Rolling automatic progress backup after each session (Android). False: show the "last saved" reminder. */
  autoBackup: boolean;
  /**
   * The answer field's Android IME flags can be set (`KkWebView`): force ASCII, 'visible password',
   * keyboard language hint, 'no personalized learning'. Browsers have no equivalent.
   */
  imeFlags?: boolean;
}

export type { ReviewTime } from '../core/notifications';
export type { AudioCatalog, VoicePreference } from '../core/audio';

export type NotificationPermission = 'granted' | 'denied' | 'prompt';

/**
 * Review notifications (Android). Plan them with `planReviewNotifications` (core/notifications) or
 * let `rescheduleReviewNotifications` (./reviewNotifications.ts) do it all.
 */
export interface ReviewScheduleOptions {
  now?: number;
  /** Available lessons and reviews now. */
  current?: { lessons: number; reviews: number };
}

export interface NotificationsApi {
  /** False on the web build (known limitation): scheduleReviews() is then a no-op. */
  readonly supported: boolean;
  /** 'prompt' also covers Android's "prompt with rationale". */
  permission(): Promise<NotificationPermission>;
  /** Shows the Android 13+ system prompt when the answer is still open; true when granted. */
  requestPermission(): Promise<boolean>;
  /**
   * Replace the plan of the single review notification (Android: posted or updated in place at each
   * entry's time; past entries dropped, at most 64). `current` (the counts now) updates a shown
   * notification, or clears it when both are 0. Never prompts: without permission it only cancels.
   * Resolves with the number of planned entries.
   */
  scheduleReviews(times: readonly ReviewTime[], options?: ReviewScheduleOptions): Promise<number>;
  /** Cancel every scheduled review notification and clear the shown ones. */
  cancelAll(): Promise<void>;
  /** @deprecated Spike test button only (App.tsx); use scheduleReviews. Rejects on the web build. */
  schedule(at: Date, title: string, body: string): Promise<void>;
}

export interface AudioLevelStatus {
  level: number;
  /** Audio files on disk for this level. */
  files: number;
  bytes: number;
  /** Distinct recordings the content has for this level (null before `setCatalog`). */
  expected: number | null;
}

export interface AudioCacheStatus {
  /** Every level with files or expected recordings, ascending. */
  levels: AudioLevelStatus[];
  files: number;
  bytes: number;
}

export interface AudioDownloadResult {
  downloaded: number;
  failed: number;
  bytes: number;
  /** The signal fired before every file was done. */
  aborted: boolean;
}

/**
 * Pronunciation audio. Android: download into the app's files dir and play from there (or stream).
 * Web: `play` streams the URL with an <audio> element while online; download/status/deleteAll are
 * unsupported there (capability `audioDownload` false).
 */
export interface AudioApi {
  /** True on both builds (playback); check `capabilities.audioDownload` for downloads. */
  readonly supported: boolean;
  /** Which subjects have which recordings; build it with `readAudioCatalog` (src/content/audio.ts). */
  setCatalog(catalog: AudioCatalog | null): void;
  /**
   * Play one recording of the subject (the cached file, else streamed). `reading`: the last matched
   * answer, preferred like the Java app. False when there is no audio or it could not play (not
   * cached and offline).
   */
  play(subjectId: number, pref: VoicePreference, reading?: string | null): Promise<boolean>;
  /** Download the missing files of these levels; `onProgress(done, total)` after each file. */
  download(levels: readonly number[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<AudioDownloadResult>;
  /**
   * `AudioUtil.scheduleDownloadTasks(subjects, maxCount)`: download the missing files of these
   * subjects, at most `maxCount` subjects that miss files (auto-download). Android only.
   */
  downloadSubjects?(subjectIds: readonly number[], maxCount: number, signal?: AbortSignal): Promise<AudioDownloadResult>;
  /** Files and bytes per level. */
  status(): Promise<AudioCacheStatus>;
  deleteAll(): Promise<void>;
}

/** `util/HapticUtil`: onCorrect, onWrong, onRetry; 'tap' for light UI feedback. */
export type HapticKind = 'correct' | 'wrong' | 'retry' | 'tap';

export interface HapticsApi {
  readonly supported: boolean;
  /** Fire and forget; the caller checks the settings (core/settings `hapticFeedbackOnCorrect`/`OnWrong`). */
  feedback(kind: HapticKind): void;
}

export interface LifecycleApi {
  /** App back in the foreground: re-count reviews, sync in server mode. Returns an unsubscribe function. */
  onResume(cb: () => void): () => void;
  /** App going to the background: reschedule notifications, write the auto backup. */
  onPause(cb: () => void): () => void;
  /**
   * Android back button. Handlers run newest first; return true when handled. When none handles it,
   * the WebView history goes back, or the app moves to the background at the start.
   */
  onBackButton?(cb: () => boolean): () => void;
}

/** Android system bars (edge-to-edge). The page itself paints behind them; see README. */
export interface SystemBarsApi {
  /** Icon colours for the app theme: 'dark' theme → light icons, 'light' → dark icons, 'system' follows the device. */
  setTheme(theme: 'light' | 'dark' | 'system'): Promise<void>;
}

export type SaveResult = 'saved' | 'cancelled';

export interface OpenedText {
  /** File name as reported by the picker ('' when unknown). */
  name: string;
  text: string;
}

export interface AutoBackupEntry {
  name: string;
  /** Backup time in ms since the epoch (from the file name, else the file's mtime). */
  at: number;
}

export interface FilesApi {
  /**
   * Hand a text file to the user. Android: system create-document picker (Drive offered);
   * web: share sheet with a file where supported, else a download. Resolves 'cancelled' when the
   * user dismissed the picker/sheet; write errors reject. A download always reports 'saved'
   * (browsers give no signal whether the user kept it).
   */
  saveText(name: string, text: string): Promise<SaveResult>;
  /** Let the user pick a text file; null when cancelled. */
  openText(): Promise<OpenedText | null>;
  /**
   * Hand a text file to another app through the share sheet (Java `ACTION_SEND`, the data
   * import/export screen). Absent: use `saveText`.
   */
  shareText?(name: string, text: string): Promise<SaveResult>;
  /** Android only: write `text` to files/backups/ with a timestamped name and keep the newest 5. */
  writeAutoBackup?(text: string, now?: Date): Promise<AutoBackupEntry>;
  /** Android only: the auto backups, newest first. */
  listAutoBackups?(): Promise<AutoBackupEntry[]>;
}

export interface StorageApi {
  /** Ask the browser to keep our IndexedDB data (navigator.storage.persist()); true when granted. */
  persist(): Promise<boolean>;
  /** Whether persistence is already granted (navigator.storage.persisted()). */
  persisted(): Promise<boolean>;
  /** Origin storage usage and quota in bytes; null when the browser can't tell. */
  estimate(): Promise<{ usage: number; quota: number } | null>;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT';

export interface HttpRequest {
  /** Absolute URL. */
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  /** Request body (JSON text for the API). */
  body?: string;
  /** Read timeout in ms (Java's `setReadTimeout`); implementations pick a default when absent. */
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  /** Header names in lower case. */
  headers: Record<string, string>;
  /** The body as text ('' when there is none). */
  body: string;
}

/** Thrown by `HttpApi.request` when no HTTP response arrived (offline, DNS, TLS, CORS, timeout). */
export class HttpNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HttpNetworkError';
  }
}

/**
 * HTTP for server mode. Resolves with any status (4xx/5xx included); rejects with
 * `HttpNetworkError` only when there is no response.
 */
export interface HttpApi {
  /**
   * 'fetch' (web): the browser sets User-Agent and handles ETag revalidation through its HTTP cache,
   * and extra headers cost a CORS preflight, so the client sends neither. 'native' (Android,
   * CapacitorHttp): no CORS, `http://` LAN servers allowed; the client sets both itself.
   */
  readonly kind: 'fetch' | 'native';
  request(req: HttpRequest): Promise<HttpResponse>;
}

/** Small secrets (the server-mode API token), kept out of the progress database. */
export interface SecretsApi {
  /** 'keystore': Android, encrypted with an Android Keystore key. 'indexeddb': PWA, origin-scoped, not encrypted (known limitation). */
  readonly kind: 'keystore' | 'indexeddb' | 'memory';
  get(key: string): Promise<string | null>;
  /** null deletes. */
  set(key: string, value: string | null): Promise<void>;
}

/** The widget's counts (`SessionWidgetProvider` / `AlertContext`); core `planWidget` builds them. */
export interface WidgetUpdate {
  lessons: number;
  reviews: number;
  /** Next review time (epoch ms, 0: none): the "More at …" footer. */
  nextAt: number;
  /** Later states the widget switches to by itself (at a top of the hour), earliest first. */
  schedule?: { at: number; lessons: number; reviews: number; nextAt: number }[];
}

/** Home-screen widget (Android). */
export interface WidgetApi {
  readonly supported: boolean;
  /** Stores the counts and redraws every widget. */
  update(u: WidgetUpdate): Promise<void>;
  /** Asks the launcher to add a widget; false when it can't. */
  requestPin?(): Promise<boolean>;
}

/** Periodic background sync (Android, server mode). */
export interface BackgroundSyncApi {
  readonly supported: boolean;
  /** Enqueue (true) or cancel (false) the periodic worker. Idempotent. */
  configure(enabled: boolean): Promise<void>;
  status?(): Promise<{ scheduled: boolean; lastRunAt: number; lastResult: string | null }>;
}

export interface Platform {
  readonly name: PlatformName;
  readonly capabilities: Capabilities;
  readonly storage: StorageApi;
  readonly notifications: NotificationsApi;
  readonly audio: AudioApi;
  readonly haptics: HapticsApi;
  readonly lifecycle: LifecycleApi;
  readonly files: FilesApi;
  /** Android only. */
  readonly systemBars?: SystemBarsApi;
  /** Server-mode HTTP: `fetchHttp` (web), `androidHttp` (CapacitorHttp). */
  readonly http: HttpApi;
  readonly secrets: SecretsApi;
  /** Android only (capability `widget`). */
  readonly widget?: WidgetApi;
  /** Android only (capability `backgroundSync`). */
  readonly backgroundSync?: BackgroundSyncApi;
}

let cached: Promise<Platform> | undefined;

/** Server-mode HTTP for this build: `platform.http`. */
export async function getHttp(): Promise<HttpApi> {
  return (await getPlatform()).http;
}

export function getPlatform(): Promise<Platform> {
  cached ??= Capacitor.isNativePlatform()
    ? import('./android').then((m) => m.androidPlatform)
    : import('./web').then((m) => m.webPlatform);
  return cached;
}
