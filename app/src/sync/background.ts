/**
 * Background sync, the JavaScript half (Android). `BackgroundSyncWorker` (WorkManager, hourly like
 * the Java app's) loads the app's own `index.html?kk-background-sync` in a headless WebView on the
 * same origin (`https://localhost`), so it sees the same IndexedDB. `main.tsx` then runs only this:
 * one sync with the same engine as the app, then the widget's counts and the review notification
 * plan (what `rescheduleReviewNotifications` would schedule), handed back to the worker, which
 * updates the widget and reschedules the notification as the app does after its own syncs.
 *
 * No Capacitor bridge runs in that WebView, so the worker injects `window.KKBackground`: native HTTP
 * (like CapacitorHttp: no CORS, `http://` LAN servers allowed), the token from the Keystore store
 * and `done`. Why not `@capacitor/background-runner`: its JS runtime has no IndexedDB, so it could
 * not read the queue or write the progress (see src/platform/README.md).
 */
import { makeContent } from '../core/content';
import {
  MAX_REVIEW_NOTIFICATIONS,
  enableNotifications,
  planReviewNotifications,
  planWidget,
  reviewNotificationText,
} from '../core/notifications';
import type { Preferences, PreferenceValue } from '../core/settings';
import { HttpNetworkError, type HttpApi, type HttpRequest, type HttpResponse } from '../platform';
import { db as defaultDb, type KkDb } from '../storage/db';
import { hydrateLearnerDb, readSnapshot } from '../storage/progressRepo';
import { SyncEngine, type EngineDeps } from './engine';
import { loadServerContent } from './serverContent';

/** `window.KKBackground` (BackgroundSyncWorker.java, `addJavascriptInterface`). Strings only. */
export interface BackgroundBridge {
  token(): string | null;
  appVersion(): string;
  /** Starts a native request; the answer comes through `window.__kkBgResponse(id, json)`. */
  request(id: string, json: string): void;
  done(json: string): void;
  log?(message: string): void;
}

export interface BackgroundResult {
  ok: boolean;
  skipped?: 'local' | 'no-token';
  message: string | null;
  pending: number;
  widget: ReturnType<typeof planWidget> | null;
  /**
   * The review notification after the sync (`ReviewNotificationsPlugin.schedule`'s arguments), or
   * `enabled: false` to cancel it (`enable_notifications` off). Null: leave it alone.
   */
  notifications: BackgroundNotifications | null;
}

export interface PlannedEntry { at: number; title: string; body: string }

export interface BackgroundNotifications {
  enabled: boolean;
  entries: PlannedEntry[];
  current: (PlannedEntry & { lessons: number; reviews: number }) | null;
}

async function readPrefs(kk: KkDb): Promise<Preferences> {
  const out: Record<string, PreferenceValue> = {};
  for (const r of await kk.settings.toArray()) {
    const v = r.value;
    if (v === null || typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') out[r.key] = v;
  }
  return out;
}

/** `rescheduleReviewNotifications` + `androidNotifications.scheduleReviews`, as data for the worker. */
export function planBackgroundNotifications(
  learner: Parameters<typeof planWidget>[0], prefs: Preferences, now: number, o: { maxLevel: number; vacationMode: boolean },
): BackgroundNotifications {
  if (!enableNotifications(prefs)) return { enabled: false, entries: [], current: null };
  const entries = planReviewNotifications(learner, now, o)
    .filter((t) => t.at > now)
    .slice(0, MAX_REVIEW_NOTIFICATIONS)
    .map((t) => ({ at: t.at, ...reviewNotificationText(t) }));
  const c = planWidget(learner, now, { maxLevel: o.maxLevel, cap: 0 });
  const current = { at: now, lessons: c.lessons, reviews: c.reviews, ...reviewNotificationText({ lessons: c.lessons, totalReviews: c.reviews }) };
  return { enabled: true, entries, current };
}

type Pending = { resolve: (r: HttpResponse) => void; reject: (e: Error) => void };

/** `HttpApi` over the bridge; responses arrive on `target.__kkBgResponse`. */
export function bridgeHttp(bridge: BackgroundBridge, target: Record<string, unknown> = globalThis as never): HttpApi {
  const pending = new Map<string, Pending>();
  let seq = 0;
  target.__kkBgResponse = (id: string, json: string) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    try {
      const r = JSON.parse(json) as { status?: number; headers?: Record<string, string>; body?: string; error?: string };
      if (typeof r.status !== 'number') throw new HttpNetworkError(r.error ?? 'no response');
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.headers ?? {})) headers[k.toLowerCase()] = String(v);
      p.resolve({ status: r.status, headers, body: r.body ?? '' });
    } catch (e) {
      p.reject(e instanceof HttpNetworkError ? e : new HttpNetworkError(String(e)));
    }
  };
  return {
    kind: 'native',
    request(req: HttpRequest) {
      const id = String(++seq);
      return new Promise<HttpResponse>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          bridge.request(id, JSON.stringify(req));
        } catch (e) {
          pending.delete(id);
          reject(new HttpNetworkError(String(e)));
        }
      });
    },
  };
}

/** One background sync. Never throws: failures are in the result. */
export async function runBackgroundSync(bridge: BackgroundBridge, o: { kk?: KkDb; http?: HttpApi; now?: () => number } & Partial<Pick<EngineDeps, 'clock' | 'limiter' | 'tries' | 'retryDelay'>> = {}): Promise<BackgroundResult> {
  const kk = o.kk ?? defaultDb;
  const now = o.now ?? (() => Date.now());
  const result: BackgroundResult = { ok: false, message: null, pending: 0, widget: null, notifications: null };
  try {
    if (!kk.isOpen()) await kk.open();
    const engine = new SyncEngine({
      kk,
      http: o.http ?? bridgeHttp(bridge),
      tokens: { get: async () => bridge.token() || null, set: async () => undefined },
      appVersion: bridge.appVersion(),
      clock: o.clock,
      limiter: o.limiter,
      tries: o.tries,
      retryDelay: o.retryDelay,
    });
    if ((await engine.store.mode()) !== 'server') {
      result.skipped = 'local';
    } else if (!bridge.token()) {
      result.skipped = 'no-token';
    } else {
      // `BackgroundSyncWorker.doWork`: clear a pending API error, then run what is due.
      await engine.store.setInError(false);
      const r = await engine.syncNow();
      result.ok = r.ok;
      result.message = r.message;
    }
    const status = await engine.status();
    result.pending = status.pending;
    // Before the first subject download the counts would all be 0: leave the widget as it is.
    if (status.mode === 'server' && (await kk.serverSubjects.count()) > 0) {
      const content = await loadServerContent(kk, makeContent([], []));
      const learner = hydrateLearnerDb(content, new Map(), await readSnapshot(kk));
      result.widget = planWidget(learner, now(), { maxLevel: status.maxLevelGranted });
      result.notifications = planBackgroundNotifications(learner, await readPrefs(kk), now(), {
        maxLevel: status.maxLevelGranted, vacationMode: status.vacation,
      });
    }
  } catch (e) {
    result.message = e instanceof Error ? e.message : String(e);
  }
  return result;
}

/** Entry point from `main.tsx` in the worker's WebView. */
export async function runFromBridge(): Promise<void> {
  const bridge = (globalThis as { KKBackground?: BackgroundBridge }).KKBackground;
  if (!bridge) return;
  const result = await runBackgroundSync(bridge);
  bridge.done(JSON.stringify(result));
}
