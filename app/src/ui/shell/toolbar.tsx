/**
 * The Java app's toolbar (AbstractActivity + res/menu/main_options_menu.xml /
 * generic_options_menu.xml): title (and subtitle), back arrow on every screen but the dashboard,
 * the "ifRoom" actions as icons (Search, Dashboard, Mute) and an overflow menu (⋮) with the rest in
 * the Java menu order.
 *
 * Screens configure it with `useToolbar({...})` (any component may call it; later calls' defined
 * fields override earlier ones, actions are merged). Screen actions whose `id` is a Java menu id
 * without the `action_` prefix (`session_log`, `abandon_session`, `wrapup_session`,
 * `view_last_finished`, `back_to_presentation`, `study_materials`, `sync_subject`,
 * `search_result_refine`, …) are placed at the Java position; an action with the id of a built-in
 * item (`settings`, `search`, `dashboard`, `mute`, `download_audio`, `browse`, `fast_travel`,
 * `level_test`, `self_study`, `sync_now`, `about`) replaces its fields (`hidden: true` hides it).
 * Other ids go before "About...".
 */
import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createStore } from '../../app/store';

export type ToolbarColor = 'default' | 'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary' | { bg: string; fg: string };

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: string;
  onSelect(): void;
  /** Shown as an icon in the toolbar (Java `showAsAction="ifRoom"`); else in the overflow menu. */
  showAsAction?: boolean;
  /** A checkable menu item (rendered with a check box). */
  checked?: boolean;
  disabled?: boolean;
  /** Hides the item (mainly to hide a built-in one, as Java's `setVisible(false)`). */
  hidden?: boolean;
}

export interface ToolbarOptions {
  title?: ReactNode;
  subtitle?: ReactNode;
  color?: ToolbarColor;
  actions?: ToolbarAction[];
  /** true: back arrow → back; a function: back arrow calls it; false: no arrow. Default: every screen but the dashboard. */
  back?: boolean | (() => void);
  /** Text put into the search box when it is opened (Java `getPrefillSearchQuery`). */
  searchPrefill?: string;
}

interface Entry {
  id: number;
  opts: ToolbarOptions;
}

const entries = createStore<readonly Entry[]>([]);
let seq = 0;

function upsert(id: number, opts: ToolbarOptions): void {
  entries.update((list) => {
    const i = list.findIndex((e) => e.id === id);
    if (i < 0) return [...list, { id, opts }];
    const next = list.slice();
    next[i] = { id, opts };
    return next;
  });
}

function drop(id: number): void {
  entries.update((list) => list.filter((e) => e.id !== id));
}

/** Configures the toolbar for as long as the calling component is mounted. */
export function useToolbar(opts: ToolbarOptions): void {
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = ++seq;
  const id = idRef.current;
  useLayoutEffect(() => {
    upsert(id, opts);
  });
  useLayoutEffect(() => () => drop(id), [id]);
}

/** The merged options of every mounted `useToolbar` (for the shell). */
export function useToolbarOptions(): ToolbarOptions {
  const list = useSyncExternalStore(entries.subscribe, entries.get, entries.get);
  return mergeOptions(list.map((e) => e.opts));
}

export function mergeOptions(list: readonly ToolbarOptions[]): ToolbarOptions {
  const out: ToolbarOptions = {};
  const actions: ToolbarAction[] = [];
  for (const o of list) {
    if (o.title !== undefined) out.title = o.title;
    if (o.subtitle !== undefined) out.subtitle = o.subtitle;
    if (o.color !== undefined) out.color = o.color;
    if (o.back !== undefined) out.back = o.back;
    if (o.searchPrefill !== undefined) out.searchPrefill = o.searchPrefill;
    if (o.actions) {
      for (const a of o.actions) {
        const i = actions.findIndex((x) => x.id === a.id);
        if (i >= 0) actions[i] = { ...actions[i]!, ...a };
        else actions.push(a);
      }
    }
  }
  if (actions.length > 0) out.actions = actions;
  return out;
}

/** Test helper: forget every registration. */
export function resetToolbar(): void {
  entries.set([]);
}
