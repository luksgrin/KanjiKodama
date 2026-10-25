/** A fake `HttpApi` (no network), a fake clock and the hand-written API v2 fixtures. */
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { HttpNetworkError, type HttpApi, type HttpRequest, type HttpResponse } from '../../src/platform';
import { RateLimiter, type Clock } from '../../src/sync/client';
import { KkDb } from '../../src/storage/db';

export const BASE = 'https://kk.example.test';

export function fixture(name: string): unknown {
  // String paths only: under jsdom the global URL is jsdom's, which fileURLToPath rejects.
  const here = import.meta.url.startsWith('file:') ? resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures') : resolve(process.cwd(), 'test/sync/fixtures');
  return JSON.parse(readFileSync(resolve(here, `${name}.json`), 'utf8'));
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): HttpResponse {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body: JSON.stringify(body) };
}

export const ok = (name: string, headers: Record<string, string> = {}): HttpResponse => json(200, fixture(name), headers);

type Handler = HttpResponse | 'network' | ((req: HttpRequest) => HttpResponse | 'network');

/**
 * Routes by `METHOD url` (the full URL, query included). A route holds a queue of responses: each
 * call takes the next one, the last one repeats. Unknown routes answer 404.
 */
export class FakeHttp implements HttpApi {
  readonly requests: HttpRequest[] = [];
  private readonly routes = new Map<string, Handler[]>();

  constructor(readonly kind: 'fetch' | 'native' = 'native') {}

  on(method: string, url: string, ...responses: Handler[]): this {
    const full = url.startsWith('http') ? url : BASE + url;
    this.routes.set(`${method} ${full}`, responses);
    return this;
  }

  calls(method: string, url: string): HttpRequest[] {
    const full = url.startsWith('http') ? url : BASE + url;
    return this.requests.filter((r) => r.method === method && r.url === full);
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    const list = this.routes.get(`${req.method} ${req.url}`);
    if (!list || list.length === 0) return json(404, { error: 'Not found', code: 404 });
    const h = list.length > 1 ? list.shift()! : list[0]!;
    const r = typeof h === 'function' ? h(req) : h;
    if (r === 'network') throw new HttpNetworkError('offline');
    return r;
  }
}

/** Time only moves when something sleeps (or `advance` is called). */
export class FakeClock implements Clock {
  readonly sleeps: number[] = [];
  constructor(public t: number) {}
  now(): number {
    return this.t;
  }
  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.t += ms;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export function freshDbName(): string {
  return `kk-sync-${Math.random().toString(36).slice(2)}`;
}

export async function openDb(name = freshDbName()): Promise<KkDb> {
  const kk = new KkDb(name);
  await kk.open();
  return kk;
}

/** 2026-10-25T10:00:00Z. */
export const NOW = Date.UTC(2026, 9, 25, 10, 0, 0);

export function limiterFor(clock: FakeClock): RateLimiter {
  return new RateLimiter(clock);
}

/** Routes for a complete first sync of the fixture account. */
export function firstSyncRoutes(http: FakeHttp): FakeHttp {
  return http
    .on('GET', '/v2/user', ok('user'))
    .on('GET', '/v2/spaced_repetition_systems', ok('spaced_repetition_systems'))
    .on('GET', '/v2/subjects', ok('subjects-page1'))
    .on('GET', 'https://cdn.kk.example.test/v2/subjects?page_after_id=2', ok('subjects-page2'))
    .on('GET', '/v2/assignments', ok('assignments'))
    .on('GET', '/v2/review_statistics', ok('review_statistics'))
    .on('GET', '/v2/study_materials', ok('study_materials'))
    .on('GET', '/v2/level_progressions', ok('level_progressions'));
}
