/** The API client: headers, pagination, retries, 429 / 401 handling, conditional GETs. */
import { describe, expect, it } from 'vitest';

import { API_REVISION, RATE_LIMIT_DELAY } from '../../src/core/server';
import { ApiClient, type ValidatorStore } from '../../src/sync/client';
import type { Validators } from '../../src/sync/store';
import { BASE, FakeClock, FakeHttp, fixture, json, limiterFor, NOW, ok } from './helpers';

function client(http: FakeHttp, clock = new FakeClock(NOW), validators?: ValidatorStore) {
  return { clock, c: new ApiClient({ http, baseUrl: BASE, token: 'tok-123', appVersion: '1.2.3', clock, limiter: limiterFor(clock), validators }) };
}

function memoryValidators(): ValidatorStore & { map: Map<string, Validators> } {
  const map = new Map<string, Validators>();
  return { map, get: async (u) => map.get(u), set: async (u, v) => { if (v) map.set(u, v); else map.delete(u); } };
}

describe('ApiClient', () => {
  it('sends Bearer, Wanikani-Revision and (native only) User-Agent', async () => {
    const native = new FakeHttp('native').on('GET', '/v2/user', ok('user'));
    await client(native).c.get('/v2/user');
    expect(native.requests[0]!.headers).toEqual({
      Authorization: 'Bearer tok-123', 'Wanikani-Revision': API_REVISION, 'User-Agent': 'KanjiKodama/1.2.3',
    });
    const web = new FakeHttp('fetch').on('POST', '/v2/reviews', ok('review-created'));
    await client(web).c.call('POST', '/v2/reviews', { review: {} });
    expect(web.requests[0]!.headers).toEqual({
      Authorization: 'Bearer tok-123', 'Wanikani-Revision': API_REVISION, 'Content-Type': 'application/json; charset=utf-8',
    });
    expect(web.requests[0]!.body).toBe('{"review":{}}');
  });

  it('follows absolute next_url across pages (even on another host)', async () => {
    const http = new FakeHttp()
      .on('GET', '/v2/subjects', ok('subjects-page1'))
      .on('GET', 'https://cdn.kk.example.test/v2/subjects?page_after_id=2', ok('subjects-page2'));
    const ids: number[] = [];
    const r = await client(http).c.collection('/v2/subjects', (p) => { ids.push(...p.items.map((i) => i.id)); });
    expect(r).toEqual({ kind: 'ok', count: 3, invalid: 0 });
    expect(ids).toEqual([1, 2, 10]);
    expect(http.requests.map((q) => q.url)).toEqual([`${BASE}/v2/subjects`, 'https://cdn.kk.example.test/v2/subjects?page_after_id=2']);
  });

  it('a failed later page fails the call; earlier pages stay handled', async () => {
    const http = new FakeHttp()
      .on('GET', '/v2/subjects', ok('subjects-page1'))
      .on('GET', 'https://cdn.kk.example.test/v2/subjects?page_after_id=2', json(500, { error: 'boom' }));
    const ids: number[] = [];
    const { c } = client(http);
    const r = await c.collection('/v2/subjects', (p) => { ids.push(...p.items.map((i) => i.id)); });
    expect(r).toMatchObject({ kind: 'failed', status: 500 });
    expect(ids).toEqual([1, 2]);
    expect(http.calls('GET', 'https://cdn.kk.example.test/v2/subjects?page_after_id=2')).toHaveLength(3);
  });

  it('429: pauses the rate limiter, waits, retries and succeeds', async () => {
    const http = new FakeHttp().on('GET', '/v2/user', json(429, fixture('error-429')), ok('user'));
    const { c, clock } = client(http);
    const r = await c.get('/v2/user');
    expect(r.kind).toBe('ok');
    expect(http.requests).toHaveLength(2);
    // The 5 s retry delay, after which the paused limiter still needs its slot drained.
    expect(clock.sleeps[0]).toBe(5000);
    expect(clock.t - NOW).toBeGreaterThanOrEqual(4 * RATE_LIMIT_DELAY);
  });

  it('429 with Retry-After holds the next call until then', async () => {
    const http = new FakeHttp().on('GET', '/v2/user', json(429, fixture('error-429'), { 'retry-after': '20' }), ok('user'));
    const { c, clock } = client(http);
    expect((await c.get('/v2/user')).kind).toBe('ok');
    expect(clock.t - NOW).toBeGreaterThanOrEqual(20_000);
  });

  it('spaces calls 1.1 s apart', async () => {
    const http = new FakeHttp().on('GET', '/v2/user', ok('user'));
    const { c, clock } = client(http);
    await c.get('/v2/user');
    await c.get('/v2/user');
    await c.get('/v2/user');
    expect(clock.t - NOW).toBe(2 * RATE_LIMIT_DELAY);
  });

  it('401 stops at once (no retries)', async () => {
    const http = new FakeHttp().on('GET', '/v2/user', json(401, fixture('error-401')));
    expect(await client(http).c.get('/v2/user')).toEqual({ kind: 'unauthorized' });
    expect(http.requests).toHaveLength(1);
  });

  it('network errors and 5xx are tried NUM_API_TRIES times, 5 s apart', async () => {
    const http = new FakeHttp().on('GET', '/v2/user', 'network');
    const { c, clock } = client(http);
    expect(await c.get('/v2/user')).toMatchObject({ kind: 'failed', status: 'network' });
    expect(http.requests).toHaveLength(3);
    expect(clock.sleeps.filter((s) => s === 5000)).toHaveLength(2);
  });

  it('422 on POST/PUT is an answer (the task is dropped), on GET a failure', async () => {
    const http = new FakeHttp()
      .on('PUT', '/v2/assignments/9002/start', json(422, fixture('error-422')))
      .on('GET', '/v2/user', json(422, {}));
    const { c } = client(http);
    expect(await c.call('PUT', '/v2/assignments/9002/start', {})).toMatchObject({ kind: 'unprocessable' });
    expect(http.calls('PUT', '/v2/assignments/9002/start')).toHaveLength(1);
    expect(await c.get('/v2/user')).toMatchObject({ kind: 'failed', status: 422 });
  });

  it('conditional GET (native): stores ETag / Last-Modified and sends them back; 304 is notModified', async () => {
    const v = memoryValidators();
    const http = new FakeHttp('native').on('GET', '/v2/user',
      ok('user', { etag: 'W/"abc"', 'last-modified': 'Sun, 25 Oct 2026 08:00:00 GMT' }),
      { status: 304, headers: {}, body: '' });
    const { c } = client(http, new FakeClock(NOW), v);
    expect((await c.get('/v2/user', { conditional: true })).kind).toBe('ok');
    expect(await c.get('/v2/user', { conditional: true })).toEqual({ kind: 'notModified' });
    expect(http.requests[1]!.headers).toMatchObject({ 'If-None-Match': 'W/"abc"', 'If-Modified-Since': 'Sun, 25 Oct 2026 08:00:00 GMT' });
  });

  it('no conditional headers on the web build', async () => {
    const v = memoryValidators();
    v.map.set(`${BASE}/v2/user`, { etag: 'x' });
    const http = new FakeHttp('fetch').on('GET', '/v2/user', ok('user'));
    await client(http, new FakeClock(NOW), v).c.get('/v2/user', { conditional: true });
    expect(http.requests[0]!.headers).not.toHaveProperty('If-None-Match');
  });

  it('a 2xx body that is not JSON is a failure', async () => {
    const http = new FakeHttp().on('GET', '/v2/user', { status: 200, headers: {}, body: '<html>' });
    expect(await client(http).c.get('/v2/user')).toMatchObject({ kind: 'failed', status: 'badJson' });
  });
});
