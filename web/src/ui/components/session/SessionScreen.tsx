/**
 * The study session on a route (`SessionActivity`): starts the route's kind of session when none runs,
 * shows the lesson presentation, the quiz, or sends the user to the summary (state FINISHING) and back to
 * the dashboard (or the level test) once the session is over. A running session of another kind is shown
 * on its own route. Back leaves the session running (Java returns to the dashboard; Resume continues).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, SessionKind } from '../../../core/session';
import { useNavigate } from '../../hooks/useRoute';
import { paths, sessionRoutePath } from '../../routes';
import { Quiz } from './Quiz';
import { SessionLog } from './SessionLog';
import { setSessionLogOpen, useSessionLogOpen } from './sessionLogStore';
import type { SessionRuntime, SessionSnapshot } from './runtime';
import { useSession } from './useSession';
import './session.css';

/** The route that shows a running session of this kind. */
export function sessionPath(type: Session['type']): string {
  return sessionRoutePath(type);
}

export interface SessionScreenProps {
  kind: SessionKind;
  /** Starts a session when none runs (lessons/reviews); false when there is nothing to study. */
  start?: (rt: SessionRuntime) => Promise<boolean>;
  /** Shown when `start` found nothing. */
  emptyText: string;
  /** The lesson presentation. */
  presentation?: (rt: SessionRuntime, snap: SessionSnapshot, session: Session) => ReactNode;
}

export function SessionScreen({ kind, start, emptyText, presentation }: SessionScreenProps) {
  const { rt, snap } = useSession();
  const navigate = useNavigate();
  const session = snap.session;
  const [empty, setEmpty] = useState(false);
  const started = useRef(false);
  const logOpen = useSessionLogOpen();

  const state = session?.state ?? 'INACTIVE';
  const type = session?.type ?? 'NONE';

  // The log belongs to the running session: it closes when the session ends.
  useEffect(() => {
    if (state === 'INACTIVE' || state === 'FINISHING') setSessionLogOpen(false);
  }, [state]);

  useEffect(() => {
    if (!snap.loaded || session === null) return;
    if (state === 'INACTIVE') {
      if (snap.finished !== null) {
        const to = snap.finished.levelTestRound !== 0 ? paths.levelTest() : paths.dashboard();
        rt.clearFinished();
        navigate(to, { replace: true });
        return;
      }
      if (start === undefined || started.current) {
        if (start === undefined) setEmpty(true);
        return;
      }
      started.current = true;
      void start(rt).then((ok) => setEmpty(!ok), () => setEmpty(true));
      return;
    }
    if (state === 'FINISHING') {
      navigate(paths.summary(), { replace: true });
      return;
    }
    if (type !== kind) navigate(sessionPath(type), { replace: true });
  }, [snap.loaded, snap.finished, session, state, type, kind, start, rt, navigate]);

  if (!snap.loaded || session === null) return <p className="kk-muted" data-testid="session-loading">Loading…</p>;
  if (state === 'INACTIVE') {
    return empty ? (
      <div className="kk-panel" data-testid="session-empty">
        <p>{emptyText}</p>
        <button type="button" className="kk-btn block" onClick={() => navigate(paths.dashboard(), { replace: true })}>Dashboard</button>
      </div>
    ) : <p className="kk-muted" data-testid="session-loading">Loading…</p>;
  }
  if (type !== kind || state === 'FINISHING') return <p className="kk-muted">Loading…</p>;
  if (logOpen) return <SessionLog rt={rt} session={session} />;
  if (state === 'IN_LESSON_PRESENTATION') return <>{presentation?.(rt, snap, session)}</>;
  const q = session.currentQuestion;
  if (q === null) return <p className="kk-muted">Loading…</p>;
  return <Quiz key={`${q.item.id}:${q.type}`} rt={rt} snap={snap} session={session} question={q} />;
}
