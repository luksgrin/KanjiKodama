/**
 * Android's touch mode, as `:root.kk-nontouch` (set while out of touch mode). A focused view shows its focus
 * highlight only out of touch mode: Android leaves touch mode on a navigation key (D-pad / arrows / Tab)
 * and goes back on any touch. In touch mode a Button can't take the focus at all, so the focus given to
 * Next and Finish is invisible on a phone. The browser's :focus-visible is no substitute:
 * Chrome marks a button focused from script as focus-visible when the focus came from a text field (the
 * answer box), which a touch user never sees on Android.
 */
const NAVIGATION_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function trackFocusMode(root: HTMLElement = document.documentElement, target: Pick<Window, 'addEventListener'> = window): void {
  target.addEventListener('keydown', (e: Event) => {
    const k = e as KeyboardEvent;
    if (k.isComposing || k.keyCode === 229) return; // IME composition, not a key
    if (NAVIGATION_KEYS.has(k.key)) root.classList.add('kk-nontouch');
  }, true);
  target.addEventListener('pointerdown', () => root.classList.remove('kk-nontouch'), true);
}
