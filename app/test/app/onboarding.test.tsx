// @vitest-environment jsdom
// The getting-started guide (ui/screens/onboarding): opened by the shell on a first start, its steps,
// the curriculum choice, skipping, and the Settings row.
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import { ONBOARDING_DONE_KEY } from '../../src/core/onboarding';
import { preloadAllScreens } from '../../src/ui/screens';
import { makeApp } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;

beforeAll(async () => {
  (globalThis as { matchMedia?: unknown }).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  await preloadAllScreens();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

const $ = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0)); });
const click = async (el: HTMLElement | null) => {
  expect(el).not.toBeNull();
  await act(async () => { el!.click(); });
  await flush();
};

async function render(path = '/', before?: (h: ReturnType<typeof makeApp>) => Promise<void>) {
  const h = makeApp({ onboarding: true });
  await h.app.start();
  await before?.(h);
  container = document.createElement('div');
  document.body.append(container);
  const location = createMemoryLocation(path);
  await act(async () => {
    root = createRoot(container!);
    root.render(<App app={h.app} location={location} />);
  });
  await flush();
  return { ...h, location, el: container };
}

const step = (el: HTMLElement) => $(el, 'onboarding')?.dataset.step;

describe('getting-started guide', () => {
  it('opens instead of the dashboard on a first start; Skip guide ends it for good', async () => {
    const r = await render('/');
    expect(r.location.get()).toBe('/welcome');
    expect(r.location.depth()).toBe(0);
    expect(step(r.el)).toBe('welcome');
    expect($(r.el, 'toolbar-back')).toBeNull();
    await click($(r.el, 'onboarding-skip'));
    expect(r.location.get()).toBe('/');
    expect(r.app.get().prefs[ONBOARDING_DONE_KEY]).toBe(true);
    expect($(r.el, 'level-duration')).not.toBeNull();
    r.app.dispose();
  });

  it('walks every step; Next keeps the defaults; Back goes one step back', async () => {
    const r = await render('/');
    const seen = [step(r.el)];
    await click($(r.el, 'onboarding-next'));
    seen.push(step(r.el));
    await click($(r.el, 'onboarding-back'));
    expect(step(r.el)).toBe('welcome');
    for (let i = 0; i < 5 && $(r.el, 'onboarding-next'); i++) {
      await click($(r.el, 'onboarding-next'));
      seen.push(step(r.el));
      if (step(r.el) === 'quiz') expect($(r.el, 'onboarding')?.textContent).toContain('Blue: radical');
    }
    expect(seen).toEqual(['welcome', 'appearance', 'appearance', 'quiz', 'path', 'start', 'done']);
    await click($(r.el, 'onboarding-finish'));
    expect(r.location.get()).toBe('/');
    expect(r.app.requireLearner().progress.curriculum).toBe('WANIKANI');
    expect(r.app.get().prefs[ONBOARDING_DONE_KEY]).toBe(true);
    r.app.dispose();
  });

  it('JLPT order switches without a confirmation and offers fast travel', async () => {
    const r = await render('/');
    for (let i = 0; i < 3; i++) await click($(r.el, 'onboarding-next'));
    expect(step(r.el)).toBe('path');
    await click($(r.el, 'onboarding-path-JLPT')?.querySelector('input') ?? null);
    await click($(r.el, 'onboarding-next'));
    expect($(r.el, 'dialog-curriculum-confirm')).toBeNull();
    expect(step(r.el)).toBe('start');
    expect(r.app.requireLearner().progress.curriculum).toBe('JLPT');
    expect($(r.el, 'onboarding-start-FAST_TRAVEL')).not.toBeNull();
    expect($(r.el, 'onboarding-start-IMPORT')).toBeNull();
    r.app.dispose();
  });

  it('the level test (JLPT order only) ends the guide on the level test', async () => {
    const r = await render('/');
    for (let i = 0; i < 4; i++) await click($(r.el, 'onboarding-next'));
    expect(step(r.el)).toBe('start');
    expect($(r.el, 'onboarding-start-IMPORT')).not.toBeNull();
    expect($(r.el, 'onboarding-start-LEVEL_TEST')).toBeNull();
    await click($(r.el, 'onboarding-back'));
    await click($(r.el, 'onboarding-path-JLPT')?.querySelector('input') ?? null);
    await click($(r.el, 'onboarding-next'));
    await click($(r.el, 'onboarding-start-LEVEL_TEST')?.querySelector('input') ?? null);
    await click($(r.el, 'onboarding-next'));
    expect(r.location.get()).toBe('/settings/level-test');
    expect(r.app.get().prefs[ONBOARDING_DONE_KEY]).toBe(true);
    r.app.dispose();
  });

  it('not for a learner with progress or settings, nor on a start elsewhere', async () => {
    const withProgress = await render('/', async (h) => {
      await h.app.write((db) => { db.progress.userLevel = 2; }, { persist: 'all' });
    });
    expect(withProgress.location.get()).toBe('/');
    withProgress.app.dispose();
    act(() => root?.unmount());

    const withSettings = await render('/', (h) => h.app.setPreference('mute', true));
    expect(withSettings.location.get()).toBe('/');
    withSettings.app.dispose();
    act(() => root?.unmount());

    const elsewhere = await render('/settings/about');
    expect(elsewhere.location.get()).toBe('/settings/about');
    elsewhere.app.dispose();
  });

  it('Settings, Progress opens it again, with the up arrow', async () => {
    const r = await render('/settings', (h) => h.app.setPreference(ONBOARDING_DONE_KEY, true));
    await click($(r.el, 'link-welcome'));
    expect(r.location.get()).toBe('/welcome');
    expect($(r.el, 'toolbar-back')).not.toBeNull();
    expect(step(r.el)).toBe('welcome');
    r.app.dispose();
  });
});
