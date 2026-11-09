/**
 * The app frame: start-up screen until ready, then the toolbar (title, up
 * arrow on every screen but the dashboard, actions and overflow menu; screens configure it with
 * `useToolbar`) and the current screen. Navigation is through the dashboard's buttons, the toolbar's
 * Search / Dashboard actions and the overflow menu (Settings, Browse/search..., Self-study quiz,
 * About...): there is no bottom tab bar.
 *
 * Screen changes slide in briefly (forward from the right, back from the left: a short version of
 * the Android activity transition); none with `prefers-reduced-motion`.
 *
 * A first start at the dashboard shows the getting-started guide (`/welcome`) instead.
 */
import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { handleBack } from '../../app/back';
import { needsOnboarding } from '../../core/onboarding';
import { useApp, useAppState } from '../hooks/useApp';
import { useLocation, useRoute } from '../hooks/useRoute';
import { paths } from '../routes';
import { preloadScreen, SCREENS } from '../screens';
import { UpdateDialog } from '../update/UpdateDialog';
import { KeyboardDiagnosticsOverlay } from './KeyboardDiagnosticsOverlay';
import { StartupScreen } from './StartupScreen';
import { ToolbarView } from './ToolbarView';

/** Screens likely next from the dashboard: their chunks are fetched when the browser is idle. */
const PRELOAD_AFTER_START = ['reviews', 'lessons', 'summary', 'subject', 'settings', 'browse', 'searchResults'] as const;

/** Last scroll position per screen (path + query), restored when Back returns to it. */
const scrollPositions = new Map<string, number>();

export function AppShell() {
  const app = useApp();
  const state = useAppState();
  const route = useRoute();
  const location = useLocation();
  const ready = state.status.kind === 'ready';

  // Escape = back (desktop browsers); the Android back button calls handleBack the same way.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('dialog[open]')) return; // the dialog's own cancel handles it
      handleBack(() => location.back());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [location]);

  // Fetch the current screen's chunk while the app starts; the likely next ones once idle.
  useEffect(() => {
    void preloadScreen(route.name).catch(() => undefined);
  }, [route.name]);
  useEffect(() => {
    if (!ready) return;
    const run = () => { for (const n of PRELOAD_AFTER_START) void preloadScreen(n).catch(() => undefined); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1500);
  }, [ready]);

  // A first start at the dashboard opens the getting-started guide instead (core onboarding/), once
  // per start; before paint, so the dashboard never shows first.
  const onboardingChecked = useRef(false);
  useLayoutEffect(() => {
    if (!ready || onboardingChecked.current) return;
    onboardingChecked.current = true;
    const s = app.get();
    if (route.name === 'dashboard' && s.learner && needsOnboarding(s.learner, s.prefs, s.mode)) {
      location.navigate(paths.welcome(), { replace: true });
    }
    // Only when start-up finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Direction of the transition: deeper in the history = forward.
  const depthRef = useRef(location.depth());
  const pathRef = useRef(route.path);
  const dirRef = useRef<'none' | 'forward' | 'back'>('none');
  if (pathRef.current !== route.path) {
    const d = location.depth();
    dirRef.current = d < depthRef.current || route.name === 'dashboard' ? 'back' : 'forward';
    depthRef.current = d;
    pathRef.current = route.path;
  }

  // A new screen starts at the top; settings sub-screens (`?screen=`) are screens of their own too.
  // Back (history depth going down) returns to where the screen was scrolled (e.g. the settings root
  // after a sub-screen).
  const query = route.query.toString();
  const scrollKey = `${route.path}?${query}`;
  const keyDepthRef = useRef(location.depth());
  useLayoutEffect(() => {
    const el = document.scrollingElement;
    const d = location.depth();
    const back = d < keyDepthRef.current;
    keyDepthRef.current = d;
    const saved = back ? scrollPositions.get(scrollKey) : undefined;
    if (!back) scrollPositions.delete(scrollKey);
    if (el) el.scrollTop = saved ?? 0;
    // Lazy screens may lay out a frame later: try once more.
    const raf = saved === undefined ? 0 : requestAnimationFrame(() => {
      if (el && el.scrollTop !== saved) el.scrollTop = saved;
    });
    const onScroll = () => {
      if (el) scrollPositions.set(scrollKey, el.scrollTop);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [scrollKey]);

  if (!ready) return <StartupScreen status={state.status} onRetry={() => void app.start()} />;

  const Screen = SCREENS[route.name];
  return (
    <div className="kk-shell" data-route={route.name}>
      <ToolbarView />
      <main key={route.path} className={`kk-main kk-enter-${dirRef.current}`} id="main">
        {state.lastWriteError !== null && (
          <div className="kk-banner error" role="alert">Saving failed: {state.lastWriteError}</div>
        )}
        <Suspense fallback={null}>
          <Screen />
        </Suspense>
      </main>
      {/* Hidden keyboard diagnostics (About → seven taps on the version): the last log lines. */}
      <KeyboardDiagnosticsOverlay />
      {/* Android: the app's own update (start-up check, offer, download, install). */}
      <UpdateDialog />
    </div>
  );
}
