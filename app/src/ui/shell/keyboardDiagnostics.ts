/**
 * Keyboard diagnostics (hidden: About → tap the app version 7 times). While on, a timestamped log of
 * what decides whether the on-screen keyboard stays: focus and blur, selection changes, presses,
 * the visual viewport (the keyboard's height), page visibility, the keep-keyboard mode and, in the
 * Android app, KkWebView's native events (keyboard insets shown / hidden, touches, the Back key,
 * view and window focus, input connections, re-shows). The owner copies or shares it from About.
 *
 * Privacy: elements are described by tag, classes and test id only, never by text or value; the
 * selection by the node it sits in and whether it is a caret or a range. No answers, no token.
 * The log is a ring buffer kept in localStorage so that it survives a restart of the app.
 */
import { Capacitor } from '@capacitor/core';
import { SystemUi } from '../../platform/androidSystemUi';

const ENABLED_KEY = 'kk-keyboard-diagnostics';
const LOG_KEY = 'kk-keyboard-diagnostics-log';
const MAX_LINES = 1500;

let lines: string[] = [];
let loaded = false;
let enabled: boolean | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let detach: (() => void) | undefined;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const raw = storage()?.getItem(LOG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) lines = parsed.filter((l): l is string => typeof l === 'string').slice(-MAX_LINES);
  } catch {
    lines = [];
  }
}

function save(): void {
  if (saveTimer !== undefined) return;
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    try {
      storage()?.setItem(LOG_KEY, JSON.stringify(lines));
    } catch {
      // storage full or blocked: the in-memory log still works
    }
  }, 500);
}

function notify(): void {
  for (const l of listeners) l();
}

function stamp(t: number): string {
  const d = new Date(t);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** Whether the diagnostics are on (persisted). */
export function keyboardDiagnosticsEnabled(): boolean {
  if (enabled === null) {
    try {
      enabled = storage()?.getItem(ENABLED_KEY) === '1';
    } catch {
      enabled = false;
    }
  }
  return enabled;
}

/** Adds a line (no-op while off). `source`: "page" or "native". */
export function kbdLog(event: string, detail: string = '', source: 'page' | 'native' = 'page', t: number = Date.now()): void {
  if (!keyboardDiagnosticsEnabled()) return;
  load();
  lines.push(`${stamp(t)} ${source === 'native' ? 'N' : 'P'} ${event}${detail ? ' ' + detail : ''}`);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  save();
  notify();
}

export function keyboardDiagnosticsLines(): readonly string[] {
  load();
  return lines;
}

/** The whole log as text (with a header: app version, user agent, screen). */
export function keyboardDiagnosticsText(): string {
  const head = [
    `KanjiKodama ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''} keyboard diagnostics`,
    `user agent: ${typeof navigator === 'undefined' ? '' : navigator.userAgent}`,
    `screen: ${typeof screen === 'undefined' ? '' : `${screen.width}x${screen.height}`} @${typeof devicePixelRatio === 'number' ? devicePixelRatio : ''}`,
    'P = page event, N = native (KkWebView) event',
    '',
  ];
  return head.concat(keyboardDiagnosticsLines()).join('\n') + '\n';
}

export function clearKeyboardDiagnostics(): void {
  load();
  lines = [];
  save();
  notify();
}

export function subscribeKeyboardDiagnostics(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function setKeyboardDiagnosticsEnabled(on: boolean): void {
  try {
    if (on) storage()?.setItem(ENABLED_KEY, '1');
    else storage()?.removeItem(ENABLED_KEY);
  } catch {
    // not persisted; still applies until the app restarts
  }
  enabled = on;
  if (on) {
    kbdLog('diagnostics', 'on');
    startKeyboardDiagnostics();
  } else {
    detach?.();
    detach = undefined;
  }
  notify();
}

/** An element without its text: tag, classes, test id (and the answer field's state). */
export function describeTarget(t: EventTarget | null | undefined): string {
  if (t === null || t === undefined) return 'null';
  if (t === window) return 'window';
  if (t === document) return 'document';
  if (!(t instanceof Node)) return 'other';
  const el = t instanceof Element ? t : t.parentElement;
  if (el === null) return t.nodeName.toLowerCase();
  let s = el.tagName.toLowerCase();
  const cls = Array.from(el.classList).slice(0, 3);
  if (cls.length > 0) s += '.' + cls.join('.');
  const id = el.getAttribute('data-testid');
  if (id) s += `[${id}]`;
  if (el instanceof HTMLInputElement && el.readOnly) s += '(readonly)';
  if (!(t instanceof Element)) s += '>#text';
  return s;
}

function describeSelection(): string {
  const sel = typeof document.getSelection === 'function' ? document.getSelection() : null;
  if (sel === null || sel.rangeCount === 0) return 'none';
  const a = document.activeElement;
  const inField = a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement
    ? sel.anchorNode !== null && sel.anchorNode.contains(a) ? ' (in the focused field)' : ''
    : '';
  return `${sel.type} at ${describeTarget(sel.anchorNode)}${inField}`;
}

/** Attaches the page and native listeners (once, while on). Called at start-up and when turned on. */
export function startKeyboardDiagnostics(): void {
  if (detach || !keyboardDiagnosticsEnabled() || typeof document === 'undefined') return;
  const opts = { capture: true, passive: true } as const;
  const onFocusIn = (e: FocusEvent) => kbdLog('focusin', `${describeTarget(e.target)} from ${describeTarget(e.relatedTarget)}`);
  const onFocusOut = (e: FocusEvent) => kbdLog('focusout', `${describeTarget(e.target)} to ${describeTarget(e.relatedTarget)} (doc focus ${document.hasFocus()})`);
  let lastSel = '';
  const onSelection = () => {
    const s = describeSelection();
    if (s === lastSel) return;
    lastSel = s;
    kbdLog('selection', s);
  };
  const onPointer = (e: PointerEvent) => kbdLog(e.type, `${e.pointerType} ${Math.round(e.clientX)},${Math.round(e.clientY)} on ${describeTarget(e.target)}${e.defaultPrevented ? ' (cancelled)' : ''}`);
  const onMouse = (e: MouseEvent) => kbdLog(e.type, `on ${describeTarget(e.target)}${e.defaultPrevented ? ' (cancelled)' : ''}`);
  const onSelectStart = (e: Event) => kbdLog('selectstart', `on ${describeTarget(e.target)}`);
  const onContext = (e: Event) => kbdLog('contextmenu', `on ${describeTarget(e.target)}`);
  const onVisibility = () => kbdLog('visibility', document.visibilityState);
  const onWinFocus = () => kbdLog('window', 'focus');
  const onWinBlur = () => kbdLog('window', 'blur');
  const vv = window.visualViewport;
  let lastVv = '';
  const onViewport = () => {
    if (!vv) return;
    const s = `${Math.round(vv.width)}x${Math.round(vv.height)} (window ${window.innerWidth}x${window.innerHeight})`;
    if (s === lastVv) return;
    lastVv = s;
    kbdLog('viewport', s);
  };
  const onHash = () => kbdLog('route', location.hash.replace(/[?].*$/, ''));
  document.addEventListener('focusin', onFocusIn, opts);
  document.addEventListener('focusout', onFocusOut, opts);
  document.addEventListener('selectionchange', onSelection, opts);
  document.addEventListener('selectstart', onSelectStart, opts);
  document.addEventListener('contextmenu', onContext, opts);
  // Bubbling phase on window: after the page's own handlers, so "cancelled" is known.
  window.addEventListener('pointerdown', onPointer);
  window.addEventListener('pointerup', onPointer);
  window.addEventListener('pointercancel', onPointer);
  window.addEventListener('mousedown', onMouse);
  window.addEventListener('click', onMouse);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onWinFocus);
  window.addEventListener('blur', onWinBlur);
  window.addEventListener('hashchange', onHash);
  vv?.addEventListener('resize', onViewport);
  onViewport();
  kbdLog('state', `route ${location.hash.replace(/[?].*$/, '') || '#/'}, focus ${describeTarget(document.activeElement)}, selection ${describeSelection()}`);

  let nativeHandle: Promise<{ remove: () => Promise<void> }> | undefined;
  const native = Capacitor.isNativePlatform();
  if (native) {
    nativeHandle = SystemUi.addListener('imeDiagnostics', (e) => kbdLog(e.event, e.detail, 'native', e.t));
    void SystemUi.setImeDiagnostics?.({ on: true })?.catch(() => undefined);
  }
  detach = () => {
    document.removeEventListener('focusin', onFocusIn, opts);
    document.removeEventListener('focusout', onFocusOut, opts);
    document.removeEventListener('selectionchange', onSelection, opts);
    document.removeEventListener('selectstart', onSelectStart, opts);
    document.removeEventListener('contextmenu', onContext, opts);
    window.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('pointerup', onPointer);
    window.removeEventListener('pointercancel', onPointer);
    window.removeEventListener('mousedown', onMouse);
    window.removeEventListener('click', onMouse);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onWinFocus);
    window.removeEventListener('blur', onWinBlur);
    window.removeEventListener('hashchange', onHash);
    vv?.removeEventListener('resize', onViewport);
    if (native) {
      void nativeHandle?.then((h) => h.remove()).catch(() => undefined);
      void SystemUi.setImeDiagnostics?.({ on: false })?.catch(() => undefined);
    }
  };
}
