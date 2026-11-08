/**
 * Android-style Toast: a small dark rounded box near the bottom of the screen with one line of
 * text, shown for Toast.LENGTH_SHORT (2 s) or LENGTH_LONG (3.5 s). One at a time: a new toast
 * replaces the current one (as Android queues/replaces them for one app).
 */
const SHORT_MS = 2000;
const LONG_MS = 3500;

let current: { el: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;

function remove(): void {
  if (!current) return;
  clearTimeout(current.timer);
  current.el.remove();
  current = null;
}

export function toast(text: string, opts: { long?: boolean } = {}): void {
  if (typeof document === 'undefined') return;
  remove();
  const el = document.createElement('div');
  el.className = 'kk-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.dataset.testid = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  const timer = setTimeout(() => {
    el.classList.add('kk-toast-out');
    const t2 = setTimeout(() => { if (current?.el === el) remove(); else el.remove(); }, 250);
    if (current?.el === el) current.timer = t2;
  }, opts.long ? LONG_MS : SHORT_MS);
  current = { el, timer };
}

/** Tests: drop any visible toast. */
export function clearToasts(): void {
  remove();
}
