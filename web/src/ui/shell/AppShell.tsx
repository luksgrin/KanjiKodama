/**
 * The app frame: start-up screen until ready, then top bar (title, back on non-tab screens), the
 * current screen, and the bottom nav on tab screens. Session screens (lessons, reviews) hide the nav.
 */
import { useEffect } from 'react';
import { handleBack } from '../../app/back';
import { useApp, useAppState } from '../hooks/useApp';
import { useLocation, useNavigate, useRoute } from '../hooks/useRoute';
import { ROUTE_BY_NAME, type RouteName } from '../routes';
import { SCREENS } from '../screens';
import { BottomNav } from './BottomNav';
import { StartupScreen } from './StartupScreen';
import { TopBar } from './TopBar';

const NO_NAV: ReadonlySet<RouteName> = new Set(['lessons', 'reviews', 'summary']);

export function AppShell() {
  const app = useApp();
  const state = useAppState();
  const route = useRoute();
  const navigate = useNavigate();
  const location = useLocation();

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

  useEffect(() => {
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }, [route.path]);

  if (state.status.kind !== 'ready') return <StartupScreen status={state.status} onRetry={() => void app.start()} />;

  const def = ROUTE_BY_NAME[route.name];
  const Screen = SCREENS[route.name];
  const showNav = !NO_NAV.has(route.name);
  // Tabs don't stack: Home resets the history; from Home a tab is pushed (back returns Home); tab to tab replaces.
  const goTab = (path: string) => {
    if (path === '/') location.home();
    else navigate(path, { replace: route.name !== 'dashboard' });
  };
  return (
    <div className={`kk-shell${showNav ? '' : ' no-nav'}`}>
      <TopBar title={def.title} onBack={def.tab ? undefined : () => handleBack(() => { navigate.back(); return true; })} />
      <main className="kk-main" id="main">
        {state.lastWriteError !== null && (
          <div className="kk-banner error" role="alert">Saving failed: {state.lastWriteError}</div>
        )}
        <Screen key={route.path} />
      </main>
      {showNav && <BottomNav current={route.name} onNavigate={goTab} />}
    </div>
  );
}
