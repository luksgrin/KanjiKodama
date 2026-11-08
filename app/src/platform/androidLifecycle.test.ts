// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (e: { canGoBack: boolean }) => void;
const app = vi.hoisted(() => {
  const listeners = new Map<string, Listener[]>();
  return {
    listeners,
    addListener: vi.fn((event: string, cb: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), cb]);
      return Promise.resolve({
        remove: vi.fn(async () => listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== cb))),
      });
    }),
    minimizeApp: vi.fn(async () => undefined),
  };
});
const bars = vi.hoisted(() => ({ setStyle: vi.fn(async () => undefined) }));
vi.mock('@capacitor/app', () => ({ App: app }));
const systemUi = vi.hoisted(() => ({ setBarColors: vi.fn(async () => undefined), setImeHints: vi.fn(async () => undefined) }));
vi.mock('@capacitor/core', () => ({
  SystemBars: bars,
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
  registerPlugin: () => systemUi,
}));

const { androidLifecycle, androidHaptics, androidSystemBars, resetBackButtonForTests } = await import('./androidLifecycle');
const { webLifecycle } = await import('./web');

function emit(event: string, e = { canGoBack: false }): void {
  for (const l of app.listeners.get(event) ?? []) l(e);
}

beforeEach(() => {
  app.listeners.clear();
  app.addListener.mockClear();
  app.minimizeApp.mockClear();
  resetBackButtonForTests();
});

describe('back button', () => {
  it('runs handlers newest first until one handles it', () => {
    const calls: string[] = [];
    const offA = androidLifecycle.onBackButton!(() => (calls.push('a'), true));
    const offB = androidLifecycle.onBackButton!(() => (calls.push('b'), false));
    emit('backButton');
    expect(calls).toEqual(['b', 'a']);
    expect(app.minimizeApp).not.toHaveBeenCalled();
    expect(app.addListener).toHaveBeenCalledTimes(1); // one native listener
    offA();
    offB();
  });

  it('unhandled: history back when possible, else to the background', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const off = androidLifecycle.onBackButton!(() => false);
    emit('backButton', { canGoBack: true });
    expect(back).toHaveBeenCalledTimes(1);
    emit('backButton', { canGoBack: false });
    expect(app.minimizeApp).toHaveBeenCalledTimes(1);
    off();
    back.mockRestore();
  });

  it('an unsubscribed handler no longer runs', () => {
    const h = vi.fn(() => true);
    const off = androidLifecycle.onBackButton!(h);
    off();
    emit('backButton');
    expect(h).not.toHaveBeenCalled();
    expect(app.minimizeApp).toHaveBeenCalledTimes(1);
  });
});

describe('resume / pause', () => {
  it('forwards the App events and unsubscribes', async () => {
    const resumed = vi.fn();
    const paused = vi.fn();
    const offR = androidLifecycle.onResume(resumed);
    const offP = androidLifecycle.onPause(paused);
    emit('resume');
    emit('pause');
    expect(resumed).toHaveBeenCalledTimes(1);
    expect(paused).toHaveBeenCalledTimes(1);
    offR();
    emit('resume');
    expect(resumed).toHaveBeenCalledTimes(1);
    offP();
    await Promise.resolve();
  });

  it('web: page visibility', () => {
    const resumed = vi.fn();
    const paused = vi.fn();
    const offR = webLifecycle.onResume(resumed);
    const offP = webLifecycle.onPause(paused);
    const vis = vi.spyOn(document, 'visibilityState', 'get');
    vis.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(paused).toHaveBeenCalledTimes(1);
    expect(resumed).toHaveBeenCalledTimes(1);
    offR();
    offP();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resumed).toHaveBeenCalledTimes(1);
    vis.mockRestore();
  });
});

describe('haptics and system bars', () => {
  it('vibrates with the one-shot durations', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    expect(androidHaptics.supported).toBe(true);
    androidHaptics.feedback('correct');
    androidHaptics.feedback('wrong');
    androidHaptics.feedback('retry');
    expect(vibrate.mock.calls).toEqual([[100], [300], [200]]);
  });

  it('maps the app theme to bar icon styles', async () => {
    await androidSystemBars.setTheme('dark');
    await androidSystemBars.setTheme('light');
    await androidSystemBars.setTheme('system');
    expect(bars.setStyle.mock.calls).toEqual([[{ style: 'DARK' }], [{ style: 'LIGHT' }], [{ style: 'DEFAULT' }]]);
    // setStyle resets the window background: the sampled bar colours are sent again after each call.
    expect(systemUi.setBarColors.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
