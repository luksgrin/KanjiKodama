/**
 * A tiny hash router (no dependency): routes are `#/path` so the app works from any base path, from
 * a file URL and inside the Capacitor WebView, and the service worker needs no navigation fallback.
 *
 * Patterns are paths with `:param` segments (`/subject/:id`). `matchRoute` is pure; `hashLocation`
 * binds to `window.location.hash` and `history`.
 */
import { createStore, type ReadableStore } from './store';

export interface RouteDef<N extends string = string> {
  name: N;
  /** `/`, `/settings`, `/subject/:id`. */
  pattern: string;
}

export interface RouteMatch<N extends string = string> {
  name: N;
  params: Record<string, string>;
  /** The path matched, without the query. */
  path: string;
  /** `?a=1&b=2` after the path, parsed. */
  query: URLSearchParams;
}

function split(path: string): string[] {
  return path.split('/').filter((s) => s !== '');
}

/** The first route whose pattern matches `path` (`/x/y?q=1`), or null. */
export function matchRoute<N extends string>(routes: readonly RouteDef<N>[], fullPath: string): RouteMatch<N> | null {
  const q = fullPath.indexOf('?');
  const path = q < 0 ? fullPath : fullPath.slice(0, q);
  const query = new URLSearchParams(q < 0 ? '' : fullPath.slice(q + 1));
  const parts = split(path);
  for (const r of routes) {
    const pat = split(r.pattern);
    if (pat.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      const p = pat[i]!;
      const v = parts[i]!;
      if (p.startsWith(':')) {
        try {
          params[p.slice(1)] = decodeURIComponent(v);
        } catch {
          ok = false;
          break;
        }
      } else if (p !== v) {
        ok = false;
        break;
      }
    }
    if (ok) return { name: r.name, params, path: '/' + parts.join('/'), query };
  }
  return null;
}

/** Builds a path from a pattern: `buildPath('/subject/:id', {id: 5})` → `/subject/5`. */
export function buildPath(pattern: string, params: Record<string, string | number> = {}, query?: Record<string, string | number>): string {
  const path = '/' + split(pattern).map((p) => {
    if (!p.startsWith(':')) return p;
    const v = params[p.slice(1)];
    if (v === undefined) throw new Error(`missing route parameter ${p} for ${pattern}`);
    return encodeURIComponent(String(v));
  }).join('/');
  const qs = query ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString() : '';
  return qs ? `${path}?${qs}` : path;
}

export interface HashLocation extends ReadableStore<string> {
  /** Goes to `path` (`/settings`); `replace` keeps the history length. `/` is `home()`. */
  navigate(path: string, options?: { replace?: boolean }): void;
  /** Back in the app's own history; false when there is none (at the first screen). */
  back(): boolean;
  /** How many entries this session pushed on top of the first screen. */
  depth(): number;
  /** Back to the first entry and `/` (the Home tab), dropping the app's history. */
  home(): void;
  dispose(): void;
}

function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

/**
 * `window.location.hash` as a store. The in-app depth is tracked in `history.state` so "back" knows
 * whether there is an app screen to go back to (else the platform decides: Android exits).
 */
export function createHashLocation(): HashLocation {
  const store = createStore(currentPath());
  const depthOf = (): number => {
    const s = window.history.state as { kkDepth?: number } | null;
    return typeof s?.kkDepth === 'number' ? s.kkDepth : 0;
  };
  if (depthOf() === 0 && window.history.state === null) window.history.replaceState({ kkDepth: 0 }, '');
  const onChange = (): void => store.set(currentPath());
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  const loc: HashLocation = {
    get: store.get,
    subscribe: store.subscribe,
    navigate(path, options = {}) {
      // The dashboard is the root (Java goToMainActivity: CLEAR_TOP): going there, pushed or
      // replacing (the summary's Finish), drops the app's history, so the next back leaves the app
      // instead of landing on a stale dashboard entry.
      if (path === '/') {
        loc.home();
        return;
      }
      if (path === store.get()) return;
      const url = `#${path}`;
      if (options.replace) window.history.replaceState({ kkDepth: depthOf() }, '', url);
      else window.history.pushState({ kkDepth: depthOf() + 1 }, '', url);
      store.set(currentPath());
    },
    back() {
      if (depthOf() <= 0) return false;
      window.history.back();
      return true;
    },
    depth: depthOf,
    home() {
      const d = depthOf();
      const toRoot = (): void => {
        if (currentPath() !== '/') window.history.replaceState({ kkDepth: 0 }, '', '#/');
        store.set(currentPath());
      };
      if (d <= 0) {
        toRoot();
        return;
      }
      window.addEventListener('popstate', toRoot, { once: true });
      window.history.go(-d);
    },
    dispose() {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    },
  };
  return loc;
}

/** An in-memory location (tests, previews): same interface, no window. */
export function createMemoryLocation(initial = '/'): HashLocation {
  const store = createStore(initial);
  const stack = [initial];
  return {
    get: store.get,
    subscribe: store.subscribe,
    navigate(path, options = {}) {
      if (path === '/') {
        stack.splice(0, stack.length, '/');
        store.set('/');
        return;
      }
      if (options.replace) stack[stack.length - 1] = path;
      else stack.push(path);
      store.set(path);
    },
    back() {
      if (stack.length <= 1) return false;
      stack.pop();
      store.set(stack[stack.length - 1]!);
      return true;
    },
    depth: () => stack.length - 1,
    home() {
      stack.splice(0, stack.length, '/');
      store.set('/');
    },
    dispose() {},
  };
}
