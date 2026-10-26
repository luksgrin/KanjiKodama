/** Router bindings: `<RouterProvider location={…}>`, `useRoute()`, `useNavigate()`, `useBackHandler()`. */
import { createContext, createElement, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { pushBackHandler } from '../../app/back';
import { matchRoute, type HashLocation, type RouteMatch } from '../../app/router';
import { ROUTES, type RouteName } from '../routes';

const LocationContext = createContext<HashLocation | null>(null);

export function RouterProvider({ location, children }: { location: HashLocation; children: ReactNode }) {
  return createElement(LocationContext.Provider, { value: location }, children);
}

export function useLocation(): HashLocation {
  const loc = useContext(LocationContext);
  if (!loc) throw new Error('useLocation outside <RouterProvider>');
  return loc;
}

/** The current route (unknown paths show the dashboard). */
export function useRoute(): RouteMatch<RouteName> {
  const loc = useLocation();
  const path = useSyncExternalStore(loc.subscribe, loc.get, loc.get);
  return useMemo(() => matchRoute(ROUTES, path) ?? matchRoute(ROUTES, '/')!, [path]);
}

export interface Navigate {
  (path: string, options?: { replace?: boolean }): void;
  /** Back in the app's history, else to the dashboard. */
  back(): void;
}

export function useNavigate(): Navigate {
  const loc = useLocation();
  return useMemo(() => {
    const nav = ((path: string, options?: { replace?: boolean }) => loc.navigate(path, options)) as Navigate;
    nav.back = () => {
      if (!loc.back()) loc.navigate('/', { replace: true });
    };
    return nav;
  }, [loc]);
}

/**
 * Claims the back gesture (Android back button, Escape, top bar back) while mounted and `enabled`:
 * `handler` returns true when it handled it (e.g. closed a dialog, asked to quit a session).
 */
export function useBackHandler(handler: () => boolean, enabled = true): void {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  useEffect(() => (enabled ? pushBackHandler(() => ref.current()) : undefined), [enabled]);
}
