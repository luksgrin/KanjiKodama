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
  audio: boolean;
  haptics: boolean;
  backgroundSync: boolean;
  widget: boolean;
  cleartextHttp: boolean;
  legacyMigration: boolean;
  /** Rolling automatic progress backup after each session (Android). False: show the "last saved" reminder. */
  autoBackup: boolean;
}

export type { ReviewTime } from '../core/notifications';
export type { AudioCatalog, VoicePreference } from '../core/audio';

export type NotificationPermission = 'granted' | 'denied' | 'prompt';

/**
 * Review notifications (Android). Plan them with `planReviewNotifications` (core/notifications) or
 * let `rescheduleReviewNotifications` (./reviewNotifications.ts) do it all.
 */
export interface NotificationsApi {
  /** False on the web build (known limitation): scheduleReviews() is then a no-op. */
  readonly supported: boolean;
  /** 'prompt' also covers Android's "prompt with rationale". */
  permission(): Promise<NotificationPermission>;
  /** Shows the Android 13+ system prompt when the answer is still open; true when granted. */
  requestPermission(): Promise<boolean>;
  /**
   * Replace everything scheduled with one notification per entry (past entries dropped, at most
   * 64), and clear review notifications already in the shade. Never prompts: without permission it
   * only cancels. Resolves with the number scheduled.
   */
  scheduleReviews(times: readonly ReviewTime[]): Promise<number>;
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

/** Pronunciation audio (Android): download into the app's files dir and play from there. */
export interface AudioApi {
  /** False on the web build (known limitation: WaniKani's audio host sends no CORS headers). */
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
}

let cached: Promise<Platform> | undefined;
let cachedHttp: Promise<HttpApi> | undefined;

/** Server-mode HTTP for this build (kept out of `Platform` until android.ts/web.ts take `http`). */
export function getHttp(): Promise<HttpApi> {
  cachedHttp ??= Capacitor.isNativePlatform()
    ? import('./httpAndroid').then((m) => m.androidHttp)
    : import('./http').then((m) => m.fetchHttp);
  return cachedHttp;
}

export function getPlatform(): Promise<Platform> {
  cached ??= Capacitor.isNativePlatform()
    ? import('./android').then((m) => m.androidPlatform)
    : import('./web').then((m) => m.webPlatform);
  return cached;
}
