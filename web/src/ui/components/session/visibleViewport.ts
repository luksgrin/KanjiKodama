/**
 * The height that is visible above the on-screen keyboard, for the quiz layout (Java's session fragments
 * are `match_parent` in an activity the keyboard resizes, so the quick-action row sits on the keyboard).
 *
 * - The Android app's WebView is resized by the keyboard (adjustResize): `innerHeight` already ends at it.
 * - iOS Safari / WKWebView and Android Chrome (`interactive-widget=resizes-visual`) keep the layout
 *   viewport and shrink the visual viewport: `visualViewport.height` is the visible part.
 *
 * While a quiz is mounted, `--kk-visible-height` on `<html>` holds that height in px and
 * `kk-keyboard-open` is set when the keyboard (or anything else) covers more than 120 px of the window.
 * When the visual viewport is panned (iOS scrolls the page to show a focused field), the page is
 * scrolled back so the toolbar stays on screen, as in the Java app.
 */
import { useLayoutEffect } from 'react';

/** Visible height in CSS px. */
export function visibleHeight(win: Window = window): number {
  const vv = win.visualViewport;
  const h = vv && vv.height > 0 ? Math.min(vv.height, win.innerHeight || vv.height) : win.innerHeight;
  return Math.round(h);
}

let users = 0;

function update(): void {
  const root = document.documentElement;
  const h = visibleHeight();
  root.style.setProperty('--kk-visible-height', `${h}px`);
  root.classList.toggle('kk-keyboard-open', window.innerHeight - h > 120);
  const vv = window.visualViewport;
  if (vv && vv.offsetTop > 0 && root.classList.contains('kk-keyboard-open') && window.scrollY > 0) {
    window.scrollTo(0, 0);
  }
}

/** Keeps `--kk-visible-height` current while `active`. */
export function useVisibleViewport(active = true): void {
  useLayoutEffect(() => {
    if (!active) return;
    users++;
    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      if (--users === 0) {
        document.documentElement.style.removeProperty('--kk-visible-height');
        document.documentElement.classList.remove('kk-keyboard-open');
      }
    };
  }, [active]);
}
