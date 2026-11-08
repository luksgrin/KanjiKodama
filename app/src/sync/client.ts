/**
 * The API client over `HttpApi`: GET and POST with retries
 * (`NUM_API_TRIES` tries, `API_RETRY_DELAY` apart), the shared `RateLimiter`, pagination through
 * `pages.next_url`, and conditional GETs (ETag / Last-Modified) on the native build.
 *
 * The client never touches the stored flags; it reports what happened and `engine.ts` records it.
 */
import {
  API_READ_TIMEOUT,
  API_RETRY_DELAY,
  NUM_API_TRIES,
  afterWait,
  apiHeaders,
  apiUrl,
  classifyStatus,
  initialRateLimiter,
  observeHeaders,
  parseCollectionPage,
  pause,
  tryAcquire,
  userAgent,
  type CollectionPage,
  type HttpMethod,
  type RateLimiterState,
} from '../core/server';
import type { HttpApi, HttpResponse } from '../platform';
import type { Validators } from './store';

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** `RateLimiter.getInstance()`: one per app, shared by every client. */
export class RateLimiter {
  private state: RateLimiterState;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly clock: Clock = realClock) {
    this.state = initialRateLimiter(clock.now());
  }

  /** `prepare()`: resolves when a call may go. Calls are serialized in arrival order. */
  prepare(): Promise<void> {
    const run = async () => {
      for (;;) {
        const r = tryAcquire(this.state, this.clock.now());
        if (r.ok) {
          this.state = r.state;
          return;
        }
        await this.clock.sleep(r.waitMs);
        this.state = afterWait(this.state, this.clock.now());
      }
    };
    const next = this.chain.then(run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** `pause()` after a 429. */
  pause(): void {
    this.state = pause(this.state);
  }

  observe(res: HttpResponse): void {
    this.state = observeHeaders(this.state, res.status, res.headers, this.clock.now());
  }
}

export const sharedRateLimiter = new RateLimiter();

/** What one API call (with its retries) came to. */
export type CallResult =
  | { kind: 'ok'; status: number; body: unknown; headers: Record<string, string> }
  | { kind: 'notModified' }
  | { kind: 'unauthorized' }
  /** 422 on POST/PUT: `postApiCall` returns `NullNode` and the task is dropped. */
  | { kind: 'unprocessable'; body: unknown }
  | { kind: 'failed'; status: number | 'network' | 'badJson'; message: string };

export type CollectionResult =
  | { kind: 'ok'; count: number; invalid: number }
  | { kind: 'notModified' }
  | Exclude<CallResult, { kind: 'ok' } | { kind: 'notModified' }>;

export interface ValidatorStore {
  get(url: string): Promise<Validators | undefined>;
  set(url: string, v: Validators | undefined): Promise<void>;
}

export interface ApiClientOptions {
  http: HttpApi;
  baseUrl: string;
  token: string;
  /** For User-Agent (native build only). */
  appVersion?: string;
  clock?: Clock;
  limiter?: RateLimiter;
  /** Conditional GET validators; none: no conditional requests. */
  validators?: ValidatorStore;
  tries?: number;
  retryDelay?: number;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text.trim() === '') return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

export class ApiClient {
  readonly baseUrl: string;
  private readonly http: HttpApi;
  private readonly token: string;
  private readonly clock: Clock;
  private readonly limiter: RateLimiter;
  private readonly ua: string | undefined;
  private readonly validators: ValidatorStore | undefined;
  private readonly tries: number;
  private readonly retryDelay: number;

  constructor(o: ApiClientOptions) {
    this.http = o.http;
    this.baseUrl = o.baseUrl;
    this.token = o.token;
    this.clock = o.clock ?? realClock;
    this.limiter = o.limiter ?? sharedRateLimiter;
    this.ua = o.http.kind === 'native' ? userAgent(o.appVersion ?? '0') : undefined;
    this.validators = o.http.kind === 'native' ? o.validators : undefined;
    this.tries = o.tries ?? NUM_API_TRIES;
    this.retryDelay = o.retryDelay ?? API_RETRY_DELAY;
  }

  /** One attempt (`getApiCall` / `postApiCall`). */
  private async once(method: HttpMethod, uri: string, body: unknown, conditional: boolean): Promise<CallResult> {
    await this.limiter.prepare();
    const url = apiUrl(this.baseUrl, uri);
    const headers = apiHeaders(this.token, { userAgent: this.ua, json: method !== 'GET' });
    const known = conditional && this.validators ? await this.validators.get(url) : undefined;
    if (known?.etag) headers['If-None-Match'] = known.etag;
    if (known?.lastModified) headers['If-Modified-Since'] = known.lastModified;
    let res: HttpResponse;
    try {
      res = await this.http.request({
        url, method, headers, timeoutMs: API_READ_TIMEOUT,
        body: method === 'GET' ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      return { kind: 'failed', status: 'network', message: e instanceof Error ? e.message : String(e) };
    }
    this.limiter.observe(res);
    const cls = classifyStatus(res.status);
    switch (cls) {
      case 'notModified':
        return known ? { kind: 'notModified' } : { kind: 'failed', status: 304, message: 'HTTP 304' };
      case 'unauthorized':
        return { kind: 'unauthorized' };
      case 'tooManyRequests':
        this.limiter.pause();
        return { kind: 'failed', status: 429, message: 'HTTP 429' };
      case 'unprocessable':
        if (method !== 'GET') {
          const p = parseJson(res.body);
          return { kind: 'unprocessable', body: p.ok ? p.value : null };
        }
        return { kind: 'failed', status: 422, message: 'HTTP 422' };
      case 'error':
        return { kind: 'failed', status: res.status, message: `HTTP ${res.status}` };
      case 'ok': {
        const parsed = parseJson(res.body);
        if (!parsed.ok) return { kind: 'failed', status: 'badJson', message: 'The response is not JSON.' };
        if (conditional && this.validators) {
          const etag = res.headers['etag'];
          const lastModified = res.headers['last-modified'];
          await this.validators.set(url, etag || lastModified ? { etag, lastModified } : undefined);
        }
        return { kind: 'ok', status: res.status, body: parsed.value, headers: res.headers };
      }
    }
  }

  /**
   * `getApiCallWithRetry` / `postApiCallWithRetry`: up to `tries` attempts, `retryDelay` apart;
   * a 401 stops at once, as does a 422 on POST/PUT (an answer, not a failure).
   */
  async call(method: HttpMethod, uri: string, body?: unknown, opts: { conditional?: boolean } = {}): Promise<CallResult> {
    let r = await this.once(method, uri, body, opts.conditional === true);
    for (let i = 1; i < this.tries && r.kind === 'failed'; i++) {
      await this.clock.sleep(this.retryDelay);
      r = await this.once(method, uri, body, opts.conditional === true);
    }
    return r;
  }

  get(uri: string, opts: { conditional?: boolean } = {}): Promise<CallResult> {
    return this.call('GET', uri, undefined, opts);
  }

  /**
   * `collectionApiCall`: every page from `uri` on, following the absolute `pages.next_url`.
   * `onPage` runs for each page before the next is fetched (pages already handled stay handled when
   * a later page fails). A body without `data` fails the call.
   */
  async collection(uri: string, onPage: (page: CollectionPage) => Promise<void> | void, opts: { conditional?: boolean } = {}): Promise<CollectionResult> {
    let next: string | null = uri;
    let count = 0;
    let invalid = 0;
    let first = true;
    const seen = new Set<string>();
    while (next !== null) {
      if (seen.has(next)) return { kind: 'failed', status: 'badJson', message: 'The server repeated a page.' };
      seen.add(next);
      const r = await this.get(next, { conditional: first && opts.conditional === true });
      if (r.kind === 'notModified') return r;
      if (r.kind !== 'ok') return r as CollectionResult;
      const page = parseCollectionPage(r.body);
      if (page === null) return { kind: 'failed', status: 'badJson', message: 'The response has no data.' };
      await onPage(page);
      count += page.items.length;
      invalid += page.invalid;
      next = page.nextUrl;
      first = false;
    }
    return { kind: 'ok', count, invalid };
  }
}
