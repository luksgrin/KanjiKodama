/** The headless background sync (src/sync/background.ts) over a fake bridge. */
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

import { bridgeHttp, runBackgroundSync, type BackgroundBridge } from '../../src/sync/background';
import { switchToServer } from '../../src/sync/modeSwitch';
import { BASE, FakeClock, FakeHttp, firstSyncRoutes, limiterFor, NOW, openDb } from './helpers';

const USER = { id: '5a6a5234-a392-4a87-8f3f-33342afe8a42', username: 'kodama', level: 2, maxLevelGranted: 60, vacationStartedAt: 0 } as never;

function bridge(token: string | null = 'tok'): BackgroundBridge {
  return { token: () => token, appVersion: () => '1.1', request: vi.fn(), done: vi.fn() };
}

describe('bridgeHttp', () => {
  it('sends the request as JSON and resolves with the native answer', async () => {
    const target: Record<string, unknown> = {};
    const b = bridge();
    const http = bridgeHttp(b, target);
    const p = http.request({ url: `${BASE}/v2/user`, method: 'GET', headers: { Authorization: 'Bearer t' } });
    const [id, json] = (b.request as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse(json)).toMatchObject({ url: `${BASE}/v2/user`, method: 'GET' });
    (target.__kkBgResponse as (i: string, j: string) => void)(id, JSON.stringify({ status: 200, headers: { 'Content-Type': 'x' }, body: '{}' }));
    expect(await p).toEqual({ status: 200, headers: { 'content-type': 'x' }, body: '{}' });
    const q = http.request({ url: `${BASE}/v2/user`, method: 'GET' });
    const [id2] = (b.request as ReturnType<typeof vi.fn>).mock.calls[1]!;
    (target.__kkBgResponse as (i: string, j: string) => void)(id2, JSON.stringify({ error: 'offline' }));
    await expect(q).rejects.toThrow('offline');
  });
});

describe('runBackgroundSync', () => {
  it('syncs in server mode and returns the widget counts', async () => {
    const kk = await openDb();
    await switchToServer(kk, { baseUrl: BASE, token: 'ignored', user: USER });
    const http = firstSyncRoutes(new FakeHttp());
    const clock = new FakeClock(NOW);
    const r = await runBackgroundSync(bridge(), { kk, http, now: () => NOW, retryDelay: 1, clock, limiter: limiterFor(clock) });
    expect(r.ok).toBe(true);
    expect(http.requests.every((q) => q.headers?.Authorization === 'Bearer tok')).toBe(true);
    expect(r.widget).not.toBeNull();
    expect(typeof r.widget!.reviews).toBe('number');
    expect(await kk.serverSubjects.count()).toBe(3);
  });

  it('does nothing in local mode or without a token', async () => {
    const kk = await openDb();
    const http = new FakeHttp();
    expect(await runBackgroundSync(bridge(), { kk, http })).toMatchObject({ ok: false, skipped: 'local', widget: null });
    await switchToServer(kk, { baseUrl: BASE, token: 'x', user: USER });
    expect(await runBackgroundSync(bridge(null), { kk, http })).toMatchObject({ ok: false, skipped: 'no-token' });
    expect(http.requests).toHaveLength(0);
  });
});
