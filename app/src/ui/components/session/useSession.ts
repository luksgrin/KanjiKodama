/** React bindings for the session runtime (`runtime.ts`). */
import { useEffect, useSyncExternalStore } from 'react';
import { useApp } from '../../hooks/useApp';
import type { SessionType } from '../../../core/session';
import { sessionRuntime, type SessionRuntime, type SessionSnapshot } from './runtime';

/** The app's session runtime. */
export function useSessionRuntime(): SessionRuntime {
  return sessionRuntime(useApp());
}

/** The runtime and its snapshot (re-renders on every session change); starts loading the stored session. */
export function useSession(): { rt: SessionRuntime; snap: SessionSnapshot } {
  const rt = useSessionRuntime();
  const snap = useSyncExternalStore(rt.subscribe, rt.get, rt.get);
  useEffect(() => {
    void rt.ready().catch(() => undefined);
  }, [rt, snap.loaded]);
  return { rt, snap };
}

/**
 * For other screens (the dashboard's Resume button): whether a session is
 * running and which route shows it.
 */
export function useActiveSession(): { active: boolean; type: SessionType } {
  const { snap } = useSession();
  const s = snap.session;
  return { active: s !== null && s.state !== 'INACTIVE', type: s?.type ?? 'NONE' };
}
