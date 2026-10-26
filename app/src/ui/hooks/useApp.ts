/**
 * React bindings for the app state layer (`src/app/`). Wrap the tree in `<AppProvider app={…}>`;
 * screens then use:
 * - `useApp()`: the controller (`write`, `saveProgress`, `restoreProgress`, …);
 * - `useAppState()`: the whole `AppState` (re-renders on every change);
 * - `useReady()`: learner, content, platform and state once ready (screens render only then);
 *   memoize derived values on `state.revision` and `state.now`.
 */
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { AppController, AppState } from '../../app/appController';
import type { LearnerDb } from '../../core/progression';
import type { LoadedContent } from '../../content/contentFile';
import type { Platform } from '../../platform';

const AppContext = createContext<AppController | null>(null);

export function AppProvider({ app, children }: { app: AppController; children: ReactNode }) {
  return createElement(AppContext.Provider, { value: app }, children);
}

export function useApp(): AppController {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp outside <AppProvider>');
  return app;
}

export function useAppState(): AppState {
  const app = useApp();
  return useSyncExternalStore(app.subscribe, app.get, app.get);
}

export interface ReadyState {
  learner: LearnerDb;
  content: LoadedContent;
  platform: Platform;
  state: AppState;
}

/** The ready state; throws when used before start-up finished (the shell renders screens only when ready). */
export function useReady(): ReadyState {
  const state = useAppState();
  if (state.status.kind !== 'ready' || !state.learner || !state.content || !state.platform) {
    throw new Error('screen rendered before the app was ready');
  }
  return { learner: state.learner, content: state.content, platform: state.platform, state };
}
