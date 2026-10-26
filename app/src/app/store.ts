/**
 * A tiny observable store, framework-free: `get()` returns the current immutable snapshot,
 * `subscribe(listener)` is called after every `set`. React binds to it with `useSyncExternalStore`
 * (`ui/hooks/useApp.ts`).
 */
export interface ReadableStore<T> {
  get(): T;
  subscribe(listener: () => void): () => void;
}

export interface Store<T> extends ReadableStore<T> {
  set(next: T): void;
  update(fn: (prev: T) => T): void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const set = (next: T): void => {
    if (Object.is(next, state)) return;
    state = next;
    for (const l of [...listeners]) l();
  };
  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set,
    update: (fn) => set(fn(state)),
  };
}
