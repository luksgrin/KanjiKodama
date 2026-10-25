// @vitest-environment jsdom
/** The server screen against a fake server (no network): connect, test, switch, rejected token, leaving. */
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import { createAppController } from '../../src/app/appController';
import { manualClock } from '../../src/app/clock';
import type { Platform } from '../../src/platform';
import { KkDb } from '../../src/storage/db';
import { enqueueReview, pendingUploads } from '../../src/sync/queue';
import { ServerStore } from '../../src/sync/store';
import { freshName, smallContent } from '../progress-storage/helpers';
import { BASE, FakeClock, FakeHttp, firstSyncRoutes, fixture, json, limiterFor, NOW, ok } from '../sync/helpers';
import { fakePlatform, loaded } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

function memorySecrets() {
  const m = new Map<string, string>();
  return { kind: 'memory' as const, m, get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string | null) => { if (v === null) m.delete(k); else m.set(k, v); } };
}

async function render(http: FakeHttp, caps: Partial<Platform['capabilities']> = { cleartextHttp: true }) {
  const secrets = memorySecrets();
  const platform = { ...fakePlatform({}, caps), http, secrets } as Platform;
  const kk = new KkDb(freshName());
  const fc = new FakeClock(NOW);
  const app = createAppController({
    db: kk, platform, loadContent: async () => loaded(smallContent()), clock: manualClock(NOW), tickMs: null,
    sync: { clock: fc, limiter: limiterFor(fc), retryDelay: 1, tries: 1 },
  });
  await app.start();
  container = document.createElement('div');
  document.body.append(container);
  const location = createMemoryLocation('/settings/server');
  await act(async () => {
    root = createRoot(container!);
    root.render(<App app={app} location={location} />);
  });
  return { app, kk, secrets, el: container, platform };
}

const $ = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

async function type(el: HTMLElement, id: string, value: string) {
  const input = $(el, id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(el: HTMLElement | null) {
  await act(async () => { el!.click(); });
  // Let the async flows (IndexedDB, fake HTTP) finish.
  for (let i = 0; i < 20; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
}

const button = (el: HTMLElement, label: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === label && !b.disabled) ?? null;

describe('server screen, local mode', () => {
  it('presets fill the address; test connection reports the account', async () => {
    const http = new FakeHttp().on('GET', 'https://openkani.vercel.app/v2/user', ok('user'));
    const { el, app } = await render(http);
    expect(el.textContent).toContain('JLPT order, the extra kanji, fast travel and the level test are only available in local mode.');
    await click($(el, 'preset-OpenKani'));
    expect(($(el, 'server-url') as HTMLInputElement).value).toBe('https://openkani.vercel.app');
    await click($(el, 'server-test'));
    expect($(el, 'dialog-message-text')?.textContent).toBe('Paste an API token for the server, or use a WaniKani token to copy your WaniKani data to it.');
    await click(button(el, 'OK'));
    await type(el, 'server-token', 'tok');
    await click($(el, 'server-test'));
    expect($(el, 'server-note')?.textContent).toBe('Connected to openkani.vercel.app as kodama, level 2.');
    expect(http.requests[0]!.headers?.Authorization).toBe('Bearer tok');
    app.dispose();
  });

  it('PWA: refuses http:// addresses (mixed content)', async () => {
    const http = new FakeHttp();
    const { el, app } = await render(http, { cleartextHttp: false });
    await type(el, 'server-url', 'http://192.168.1.5:3000');
    await type(el, 'server-token', 'tok');
    await click($(el, 'server-connect'));
    expect($(el, 'dialog-message-text')?.textContent).toMatch(/needs an https:\/\/ server.*mixed content/);
    expect(http.requests).toHaveLength(0);
    app.dispose();
  });

  it('a rejected token shows the Java message naming the server', async () => {
    const http = new FakeHttp().on('GET', '/v2/user', json(401, fixture('error-401')));
    const { el, app } = await render(http);
    await type(el, 'server-url', BASE);
    await type(el, 'server-token', 'bad');
    await click($(el, 'server-connect'));
    expect($(el, 'dialog-message-text')?.textContent).toBe('kk.example.test rejected this API token.');
    app.dispose();
  });

  it('connect → confirm (Save first offered) → switch: server mode, first sync, token in the secrets', async () => {
    const http = firstSyncRoutes(new FakeHttp());
    const { el, app, kk, secrets, platform } = await render(http);
    await type(el, 'server-url', `${BASE}/v2/`);
    await type(el, 'server-token', 'tok');
    await click($(el, 'server-connect'));
    expect(el.querySelector('[data-testid="dialog-confirm-server"] .kk-dialog-body')?.textContent)
      .toContain('Connected to kk.example.test as kodama, level 2.');
    await click(button(el, 'Save first'));
    expect(platform.files.saveText).toHaveBeenCalled();
    await click(button(el, 'Switch'));
    expect(app.get().mode).toBe('server');
    expect(await new ServerStore(kk).mode()).toBe('server');
    expect(secrets.m.get('server.token')).toBe('tok');
    expect(await kk.state.get('server.token')).toBeUndefined();
    expect($(el, 'server-status-message')?.textContent).toContain('Connected to kk.example.test (https://kk.example.test).');
    // The first sync ran: the server's subjects are the content now.
    expect(app.get().content!.content.subjects.map((s) => s.id)).toEqual([1, 2, 10]);
    expect($(el, 'server-last-sync')?.textContent).not.toBe('Never');
    app.dispose();
  });

  it('WaniKani token: migrate, then the usual check and confirm', async () => {
    const http = firstSyncRoutes(new FakeHttp()).on('POST', '/v2/migrate', json(200, { token: 'server-token' }));
    const { el, app } = await render(http);
    await type(el, 'server-url', BASE);
    await click($(el, 'server-use-wk'));
    expect(el.textContent).toContain('kk.example.test downloads your WaniKani data once into its own database');
    await type(el, 'server-wk-key', 'wk-key');
    await click(button(el, 'Next'));
    expect(JSON.parse(http.calls('POST', '/v2/migrate')[0]!.body!)).toEqual({ wanikani_api_key: 'wk-key' });
    expect(http.calls('GET', '/v2/user')[0]!.headers?.Authorization).toBe('Bearer server-token');
    expect($(el, 'dialog-confirm-server')?.textContent).toContain('Switch to server mode?');
    app.dispose();
  });
});

async function inServerMode(http: FakeHttp) {
  const h = await render(http);
  await type(h.el, 'server-url', BASE);
  await type(h.el, 'server-token', 'tok');
  await click($(h.el, 'server-connect'));
  await click(button(h.el, 'Switch'));
  return h;
}

describe('server screen, server mode', () => {
  it('token rejected during sync: banner, enter a new token, queue kept and sent', async () => {
    const http = firstSyncRoutes(new FakeHttp());
    const { el, app, kk, secrets } = await inServerMode(http);
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 0, at: NOW, justPassed: false });
    http.on('GET', '/v2/user', json(401, fixture('error-401')));
    await click($(el, 'server-sync-now'));
    expect($(el, 'server-banner')?.textContent).toBe('kk.example.test is not accepting your API token. Did you give your API token the correct permissions?');
    expect($(el, 'server-pending')?.textContent).toBe('1');
    http.on('GET', '/v2/user', ok('user')).on('POST', '/v2/reviews', ok('review-created'));
    await type(el, 'server-new-token', 'tok2');
    await click($(el, 'server-new-token-save'));
    expect(secrets.m.get('server.token')).toBe('tok2');
    // Not rejected any more (later collection calls aren't routed by the fake server).
    expect($(el, 'server-banner')?.textContent ?? '').not.toContain('not accepting');
    expect(await pendingUploads(kk)).toBe(0);
    app.dispose();
  });

  it('leaving with unsent answers says so; Start at level 1 discards them explicitly', async () => {
    const http = firstSyncRoutes(new FakeHttp());
    const { el, app, kk } = await inServerMode(http);
    await enqueueReview(kk, { subjectId: 10, assignmentId: 9003, meaningIncorrect: 0, readingIncorrect: 0, at: NOW, justPassed: false });
    http.on('POST', '/v2/reviews', 'network');
    await act(async () => { app.tick(); });
    await click($(el, 'server-to-local'));
    expect($(el, 'ask-local-text')?.textContent).toContain('1 answers or notes not yet sent to kk.example.test will be lost.');
    expect(button(el, 'Send now')).not.toBeNull();
    await click(button(el, 'Start at level 1'));
    expect(app.get().mode).toBe('local');
    expect(await pendingUploads(kk)).toBe(0);
    expect($(el, 'server-note')?.textContent).toBe('Local mode, starting at level 1.');
    expect(app.get().content!.content.subjects.map((s) => s.id)).toEqual(smallContent().subjects.map((s) => s.id));
    app.dispose();
  });

  it('Bring progress downloads the account and imports it', async () => {
    const http = firstSyncRoutes(new FakeHttp());
    const { el, app } = await inServerMode(http);
    await click($(el, 'server-to-local'));
    expect(button(el, 'Send now')).toBeNull();
    await click(button(el, 'Bring progress'));
    expect(app.get().mode).toBe('local');
    expect($(el, 'server-note')?.textContent).toMatch(/^Local mode\. /);
    app.dispose();
  });
});

describe('server mode sessions', () => {
  it('sessionHooks predict locally and the write queues and sends the upload', async () => {
    const http = firstSyncRoutes(new FakeHttp()).on('POST', '/v2/reviews', ok('review-created'));
    const { app, kk } = await inServerMode(http);
    const hooks = app.sessionHooks({ levelTestRoundActive: () => false, onSessionFinishing: () => undefined });
    expect(hooks.report).toBeDefined();
    await act(async () => {
      await app.write((l, now) => hooks.report!(l, { subjectId: 10, type: 'REVIEW', meaningIncorrect: 0, readingIncorrect: 0, timestamp: now, assignmentId: 0 }, now));
    });
    for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(http.calls('POST', '/v2/reviews')).toHaveLength(1);
    expect(await pendingUploads(kk)).toBe(0);
    app.dispose();
  });

  it('local mode: sessionHooks are the base hooks', async () => {
    const { app } = await render(new FakeHttp());
    const base = { levelTestRoundActive: () => false, onSessionFinishing: vi.fn() };
    expect(app.sessionHooks(base)).toBe(base);
    expect(app.syncEngine()).toBeNull();
    app.dispose();
  });
});
