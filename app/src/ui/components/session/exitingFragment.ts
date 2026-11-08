/**
 * The exit half of the screen slide. Both screens animate at once: the new one translates in
 * (decelerating) while the old one translates out (0 → ∓100%, accelerating, 150 ms), drawn under the
 * new one. React replaces the old view outright, so a still copy of it plays the exit: inert, under the
 * entering screen, removed when the slide ends.
 */

/** A still, inert copy of the fragment's view (text fields keep what was typed). */
export function snapshotFragment(fragment: HTMLElement): HTMLElement {
  const copy = fragment.cloneNode(true) as HTMLElement;
  const from = fragment.querySelectorAll('input, textarea');
  const to = copy.querySelectorAll('input, textarea');
  from.forEach((el, i) => {
    const c = to[i] as HTMLInputElement | HTMLTextAreaElement | undefined;
    if (c !== undefined) {
      c.value = (el as HTMLInputElement | HTMLTextAreaElement).value;
      c.readOnly = true; // keyboardKeeper looks for the live answer field (input.kk-answer:not([readonly]))
      c.tabIndex = -1;
    }
  });
  copy.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  copy.querySelectorAll('[data-testid]').forEach((el) => el.removeAttribute('data-testid'));
  copy.removeAttribute('data-testid');
  copy.className = 'kk-fragment kk-fragment-exit';
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  return copy;
}

/** Slides `copy` out of `clip` under `entering`; it removes itself when done (or with the clip). */
export function playExit(clip: HTMLElement, entering: HTMLElement, copy: HTMLElement, anim: 'RTL' | 'LTR'): void {
  copy.classList.add(anim === 'RTL' ? 'kk-slide-exit-rtl' : 'kk-slide-exit-ltr');
  clip.insertBefore(copy, entering);
  const remove = (): void => { copy.remove(); };
  copy.addEventListener('animationend', remove, { once: true });
  copy.addEventListener('animationcancel', remove, { once: true });
  // No animation (reduced motion, slides off, a test DOM): nothing to wait for.
  setTimeout(remove, 400);
  if (getComputedStyle(copy).animationName === 'none') remove();
}
