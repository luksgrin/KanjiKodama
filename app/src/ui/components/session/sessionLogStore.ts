/** Whether the session log is open (the session screen shows it in place of the quiz). */
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

export function setSessionLogOpen(value: boolean): void {
  if (open === value) return;
  open = value;
  for (const l of listeners) l();
}

export function useSessionLogOpen(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => open,
    () => open,
  );
}
