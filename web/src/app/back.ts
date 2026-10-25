/**
 * Back handling: a stack of handlers (topmost first) so an open dialog or a running session can
 * claim the back gesture before the router does. The Android back button (platform
 * `lifecycle.onBackButton`, later), the Escape key and the top bar's back button all call
 * `handleBack()`.
 */
export type BackHandler = () => boolean;

const handlers: BackHandler[] = [];

/** Registers a handler (return true when it handled back). Returns the unregister function. */
export function pushBackHandler(h: BackHandler): () => void {
  handlers.push(h);
  return () => {
    const i = handlers.lastIndexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/**
 * Runs the handlers from the top; `fallback` (the router's back) when none handled it. Returns false
 * when nothing could go back: the platform may then exit the app (Android) or do nothing.
 */
export function handleBack(fallback: () => boolean): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) if (handlers[i]!()) return true;
  return fallback();
}
