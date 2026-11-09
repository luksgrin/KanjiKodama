// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import { LATEST_RELEASE_URL } from '../../src/core/update';
import type { Platform } from '../../src/platform';
import { clearToasts } from '../../src/ui/shell/toast';
import { UPDATE_LATER_VERSION_KEY } from '../../src/ui/update/updateController';
import type { FakeHttp } from '../sync/helpers';
import { fakePlatform, makeApp } from './fixtures';
import { APK_SHA, fakeUpdater, githubHttp, releaseJson, type FakeUpdater } from '../update/fakes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;

beforeEach(() => {
  (globalThis as { matchMedia?: unknown }).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});

afterEach(() => {
  clearToasts();
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

const $ = (el: HTMLElement, testId: string) => el.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });
const click = async (el: HTMLElement | null) => {
  expect(el).not.toBeNull();
  await act(async () => { el!.click(); });
  await flush();
};

async function render(path: string, opts: { http?: FakeHttp; updater?: FakeUpdater; selfUpdate?: boolean } = {}) {
  const http = opts.http ?? githubHttp();
  const updater = opts.updater ?? fakeUpdater();
  const platform = {
    ...fakePlatform({}, { selfUpdate: opts.selfUpdate ?? true }),
    name: 'android',
    http,
    ...(opts.selfUpdate === false ? {} : { updater }),
  } as unknown as Platform;
  const h = makeApp({ platform });
  await h.app.start();
  container = document.createElement('div');
  document.body.append(container);
  const location = createMemoryLocation(path);
  await act(async () => {
    root = createRoot(container!);
    root.render(<App app={h.app} location={location} />);
  });
  await flush();
  return { ...h, http, updater, location, el: container };
}

describe('self-update dialog (Android)', () => {
  it('offers the new version at start-up; Update downloads, checks the checksum and hands it to Android', async () => {
    const r = await render('/');
    const dialog = $(r.el, 'dialog-update');
    expect(dialog?.textContent).toContain('KanjiKodama 0.99.0 is available');
    expect(dialog?.textContent).toContain(`You have ${__APP_VERSION__}`);
    expect(dialog?.textContent).toContain('50.0 MB');
    await click($(r.el, 'update-now'));
    expect(r.updater.downloads[0]!.sha256).toBe(APK_SHA);
    expect(r.updater.installs).toHaveLength(1);
    expect($(r.el, 'dialog-update-installing')?.textContent).toContain('Confirm the update');
    r.app.dispose();
  });

  it('Later closes it and remembers the version', async () => {
    const r = await render('/');
    await click($(r.el, 'update-later'));
    expect($(r.el, 'dialog-update')).toBeNull();
    expect(r.app.get().prefs[UPDATE_LATER_VERSION_KEY]).toBe('0.99.0');
    r.app.dispose();
  });

  it('explains the one-time permission and continues after it is granted', async () => {
    const r = await render('/', { updater: fakeUpdater({ canInstall: false }) });
    await click($(r.el, 'update-now'));
    expect($(r.el, 'dialog-update-permission')?.textContent).toContain('Allow from this source');
    await click($(r.el, 'update-allow'));
    expect(r.updater.openInstallSettings).toHaveBeenCalled();
    expect(r.updater.installs).toHaveLength(1);
    r.app.dispose();
  });

  it('shows a refused download plainly with the release page', async () => {
    const updater = fakeUpdater();
    updater.failDownload = 'SIGNATURE';
    const r = await render('/', { updater });
    await click($(r.el, 'update-now'));
    expect($(r.el, 'update-error')?.textContent).toContain('isn\'t signed with KanjiKodama\'s key');
    const link = $(r.el, 'dialog-update-error')!.querySelector('a')!;
    expect(link.getAttribute('href')).toContain('/releases/tag/v0.99.0');
    expect(r.updater.installs).toHaveLength(0);
    r.app.dispose();
  });

  it('Settings → App updates: the switch and "Check for updates now"', async () => {
    const http = githubHttp(releaseJson(`v${__APP_VERSION__}`));
    const r = await render('/settings', { http });
    expect($(r.el, 'dialog-update')).toBeNull();
    expect($(r.el, 'category-app-updates')?.textContent).toContain('Check for a new version at start');
    await click($(r.el, 'setting-update_check_at_start'));
    expect(r.app.get().prefs.update_check_at_start).toBe(false);
    await click($(r.el, 'update-check-now'));
    expect(http.calls('GET', LATEST_RELEASE_URL)).toHaveLength(2); // start-up + Check now
    expect(document.querySelector('.kk-toast')?.textContent).toContain('is the latest version');
    r.app.dispose();
  });

  it('is absent from the web app', async () => {
    const r = await render('/settings', { selfUpdate: false });
    expect($(r.el, 'category-app-updates')).toBeNull();
    expect(r.http.requests).toHaveLength(0);
    r.app.dispose();
  });
});
