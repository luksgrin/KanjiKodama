/**
 * Android window chrome that the page can't set itself (native side: app/android/.../SystemUiPlugin.java,
 * KkWebView.java):
 *
 * - Bar colours. The status bar takes the toolbar's colour (dark, or the subject type colour in
 *   sessions and on item pages) and the navigation bar the page background, with matching icon
 *   colours. This samples the colours at the top and bottom edge of the page (whatever the UI draws
 *   there, including a modal dialog's backdrop) and hands them to the native side whenever the page
 *   changes. On WebView 140+ the page draws behind the bars and only the icon colours matter.
 * - IME flags of the answer field from the Keyboard
 *   input settings (`answerKeyboard.ts`): "no personalized learning", force ASCII, auto-correct,
 *   'visible password' and the keyboard language hint, for the focused `input.kk-answer`.
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { answerKeyboardFor, type AnswerKeyboard } from './answerKeyboard';

export interface BarColors {
  top: string;
  bottom: string;
  /** Light background: dark icons. */
  lightTop: boolean;
  lightBottom: boolean;
}

/** KkWebView.setImeHints: the answer field's flags (`answerField` false: Chromium's own EditorInfo). */
export type ImeHints = AnswerKeyboard;

export interface SystemUiPlugin {
  setBarColors(options: BarColors): Promise<void>;
  setImeHints(options: ImeHints): Promise<void>;
  /** The WebView's width in dp (absent in tests). */
  getViewWidth?(): Promise<{ width: number }>;
  /** KkWebView's keep-keyboard mode (ui/components/session/nativeKeepKeyboard.ts). */
  setKeepKeyboard?(options: { on: boolean }): Promise<void>;
  /** The page took the answer field's focus back: show the keyboard again unless the user hid it. */
  reshowKeyboard?(): Promise<void>;
  /** KkWebView's keyboard events as `imeDiagnostics` events (ui/shell/keyboardDiagnostics.ts). */
  setImeDiagnostics?(options: { on: boolean }): Promise<void>;
  addListener(event: 'imeDiagnostics', cb: (e: ImeDiagnosticsEvent) => void): Promise<PluginListenerHandle>;
}

/** One native keyboard event: epoch ms, name, detail (no page text). */
export interface ImeDiagnosticsEvent {
  t: number;
  event: string;
  detail: string;
}

export const SystemUi = registerPlugin<SystemUiPlugin>('KkSystemUi');

export type Rgba = readonly [number, number, number, number];

/** Parses `rgb()` / `rgba()` as getComputedStyle returns them (also `#rrggbb`); null otherwise. */
export function parseCssColor(css: string | null | undefined): Rgba | null {
  if (!css) return null;
  const s = css.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (!m) return null;
  let a = 1;
  if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}

/** `over` composited on an opaque `under`. */
export function blend(under: Rgba, over: Rgba): Rgba {
  const a = over[3];
  return [
    Math.round(over[0] * a + under[0] * (1 - a)),
    Math.round(over[1] * a + under[1] * (1 - a)),
    Math.round(over[2] * a + under[2] * (1 - a)),
    1,
  ];
}

export function toHex(c: Rgba): string {
  return '#' + [c[0], c[1], c[2]].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** Relative luminance above the midpoint: such a background wants dark icons. */
export function isLight(c: Rgba): boolean {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  return l > 0.4;
}

const WHITE: Rgba = [255, 255, 255, 1];

/** The opaque colour painted at one point by the page (open dialogs and their backdrops left out). */
export function colorAt(doc: Document, win: Window, x: number, y: number): Rgba {
  const stack = typeof doc.elementsFromPoint === 'function' ? doc.elementsFromPoint(x, y) : [];
  const layers: Rgba[] = [];
  for (const el of stack) {
    if (el.closest('dialog[open]')) continue;
    const c = parseCssColor(win.getComputedStyle(el).backgroundColor);
    if (c && c[3] > 0) {
      layers.push(c);
      if (c[3] >= 1) break;
    }
  }
  let out: Rgba = WHITE;
  if (layers.length === 0 || layers[layers.length - 1]![3] < 1) {
    out = parseCssColor(win.getComputedStyle(doc.body).backgroundColor) ?? WHITE;
    if (out[3] < 1) out = blend(WHITE, out);
  }
  for (let i = layers.length - 1; i >= 0; i--) out = blend(out, layers[i]!);
  return out;
}

/** The ::backdrop colour of an open modal dialog (it covers both edges), or null. */
export function modalBackdrop(doc: Document, win: Window): Rgba | null {
  for (const d of Array.from(doc.querySelectorAll('dialog[open]'))) {
    let modal = false;
    try {
      modal = d.matches(':modal');
    } catch {
      modal = false;
    }
    if (!modal) continue;
    const bd = parseCssColor(win.getComputedStyle(d, '::backdrop').backgroundColor);
    if (bd && bd[3] > 0) return bd;
  }
  return null;
}

export interface EdgeColors {
  top: Rgba;
  bottom: Rgba;
}

/**
 * The page's colours at its top and bottom edge. Under a modal dialog the page is inert and isn't
 * hit-tested, so the colours from before the dialog opened (`base`) are dimmed by its backdrop.
 */
export function sampleEdges(doc: Document, win: Window, base: EdgeColors | null): { page: EdgeColors; shown: EdgeColors } {
  const backdrop = modalBackdrop(doc, win);
  const page = backdrop && base ? base : { top: colorAt(doc, win, 1, 0), bottom: colorAt(doc, win, 1, Math.max(0, win.innerHeight - 1)) };
  const shown = backdrop ? { top: blend(page.top, backdrop), bottom: blend(page.bottom, backdrop) } : page;
  return { page, shown };
}

export function barColors(e: EdgeColors): BarColors {
  return { top: toHex(e.top), bottom: toHex(e.bottom), lightTop: isLight(e.top), lightBottom: isLight(e.bottom) };
}

/** The answer field's IME flags for the focused element (the Keyboard input settings). */
export function imeHintsFor(el: Element | null): ImeHints {
  return answerKeyboardFor(el);
}

let stop: (() => void) | undefined;
let resync: (() => void) | undefined;

/** Starts both syncs (once); returns a stop function (tests). */
export function startAndroidSystemUi(plugin: Pick<SystemUiPlugin, 'setBarColors' | 'setImeHints' | 'getViewWidth'> = SystemUi, doc: Document = document, win: Window = window): () => void {
  if (stop) return stop;
  let last = '';
  let base: EdgeColors | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let late: ReturnType<typeof setTimeout> | undefined;
  const send = (force = false) => {
    let colors: BarColors;
    try {
      const { page, shown } = sampleEdges(doc, win, base);
      base = page;
      colors = barColors(shown);
    } catch {
      return;
    }
    const key = JSON.stringify(colors);
    if (!force && key === last) return;
    last = key;
    void plugin.setBarColors(colors).catch(() => undefined);
  };
  const schedule = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      send();
    }, 30);
    // Again once CSS transitions (dialog fade, colour changes) have settled.
    if (late !== undefined) clearTimeout(late);
    late = setTimeout(() => send(), 400);
  };
  const mo = new MutationObserver(schedule);
  mo.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'open', 'data-theme'] });
  win.addEventListener('hashchange', schedule);
  win.addEventListener('resize', schedule);
  // Chromium rounds the viewport up to whole dp (a 1080 px WebView at 2.625 is 411.43 dp, the page
  // 412.19 px): narrow the root to the WebView's real width so right edges sit on the screen.
  const fitWidth = () => {
    void plugin.getViewWidth?.()
      .then(({ width }) => {
        const excess = (win.visualViewport?.width ?? win.innerWidth) - width;
        if (width > 0 && excess > 0.01 && excess < 2) doc.documentElement.style.width = `${width}px`;
        else doc.documentElement.style.removeProperty('width');
      })
      .catch(() => undefined);
  };
  win.addEventListener('resize', fitWidth);
  fitWidth();
  const mq = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-color-scheme: dark)') : null;
  mq?.addEventListener?.('change', schedule);

  // Deferred so that focusout + focusin (the next question's field) send only the final state.
  let lastIme = '';
  let imeTimer: ReturnType<typeof setTimeout> | undefined;
  const onFocus = () => {
    if (imeTimer !== undefined) clearTimeout(imeTimer);
    imeTimer = setTimeout(() => {
      imeTimer = undefined;
      const hints = imeHintsFor(doc.activeElement);
      const key = JSON.stringify(hints);
      if (key === lastIme) return;
      lastIme = key;
      void plugin.setImeHints(hints).catch(() => undefined);
    }, 0);
  };
  doc.addEventListener('focusin', onFocus, true);
  doc.addEventListener('focusout', onFocus, true);

  resync = () => send(true);
  schedule();
  stop = () => {
    mo.disconnect();
    win.removeEventListener('hashchange', schedule);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('resize', fitWidth);
    mq?.removeEventListener?.('change', schedule);
    doc.removeEventListener('focusin', onFocus, true);
    doc.removeEventListener('focusout', onFocus, true);
    if (timer !== undefined) clearTimeout(timer);
    if (late !== undefined) clearTimeout(late);
    if (imeTimer !== undefined) clearTimeout(imeTimer);
    stop = undefined;
    resync = undefined;
  };
  return stop;
}

/** Re-sends the bar colours (Capacitor's SystemBars.setStyle resets the window background and icon colours). */
export function resyncAndroidSystemUi(): void {
  resync?.();
}
