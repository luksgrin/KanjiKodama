/** The two `HttpApi` implementations, with their transports faked (no network). */
import { describe, expect, it } from 'vitest';

import { HttpNetworkError } from '../../src/platform';
import { createFetchHttp } from '../../src/platform/http';
import { createAndroidHttp } from '../../src/platform/httpAndroid';

describe('fetch HttpApi (web)', () => {
  it('drops User-Agent and conditional headers, lower-cases response headers, keeps 4xx as responses', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const http = createFetchHttp(async (url, init) => {
      seen.push({ url: String(url), init: init! });
      return new Response('{"error":"no"}', { status: 401, headers: { 'Content-Type': 'application/json', ETag: 'x' } });
    });
    const res = await http.request({
      url: 'https://kk.example.test/v2/user', method: 'GET',
      headers: { Authorization: 'Bearer t', 'User-Agent': 'KanjiKodama/1', 'If-None-Match': 'x' },
    });
    expect(http.kind).toBe('fetch');
    expect(res).toEqual({ status: 401, headers: { 'content-type': 'application/json', etag: 'x' }, body: '{"error":"no"}' });
    expect(seen[0]!.init.headers).toEqual({ Authorization: 'Bearer t' });
    expect(seen[0]!.init.credentials).toBe('omit');
  });

  it('network failures reject with HttpNetworkError', async () => {
    const http = createFetchHttp(async () => { throw new TypeError('Failed to fetch'); });
    await expect(http.request({ url: 'https://kk.example.test/v2/user', method: 'GET' })).rejects.toBeInstanceOf(HttpNetworkError);
  });
});

describe('CapacitorHttp HttpApi (Android)', () => {
  it('passes the JSON text through and turns parsed bodies back into text', async () => {
    const seen: unknown[] = [];
    const http = createAndroidHttp(async (o) => {
      seen.push(o);
      return { status: 200, headers: { 'Content-Type': 'application/json' }, data: { id: 1, object: 'review' } };
    });
    const res = await http.request({ url: 'http://192.168.1.5:3000/v2/reviews', method: 'POST', headers: { 'User-Agent': 'KanjiKodama/1' }, body: '{"review":{}}' });
    expect(http.kind).toBe('native');
    expect(res).toEqual({ status: 200, headers: { 'content-type': 'application/json' }, body: '{"id":1,"object":"review"}' });
    expect(seen[0]).toMatchObject({ method: 'POST', data: '{"review":{}}', headers: { 'User-Agent': 'KanjiKodama/1' }, responseType: 'text' });
  });

  it('string bodies stay as they are; rejections become HttpNetworkError', async () => {
    const http = createAndroidHttp(async () => ({ status: 503, headers: {}, data: 'down' }));
    expect((await http.request({ url: 'https://x.test/', method: 'GET' })).body).toBe('down');
    const failing = createAndroidHttp(async () => { throw new Error('UnknownHostException'); });
    await expect(failing.request({ url: 'https://x.test/', method: 'GET' })).rejects.toBeInstanceOf(HttpNetworkError);
  });
});
