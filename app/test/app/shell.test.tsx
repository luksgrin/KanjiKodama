// @vitest-environment jsdom
// The toolbar (ui/shell/ToolbarView), toasts, the dashboard as history root.
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import { useToolbar } from '../../src/ui/shell/toolbar';
import { maxActionButtons, toolbarColorStyle } from '../../src/ui/shell/ToolbarView';
import { clearToasts, toast } from '../../src/ui/shell/toast';
import { makeApp } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  clearToasts();
  vi.useRealTimers();
});

async function render(path = '/', width = 411) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  const h = makeApp();
  await h.app.start();
  container = document.createElement('div');
  document.body.append(container);
  const location = createMemoryLocation(path);
  await act(async () => {
    root = createRoot(container!);
    root.render(<App app={h.app} location={location} />);
  });
  return { ...h, location, el: container };
}

const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const menuLabels = (el: HTMLElement) => [...el.querySelectorAll('[data-testid="toolbar-menu"] [role^="menuitem"]')].map((b) => b.textContent);

async function click(el: HTMLElement | null) {
  if (!el) throw new Error('no element');
  await act(async () => el.click());
}

describe('toolbar', () => {
  it('dashboard: title, Search and Mute icons, main_options_menu overflow', async () => {
    const { el, app } = await render('/');
    expect(el.querySelector('.kk-toolbar h1')?.textContent).toBe('KanjiKodama');
    expect(q(el, 'toolbar-back')).toBeNull();
    expect(q(el, 'toolbar-search')).not.toBeNull();
    expect(q(el, 'toolbar-mute')).not.toBeNull();
    expect(el.querySelector('.kk-bottomnav')).toBeNull();
    await click(q(el, 'toolbar-overflow'));
    expect(menuLabels(el)).toEqual(['Settings', 'Download audio', 'Browse/search...', 'Fast travel...', 'Kanji level test...', 'Self-study quiz', 'About...']);
    app.dispose();
  });

  it('sub-screens: up arrow, Search and Dashboard icons, Mute in the overflow (3 slots at 411dp)', async () => {
    const { el, app, location } = await render('/settings/about');
    expect(q(el, 'toolbar-back')).not.toBeNull();
    expect(q(el, 'toolbar-search')).not.toBeNull();
    expect(q(el, 'toolbar-dashboard')).not.toBeNull();
    expect(q(el, 'toolbar-mute')).toBeNull();
    await click(q(el, 'toolbar-overflow'));
    expect(menuLabels(el)).toEqual(['Settings', 'Mute', 'Download audio', 'Browse/search...', 'Self-study quiz', 'About...']);
    await click(q(el, 'menu-settings'));
    expect(location.get()).toBe('/settings');
    await click(q(el, 'toolbar-dashboard'));
    expect(location.get()).toBe('/');
    expect(location.depth()).toBe(0);
    app.dispose();
  });

  it('narrow screens keep one icon (ActionBarPolicy)', async () => {
    expect([320, 359, 360, 499, 500, 600].map(maxActionButtons)).toEqual([2, 2, 3, 3, 4, 5]);
    const { el, app } = await render('/settings/about', 320);
    expect(q(el, 'toolbar-search')).not.toBeNull();
    expect(q(el, 'toolbar-dashboard')).toBeNull();
    app.dispose();
  });

  it('Mute toggles the preference and the label', async () => {
    const { el, app } = await render('/');
    expect(q(el, 'toolbar-mute')?.getAttribute('aria-label')).toBe('Mute');
    await click(q(el, 'toolbar-mute'));
    expect(app.get().prefs.muted).toBe(true);
    expect(q(el, 'toolbar-mute')?.getAttribute('aria-label')).toBe('Unmute');
    app.dispose();
  });

  it('the search action opens a SearchView that runs a keyword search', async () => {
    const { el, app, location } = await render('/');
    await click(q(el, 'toolbar-search'));
    // The search expands iconified first (Collapse + magnifier); the magnifier opens the field.
    expect(q(el, 'toolbar-search-input')).toBeNull();
    await click(q(el, 'toolbar-search-expand'));
    const input = q(el, 'toolbar-search-input') as HTMLInputElement;
    expect(input.placeholder).toBe(''); // android.widget.SearchView without a queryHint
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'ichi');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.form!.requestSubmit());
    expect(location.get()).toBe('/browse/results?t=1&q=ichi');
    app.dispose();
  });

  it('subject colours keep the white title', () => {
    expect(toolbarColorStyle('kanji')).toEqual({ '--tb-bg': 'var(--color-kanji)' });
    expect(toolbarColorStyle('kana_vocabulary')).toEqual({ '--tb-bg': 'var(--color-vocab)' });
    expect(toolbarColorStyle({ bg: '#000000', fg: '#ffffff' })).toEqual({ '--tb-bg': '#000000', '--tb-fg': '#ffffff' });
    expect(toolbarColorStyle('default')).toBeUndefined();
  });
});

describe('useToolbar', () => {
  it('merges screen options; screen actions go to their menu position and can hide built-ins', async () => {
    const onLog = vi.fn();
    function Probe() {
      useToolbar({
        title: 'Kanji Reading',
        color: 'kanji',
        actions: [
          { id: 'abandon_session', label: 'Abandon session', onSelect: () => undefined },
          { id: 'session_log', label: 'Session log...', onSelect: onLog },
          { id: 'self_study', label: 'Self-study quiz', onSelect: () => undefined, hidden: true },
        ],
      });
      return null;
    }
    const { el, app } = await render('/settings/about');
    const before = el.querySelector('.kk-toolbar h1')?.textContent;
    const host = document.createElement('div');
    document.body.append(host);
    const r2 = createRoot(host);
    await act(async () => r2.render(<Probe />));
    const bar = el.querySelector<HTMLElement>('.kk-toolbar')!;
    expect(bar.querySelector('h1')?.textContent).toBe('Kanji Reading');
    expect(bar.getAttribute('style')).toContain('--tb-bg: var(--color-kanji)');
    await click(q(el, 'toolbar-overflow'));
    expect(menuLabels(el)).toEqual(['Settings', 'Mute', 'Download audio', 'Browse/search...', 'Session log...', 'Abandon session', 'About...']);
    await click(q(el, 'menu-session_log'));
    expect(onLog).toHaveBeenCalledOnce();
    act(() => r2.unmount());
    host.remove();
    expect(el.querySelector('.kk-toolbar h1')?.textContent).toBe(before);
    app.dispose();
  });
});

describe('toast', () => {
  it('shows one Android toast at a time for LENGTH_SHORT / LENGTH_LONG', () => {
    vi.useFakeTimers();
    toast('Session wrapping up...');
    toast('Background tasks flushed!', { long: true });
    const all = document.querySelectorAll('[data-testid="toast"]');
    expect(all).toHaveLength(1);
    expect(all[0]!.textContent).toBe('Background tasks flushed!');
    vi.advanceTimersByTime(3000);
    expect(document.querySelector('[data-testid="toast"]')).not.toBeNull();
    vi.advanceTimersByTime(800);
    expect(document.querySelector('[data-testid="toast"]')).toBeNull();
  });
});

describe('history', () => {
  it('going to the dashboard drops the history (the summary Finish: back then leaves the app)', () => {
    const loc = createMemoryLocation('/');
    loc.navigate('/reviews');
    loc.navigate('/summary', { replace: true });
    loc.navigate('/', { replace: true });
    expect(loc.get()).toBe('/');
    expect(loc.depth()).toBe(0);
    expect(loc.back()).toBe(false);
  });
});
