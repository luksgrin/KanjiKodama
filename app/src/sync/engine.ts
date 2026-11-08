/**
 * The server-mode sync engine: test a connection, get a token through `/v2/migrate`, sync now
 * (user → uploads → collections, in priority order), status for the UI.
 *
 * One sync runs at a time (`syncNow` joins a running one).
 * No background sync: the app calls `syncNow` on open and on resume (open question 3 of the plan).
 */
import { parseApiStudyMaterial } from '../core/answer/synonyms';
import {
  parseApiAssignment,
  parseApiLevelProgression,
  parseApiReviewStatistic,
} from '../core/importer';
import {
  MIGRATE_READ_TIMEOUT,
  MIGRATE_WANIKANI_REJECTED,
  apiErrorBanner,
  apiKeyRejectedBanner,
  canGetUserData,
  cleanSubjectData,
  collectionPath,
  collectionUri,
  couldNotReachMessage,
  currentApiState,
  effectiveMaxLevelGranted,
  levelProgressionRow,
  mergeAssignment,
  mergeReviewStatistic,
  mergeStudyMaterial,
  migrateFailedMessage,
  migrateNotSupportedMessage,
  migrateUnreachableMessage,
  parseMigrateResponse,
  parseServerUser,
  serverLabel,
  syncSteps,
  tokenRejectedMessage,
  updatedAfter,
  userAgent,
  type ApiState,
  type CollectionName,
  type CollectionPage,
  type ServerUser,
  type SyncStep,
} from '../core/server';
import type { HttpApi } from '../platform';
import type { KkDb, LevelProgressionRecord } from '../storage/db';
import { ApiClient, realClock, sharedRateLimiter, type Clock, type CollectionResult, type RateLimiter } from './client';
import { flushQueue, pendingUploads, type FlushResult } from './queue';
import { mergeRows } from './rows';
import { KEYS, ServerStore, type AppMode, type TokenStore } from './store';
import { resetServerData } from './reset';

/** An error whose `message` is shown to the learner as is. */
export class ServerError extends Error {
  constructor(message: string, readonly reason: 'rejected' | 'unreachable' | 'failed' | 'pending' = 'failed') {
    super(message);
    this.name = 'ServerError';
  }
}

export interface EngineDeps {
  kk: KkDb;
  http: HttpApi;
  /** App version for User-Agent (native build). */
  appVersion?: string;
  clock?: Clock;
  limiter?: RateLimiter;
  tokens?: TokenStore;
  /** Tries per call and the pause between them (3, 5 s). Tests shorten them. */
  tries?: number;
  retryDelay?: number;
}

export interface ConnectionTarget {
  http: HttpApi;
  baseUrl: string;
  token: string;
  appVersion?: string;
  clock?: Clock;
  limiter?: RateLimiter;
  tries?: number;
  retryDelay?: number;
}

/**
 * The account behind a token on a server, without changing anything.
 * @throws ServerError "<server> rejected this API token." / "Could not reach <server>. …"
 */
export async function checkConnection(t: ConnectionTarget): Promise<ServerUser> {
  const client = new ApiClient({ ...t });
  const r = await client.get('/v2/user');
  const user = r.kind === 'ok' ? parseServerUser(r.body) : null;
  if (user !== null) return user;
  if (r.kind === 'unauthorized') throw new ServerError(tokenRejectedMessage(t.baseUrl), 'rejected');
  throw new ServerError(couldNotReachMessage(t.baseUrl), 'unreachable');
}

/**
 * An OpenKani-style server copies the WaniKani account once and returns its own token (also when it
 * copied it before: 409). One attempt, no rate limiter.
 */
export async function migrateFromWaniKani(o: { http: HttpApi; baseUrl: string; wkApiKey: string; appVersion?: string }): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (o.http.kind === 'native') headers['User-Agent'] = userAgent(o.appVersion ?? '0');
  let status: number;
  let body: unknown = null;
  try {
    const res = await o.http.request({
      url: `${o.baseUrl}/v2/migrate`, method: 'POST', headers, timeoutMs: MIGRATE_READ_TIMEOUT,
      body: JSON.stringify({ wanikani_api_key: o.wkApiKey }),
    });
    status = res.status;
    body = res.body.trim() === '' ? null : JSON.parse(res.body);
  } catch {
    throw new ServerError(migrateUnreachableMessage(o.baseUrl), 'unreachable');
  }
  const parsed = parseMigrateResponse(status, body);
  if ('token' in parsed) return parsed.token;
  if (status === 401) throw new ServerError(MIGRATE_WANIKANI_REJECTED, 'rejected');
  if (status === 404) throw new ServerError(migrateNotSupportedMessage(o.baseUrl));
  throw new ServerError(migrateFailedMessage(o.baseUrl, status, parsed.error));
}

export interface SyncStatus {
  mode: AppMode;
  baseUrl: string | null;
  /** "WaniKani" or the host. */
  label: string | null;
  apiState: ApiState;
  /** The banner to show, or null (`MainActivity`'s apiErrorView / apiKeyRejectedView). */
  banner: { kind: 'error' | 'rejected'; text: string } | null;
  /** The last failure (technical, e.g. "HTTP 503"); for a details line. */
  lastError: string | null;
  pending: number;
  username: string | null;
  /** Levels the subscription allows (`getUserMaxLevelGranted`). */
  maxLevelGranted: number;
  vacation: boolean;
  lastSyncAt: number;
  syncing: boolean;
}

export interface StepReport {
  step: SyncStep;
  outcome: 'ok' | 'notModified' | 'failed' | 'rejected' | 'skipped';
  count: number;
}

export interface SyncResult {
  ok: boolean;
  apiState: ApiState;
  /** A learner-facing message when not ok (names the server). */
  message: string | null;
  steps: StepReport[];
  uploads: FlushResult | null;
  /** The server's account differs from the one stored: local server data was reset. */
  accountChanged: boolean;
}

export class SyncEngine {
  readonly store: ServerStore;
  private readonly kk: KkDb;
  private readonly http: HttpApi;
  private readonly clock: Clock;
  private readonly limiter: RateLimiter;
  private readonly deps: EngineDeps;
  private running: Promise<SyncResult> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(deps: EngineDeps) {
    this.deps = deps;
    this.kk = deps.kk;
    this.http = deps.http;
    this.clock = deps.clock ?? realClock;
    this.limiter = deps.limiter ?? sharedRateLimiter;
    this.store = new ServerStore(deps.kk, deps.tokens);
  }

  /** Called after every sync and queue change the engine makes (for the UI to re-read `status`). */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  get syncing(): boolean {
    return this.running !== null;
  }

  async status(): Promise<SyncStatus> {
    const now = this.clock.now();
    const [mode, baseUrl, flags, pending, lastError, username, max, vacation] = await Promise.all([
      this.store.mode(), this.store.baseUrl(), this.store.flags(), pendingUploads(this.kk), this.store.lastError(),
      this.store.get<string>(KEYS.username), this.store.maxLevel(), this.store.get<boolean>(KEYS.vacation),
    ]);
    const apiState = currentApiState(flags, now);
    let banner: SyncStatus['banner'] = null;
    if (mode === 'server' && baseUrl !== null) {
      if (apiState === 'API_KEY_REJECTED') banner = { kind: 'rejected', text: apiKeyRejectedBanner(baseUrl) };
      else if (apiState === 'ERROR') banner = { kind: 'error', text: apiErrorBanner(baseUrl) };
    }
    return {
      mode, baseUrl, label: baseUrl === null ? null : serverLabel(baseUrl), apiState, banner, lastError, pending,
      username: typeof username === 'string' ? username : null,
      maxLevelGranted: effectiveMaxLevelGranted(max.stored, max.checkedAt, now),
      vacation: vacation === true,
      lastSyncAt: flags.lastApiSuccess,
      syncing: this.syncing,
    };
  }

  /** A new token after "token rejected" (or a changed one): clears the rejected state; the queue stays. */
  async setToken(token: string): Promise<void> {
    await this.store.tokens.set(token);
    await this.store.setRejected(false);
    this.emit();
  }

  private async client(): Promise<ApiClient | null> {
    const [baseUrl, token] = await Promise.all([this.store.baseUrl(), this.store.token()]);
    if (baseUrl === null || token === null) return null;
    return new ApiClient({
      http: this.http, baseUrl, token, appVersion: this.deps.appVersion, clock: this.clock, limiter: this.limiter,
      tries: this.deps.tries, retryDelay: this.deps.retryDelay,
      validators: { get: (u) => this.store.validators(u), set: (u, v) => this.store.setValidators(u, v) },
    });
  }

  /**
   * Sync now. `manual` (the learner's "Sync now" / retry): clears the error
   * state and ignores upload backoff. Never runs while the token is rejected (`setToken` first).
   * Joins a sync already running.
   */
  syncNow(opts: { manual?: boolean; uploadsOnly?: boolean } = {}): Promise<SyncResult> {
    this.running ??= this.run(opts.manual === true, opts.uploadsOnly === true).finally(() => {
      this.running = null;
      this.emit();
    });
    return this.running;
  }

  /** Only the queue (after answering), with the user check first when the state needs it. */
  flushUploads(opts: { manual?: boolean } = {}): Promise<SyncResult> {
    return this.syncNow({ ...opts, uploadsOnly: true });
  }

  private async run(manual: boolean, uploadsOnly = false): Promise<SyncResult> {
    const result: SyncResult = { ok: false, apiState: 'API_KEY_MISSING', message: null, steps: [], uploads: null, accountChanged: false };
    const baseUrl = await this.store.baseUrl();
    if ((await this.store.mode()) !== 'server' || baseUrl === null) {
      result.message = null;
      result.apiState = currentApiState(await this.store.flags(), this.clock.now());
      return result;
    }
    if (manual) await this.store.setInError(false);
    const finish = async (ok: boolean, message: string | null) => {
      result.ok = ok;
      result.message = message;
      result.apiState = currentApiState(await this.store.flags(), this.clock.now());
      return result;
    };
    const flags = await this.store.flags();
    const state = currentApiState(flags, this.clock.now());
    if (!canGetUserData(state)) {
      if (state === 'API_KEY_REJECTED') return finish(false, apiKeyRejectedBanner(baseUrl));
      if (state === 'API_KEY_MISSING') return finish(false, null);
      return finish(false, apiErrorBanner(baseUrl));
    }
    const client = await this.client();
    if (client === null) return finish(false, null);

    // Uploads need the OK state: the user first unless it is fresh.
    let steps: SyncStep[];
    if (!uploadsOnly) steps = syncSteps(await this.store.cursors(), this.clock.now());
    else steps = state === 'OK' ? ['uploads'] : ['user', 'uploads'];
    for (const step of steps) {
      const report: StepReport = { step, outcome: 'ok', count: 0 };
      result.steps.push(report);
      if (step === 'user') {
        const r = await this.syncUser(client, result);
        report.outcome = r;
        if (r === 'rejected') return finish(false, apiKeyRejectedBanner(baseUrl));
        if (r === 'failed') return finish(false, apiErrorBanner(baseUrl));
        continue;
      }
      if (step === 'uploads') {
        const f = await flushQueue(this.kk, client, () => this.clock.now(), manual);
        result.uploads = f;
        report.count = f.sent;
        if (f.sent > 0) await this.store.markApiSuccess(this.clock.now());
        if (f.stop?.reason === 'rejected') {
          report.outcome = 'rejected';
          await this.store.setRejected(true);
          return finish(false, apiKeyRejectedBanner(baseUrl));
        }
        if (f.stop?.reason === 'failed') {
          report.outcome = 'failed';
          await this.store.setInError(true, f.stop.message);
          return finish(false, apiErrorBanner(baseUrl));
        }
        continue;
      }
      const r = await this.syncCollection(client, step);
      report.outcome = r.kind === 'ok' ? 'ok' : r.kind === 'notModified' ? 'notModified' : r.kind === 'unauthorized' ? 'rejected' : 'failed';
      report.count = r.kind === 'ok' ? r.count : 0;
      if (r.kind === 'unauthorized') {
        await this.store.setRejected(true);
        return finish(false, apiKeyRejectedBanner(baseUrl));
      }
      if (r.kind !== 'ok' && r.kind !== 'notModified') {
        await this.store.setInError(true, 'message' in r ? r.message : r.kind);
        return finish(false, apiErrorBanner(baseUrl));
      }
    }
    // A review that passed an item may unlock more: fetch assignments once more (`setForceLateRefresh`).
    if (result.uploads?.refreshWanted && !uploadsOnly) {
      const r = await this.syncCollection(client, 'assignments');
      result.steps.push({ step: 'assignments', outcome: r.kind === 'ok' ? 'ok' : 'failed', count: r.kind === 'ok' ? r.count : 0 });
    }
    return finish(true, null);
  }

  /** Syncs the user. */
  private async syncUser(client: ApiClient, result: SyncResult): Promise<StepReport['outcome']> {
    const r = await client.get('/v2/user', { conditional: true });
    const now = this.clock.now();
    if (r.kind === 'unauthorized') {
      await this.store.setRejected(true);
      return 'rejected';
    }
    if (r.kind === 'notModified') {
      await this.store.putMany({
        [KEYS.maxLevelCheckedAt]: now, [KEYS.rejected]: false, [KEYS.inError]: false,
        [KEYS.lastApiSuccess]: now, [KEYS.lastUserSync]: now,
      });
      return 'notModified';
    }
    const user = r.kind === 'ok' ? parseServerUser(r.body) : null;
    if (user === null) {
      await this.store.setInError(true, r.kind === 'failed' ? r.message : 'The user response has no data.');
      return 'failed';
    }
    const oldId = await this.store.get<string | null>(KEYS.userId);
    if ((oldId ?? null) !== user.id) {
      // A different account: everything downloaded belongs to the old one (`db.resetDatabase()`).
      if (oldId !== undefined) {
        await resetServerData(this.kk, this.store);
        result.accountChanged = true;
      }
    }
    await this.store.putMany({
      [KEYS.userId]: user.id,
      [KEYS.username]: user.username ?? '',
      userLevel: user.level,
      [KEYS.vacation]: user.vacationStartedAt !== 0,
      [KEYS.maxLevelGranted]: user.maxLevelGranted,
      [KEYS.maxLevelCheckedAt]: now,
      [KEYS.rejected]: false,
      [KEYS.inError]: false,
      [KEYS.lastError]: null,
      [KEYS.lastApiSuccess]: now,
      [KEYS.lastUserSync]: now,
    });
    return 'ok';
  }

  /** One collection, written page by page. */
  private async syncCollection(client: ApiClient, name: CollectionName): Promise<CollectionResult> {
    const start = this.clock.now();
    const uri = collectionUri(collectionPath(name), updatedAfter(await this.store.cursors(), name));
    const srs: unknown[] = [];
    let r: CollectionResult;
    try {
      r = await client.collection(uri, (page) => this.writePage(name, page, srs), { conditional: name === 'spaced_repetition_systems' });
    } catch (e) {
      // A malformed entity (Jackson would throw): the whole call fails, like `collectionApiCall`.
      r = { kind: 'failed', status: 'badJson', message: e instanceof Error ? e.message : String(e) };
    }
    if (r.kind === 'ok' || r.kind === 'notModified') {
      // The old list stays until the new one is complete.
      if (name === 'spaced_repetition_systems' && r.kind === 'ok') await this.store.set(KEYS.srsSystems, srs);
      await this.store.setCursor(name, start);
      await this.store.markApiSuccess(this.clock.now());
    }
    return r;
  }

  private async writePage(name: CollectionName, page: CollectionPage, srs: unknown[]): Promise<void> {
    const kk = this.kk;
    switch (name) {
      case 'subjects':
        await kk.serverSubjects.bulkPut(page.items.map((e) => ({ id: e.id, object: e.object, dataUpdatedAt: e.dataUpdatedAt, data: cleanSubjectData(e.data) })));
        return;
      case 'assignments':
        await mergeRows(kk, page.items.map(parseApiAssignment), (a) => a.subjectId, mergeAssignment);
        return;
      case 'review_statistics':
        await mergeRows(kk, page.items.map(parseApiReviewStatistic), (s) => s.subjectId, mergeReviewStatistic);
        return;
      case 'study_materials':
        await mergeRows(kk, page.items.map(parseApiStudyMaterial), (m) => m.subjectId, mergeStudyMaterial);
        return;
      case 'level_progressions':
        await kk.levelProgression.bulkPut(page.items.map((e) => levelProgressionRow(parseApiLevelProgression(e)) as LevelProgressionRecord));
        return;
      case 'spaced_repetition_systems':
        for (const e of page.items) srs.push({ id: e.id, ...e.data });
        return;
    }
  }
}
