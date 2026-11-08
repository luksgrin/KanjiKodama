/**
 * Android app: KkWebView's keep-keyboard mode, the native layer under `useKeepAnswerFocus`
 * (keyboardKeeper.tsx). The owner's request: on the unanswered question a tap anywhere but the
 * answer field leaves the keyboard open. The page-level layers stop the focus and selection changes
 * that hide it in the WebViews we can test; on the owner's phone the keyboard still went away, so the
 * native side now also watches the keyboard (window insets) and shows it again when it hides during
 * or right after a touch on the page, whatever the cause (KkWebView.onImeVisibility).
 *
 * The mode is on while the unanswered question shows, its answer field has the focus, no session
 * dialog is open and the page is visible; off on answered screens, other screens, dialogs, a press on
 * a button / link / menu (they keep the browser's behaviour) and when the app is paused (native).
 * A hide without a touch on the page (Back, the keyboard's own hide key, the back gesture) is the
 * user's, and the keyboard then stays hidden until the field is tapped.
 *
 * Also the page's half of a lost focus: when the answer field loses the focus to nothing without a
 * press (a blur from script, a re-render), it takes it back and asks the native side to show the
 * keyboard again (Chromium hid it for the blur and doesn't show it for a focus outside a tap).
 * `window.kkKeepAnswer()` lets the native side make sure the field has the focus before a re-show.
 *
 * After the user hid the keyboard, Chromium would show it again for a tap anywhere on the page (it
 * shows the keyboard after every tap while a field has the focus); `window.kkKeyboardDismissed(true)`
 * makes the field `virtualkeyboardpolicy="manual"` (Chromium then leaves the keyboard alone) until
 * the field itself is pressed, which puts the policy back before the tap shows the keyboard.
 */
import { Capacitor } from '@capacitor/core';
import { useEffect } from 'react';
import { SystemUi } from '../../../platform/androidSystemUi';
import { describeTarget, kbdLog } from '../../shell/keyboardDiagnostics';
import { INTERACTIVE } from './keyboardKeeper';
import { subscribeSessionDialogs } from './SessionDialog';

export interface KeepKeyboardBridge {
  setKeepKeyboard(options: { on: boolean }): Promise<void>;
  reshowKeyboard(): Promise<void>;
}

declare global {
  interface Window {
    /** Native → page: the answer field has the focus (taken back if it was lost to nothing). */
    kkKeepAnswer?: () => boolean;
    /** Native → page: the user hid the keyboard (true) / it shows again (false). */
    kkKeyboardDismissed?: (dismissed: boolean) => void;
  }
}

/** After a press on a button or link, the mode stays off this long after the finger lifts (its click, the focus move, the hide). */
const INTERACTIVE_TAIL_MS = 900;

function isAnswerInput(el: Element | null): el is HTMLInputElement {
  return el instanceof HTMLInputElement && el.classList.contains('kk-answer') && !el.readOnly && !el.disabled;
}

function isKeeper(el: Element | null): boolean {
  return el instanceof HTMLInputElement && el.classList.contains('kk-keyboard-keeper');
}

/** The mode's state for the page as it is now. */
export function keepKeyboardWanted(doc: Document, dialogOpen: boolean): boolean {
  return !dialogOpen && doc.visibilityState === 'visible' && isAnswerInput(doc.activeElement);
}

/** Starts the mode's bookkeeping for one unanswered question; returns the stop function (mode off). */
export function startNativeKeepKeyboard(
  bridge: KeepKeyboardBridge,
  dialogOpen: () => boolean,
  subscribeDialogs: (l: () => void) => () => void = subscribeSessionDialogs,
  doc: Document = document,
  win: Window = window,
): () => void {
  let sent: boolean | null = null;
  const send = (on: boolean, why: string) => {
    if (on === sent) return;
    sent = on;
    kbdLog('keep-mode', `${on ? 'on' : 'off'} (${why})`);
    void bridge.setKeepKeyboard({ on }).catch(() => undefined);
  };
  let pressInteractive = false;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let evalTimer: ReturnType<typeof setTimeout> | undefined;
  const evaluate = (why: string) => {
    send(!pressInteractive && keepKeyboardWanted(doc, dialogOpen()), why);
  };
  const later = (why: string) => {
    if (evalTimer !== undefined) clearTimeout(evalTimer);
    evalTimer = setTimeout(() => {
      evalTimer = undefined;
      evaluate(why);
    }, 0);
  };

  const POLICY = 'virtualkeyboardpolicy';
  const releasePolicy = (why: string) => {
    for (const f of Array.from(doc.querySelectorAll(`input.kk-answer[${POLICY}]`))) {
      f.removeAttribute(POLICY);
      kbdLog('keep-mode', `keyboard policy back to auto (${why})`);
    }
  };
  win.kkKeyboardDismissed = (dismissed: boolean) => {
    const f = doc.activeElement;
    if (dismissed && isAnswerInput(f)) {
      f.setAttribute(POLICY, 'manual');
      kbdLog('keep-mode', 'user hid the keyboard: taps beside the field leave it hidden');
    } else if (!dismissed) releasePolicy('keyboard shown');
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    const t = e.target instanceof Element ? e.target : null;
    // A press on the field: its tap shows the keyboard again (Chromium, policy auto).
    if (t !== null && t.closest('input.kk-answer') !== null) releasePolicy('press on the field');
    const interactive = t !== null && t.closest('input.kk-answer') === null && t.closest(INTERACTIVE) !== null;
    if (pressTimer !== undefined) {
      clearTimeout(pressTimer);
      pressTimer = undefined;
    }
    pressInteractive = interactive;
    if (interactive) send(false, `press on ${describeTarget(t)}`);
  };
  const onPointerEnd = (e: PointerEvent) => {
    if (!e.isPrimary || !pressInteractive) return;
    if (pressTimer !== undefined) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      pressTimer = undefined;
      pressInteractive = false;
      evaluate('after the press');
    }, INTERACTIVE_TAIL_MS);
  };

  const onFocusIn = () => later('focusin');
  const onFocusOut = (e: FocusEvent) => {
    const field = e.target instanceof Element ? e.target : null;
    const wasOn = sent === true;
    const lostToNothing = wasOn && isAnswerInput(field) && e.relatedTarget === null && !pressInteractive && !dialogOpen()
      && doc.visibilityState === 'visible' && doc.hasFocus();
    if (evalTimer !== undefined) clearTimeout(evalTimer);
    evalTimer = setTimeout(() => {
      evalTimer = undefined;
      const a = doc.activeElement;
      if (lostToNothing && isAnswerInput(field) && field.isConnected && (a === null || a === doc.body)) {
        field.focus({ preventScroll: true });
        if (doc.activeElement === field) {
          kbdLog('keep-mode', 'answer field lost the focus to nothing without a press: taken back');
          void bridge.reshowKeyboard().catch(() => undefined);
        }
      }
      evaluate('focusout');
    }, 0);
  };
  const onVisibility = () => later('visibility');
  const unsubscribe = subscribeDialogs(() => later('dialog'));

  win.kkKeepAnswer = () => {
    const a = doc.activeElement;
    if (isAnswerInput(a) || isKeeper(a)) return true;
    if (dialogOpen() || pressInteractive || doc.visibilityState !== 'visible') return false;
    // The focus is on something the user moved it to (a button, a link): leave it.
    if (a !== null && a !== doc.body && a.closest(INTERACTIVE) !== null) return false;
    const f = doc.querySelector('input.kk-answer:not([readonly])');
    if (!isAnswerInput(f)) return false;
    f.focus({ preventScroll: true });
    kbdLog('keep-mode', `native re-show: focus taken back from ${describeTarget(a)}`);
    return doc.activeElement === f;
  };

  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('pointerup', onPointerEnd, true);
  doc.addEventListener('pointercancel', onPointerEnd, true);
  doc.addEventListener('focusin', onFocusIn, true);
  doc.addEventListener('focusout', onFocusOut, true);
  doc.addEventListener('visibilitychange', onVisibility);
  evaluate('question shown');

  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('pointerup', onPointerEnd, true);
    doc.removeEventListener('pointercancel', onPointerEnd, true);
    doc.removeEventListener('focusin', onFocusIn, true);
    doc.removeEventListener('focusout', onFocusOut, true);
    doc.removeEventListener('visibilitychange', onVisibility);
    unsubscribe();
    if (evalTimer !== undefined) clearTimeout(evalTimer);
    if (pressTimer !== undefined) clearTimeout(pressTimer);
    if (win.kkKeepAnswer !== undefined) delete win.kkKeepAnswer;
    if (win.kkKeyboardDismissed !== undefined) delete win.kkKeyboardDismissed;
    releasePolicy('question left');
    send(false, 'question left');
  };
}

const nativeBridge: KeepKeyboardBridge = {
  setKeepKeyboard: (o) => SystemUi.setKeepKeyboard?.(o) ?? Promise.resolve(),
  reshowKeyboard: () => SystemUi.reshowKeyboard?.() ?? Promise.resolve(),
};

/** Quiz: the mode for the unanswered question (`active`), in the Android app only. */
export function useNativeKeepKeyboard(active: boolean, dialogOpen: () => boolean): void {
  useEffect(() => {
    if (!active || Capacitor.getPlatform() !== 'android') return;
    return startNativeKeepKeyboard(nativeBridge, dialogOpen);
  }, [active, dialogOpen]);
}
