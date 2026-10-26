// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepKeyboardWanted, startNativeKeepKeyboard } from '../../src/ui/components/session/nativeKeepKeyboard';
import {
  describeTarget, keyboardDiagnosticsLines, keyboardDiagnosticsText, kbdLog, setKeyboardDiagnosticsEnabled,
} from '../../src/ui/shell/keyboardDiagnostics';

function setup() {
  document.body.innerHTML = `
    <div class="kk-quiz-spacer" data-testid="spacer"></div>
    <input class="kk-answer" type="text" value="secret answer">
    <button type="button" data-testid="submit">Submit</button>`;
  const field = document.querySelector<HTMLInputElement>('input.kk-answer')!;
  const spacer = document.querySelector<HTMLElement>('.kk-quiz-spacer')!;
  const button = document.querySelector<HTMLButtonElement>('button')!;
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const calls: string[] = [];
  const bridge = {
    setKeepKeyboard: vi.fn(async ({ on }: { on: boolean }) => { calls.push(on ? 'on' : 'off'); }),
    reshowKeyboard: vi.fn(async () => { calls.push('reshow'); }),
  };
  let dialog = false;
  let dialogListener: (() => void) | undefined;
  const subscribe = (l: () => void) => { dialogListener = l; return () => { dialogListener = undefined; }; };
  return {
    field, spacer, button, calls, bridge,
    setDialog: (d: boolean) => { dialog = d; dialogListener?.(); },
    start: () => startNativeKeepKeyboard(bridge, () => dialog, subscribe),
  };
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const pointer = (type: string, target: Element) => {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { isPrimary: boolean };
  Object.defineProperty(e, 'isPrimary', { value: true });
  target.dispatchEvent(e);
};

describe('native keep-keyboard mode', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('is on while the answer field has the focus, off when it goes, the question is left or a dialog opens', async () => {
    const t = setup();
    t.field.focus();
    expect(keepKeyboardWanted(document, false)).toBe(true);
    expect(keepKeyboardWanted(document, true)).toBe(false);
    const stop = t.start();
    expect(t.calls).toEqual(['on']);
    t.setDialog(true);
    await tick();
    expect(t.calls).toEqual(['on', 'off']);
    t.setDialog(false);
    await tick();
    expect(t.calls).toEqual(['on', 'off', 'on']);
    t.field.readOnly = true; // answered
    t.button.focus();
    await tick();
    expect(t.calls.at(-1)).toBe('off');
    stop();
    expect(t.calls.at(-1)).toBe('off');
    expect(window.kkKeepAnswer).toBeUndefined();
  });

  it('goes off at once for a press on a button and back on after it', async () => {
    const t = setup();
    t.field.focus();
    const stop = t.start();
    pointer('pointerdown', t.button);
    expect(t.calls).toEqual(['on', 'off']);
    pointer('pointerup', t.button);
    await tick(100);
    expect(t.calls).toEqual(['on', 'off']);
    await tick(1000);
    expect(t.calls).toEqual(['on', 'off', 'on']);
    // A press beside the field leaves it on.
    pointer('pointerdown', t.spacer);
    pointer('pointerup', t.spacer);
    await tick(1000);
    expect(t.calls).toEqual(['on', 'off', 'on']);
    stop();
  });

  it('takes the focus back from a blur to nothing and asks for the keyboard again', async () => {
    const t = setup();
    t.field.focus();
    const stop = t.start();
    t.field.blur();
    await tick();
    expect(document.activeElement).toBe(t.field);
    expect(t.calls).toEqual(['on', 'reshow']);
    // Not when the focus went to a button (the user moved it).
    t.button.focus();
    await tick();
    expect(document.activeElement).toBe(t.button);
    expect(t.calls).toEqual(['on', 'reshow', 'off']);
    stop();
  });

  it('kkKeepAnswer puts the focus back unless the user moved it; kkKeyboardDismissed holds the keyboard policy', async () => {
    const t = setup();
    t.field.focus();
    const stop = t.start();
    (document.activeElement as HTMLElement).blur();
    expect(window.kkKeepAnswer?.()).toBe(true);
    expect(document.activeElement).toBe(t.field);
    window.kkKeyboardDismissed?.(true);
    expect(t.field.getAttribute('virtualkeyboardpolicy')).toBe('manual');
    pointer('pointerdown', t.spacer);
    expect(t.field.getAttribute('virtualkeyboardpolicy')).toBe('manual');
    pointer('pointerdown', t.field);
    expect(t.field.hasAttribute('virtualkeyboardpolicy')).toBe(false);
    window.kkKeyboardDismissed?.(true);
    window.kkKeyboardDismissed?.(false);
    expect(t.field.hasAttribute('virtualkeyboardpolicy')).toBe(false);
    t.button.focus();
    await tick();
    expect(window.kkKeepAnswer?.()).toBe(false);
    expect(document.activeElement).toBe(t.button);
    stop();
    expect(window.kkKeyboardDismissed).toBeUndefined();
  });
});

describe('keyboard diagnostics', () => {
  afterEach(() => {
    setKeyboardDiagnosticsEnabled(false);
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('logs nothing while off, and elements without their text or value when on', () => {
    kbdLog('focusin', 'x');
    expect(keyboardDiagnosticsLines().length).toBe(0);
    document.body.innerHTML = '<input class="kk-answer" value="secret answer"><p data-testid="q">秘密</p>';
    const input = document.querySelector('input')!;
    const p = document.querySelector('p')!;
    expect(describeTarget(input)).toBe('input.kk-answer');
    expect(describeTarget(p.firstChild)).toBe('p[q]>#text');
    setKeyboardDiagnosticsEnabled(true);
    input.focus();
    kbdLog('ime', 'hidden', 'native', 0);
    const text = keyboardDiagnosticsText();
    expect(text).toContain('P focusin input.kk-answer');
    expect(text).toContain('N ime hidden');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('秘密');
    setKeyboardDiagnosticsEnabled(false);
    const n = keyboardDiagnosticsLines().length;
    input.blur();
    expect(keyboardDiagnosticsLines().length).toBe(n);
  });
});
