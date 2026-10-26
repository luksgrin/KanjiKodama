/**
 * `--kk-dpr` on the root: the device pixel ratio, for `--dev-px` (tokens.css). Android takes some sizes in
 * raw device pixels (`setShadowLayer`, `android:shadowRadius` / `shadowDx` / `shadowDy`), so their CSS size
 * is `n / devicePixelRatio`; a fixed CSS size would grow with the density (a 3 px blur reading as ~8 device
 * px on a 2.625 phone). Follows ratio changes (zoom, moving to another screen).
 */
export function trackDevicePixelRatio(root: HTMLElement = document.documentElement): void {
  const apply = (): void => {
    const dpr = window.devicePixelRatio || 1;
    root.style.setProperty('--kk-dpr', String(dpr));
    if (typeof window.matchMedia !== 'function') return;
    window.matchMedia(`(resolution: ${dpr}dppx)`).addEventListener('change', apply, { once: true });
  };
  apply();
}
