/**
 * The study session on a route (`SessionActivity`): starts the route's kind of session when none runs,
 * shows the lesson presentation, the quiz, or sends the user to the summary (state FINISHING) and back to
 * the dashboard (or the level test) once the session is over. A running session of another kind is shown
 * on its own route. Back leaves the session running (Java returns to the dashboard; Resume continues).
 *
 * A new fragment (lesson item, question, answered screen) slides in as Java's with `slide_animations`
 * (`transitions.ts`) while the old one slides out (`exitingFragment.ts`); the keyboard keeper holds the
 * keyboard open between questions.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ankiMode } from '../../../core/anki';
import type { Session, SessionKind } from '../../../core/session';
import { useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths, sessionRoutePath } from '../../routes';
import { Quiz } from './Quiz';
import { SessionLog } from './SessionLog';
import { setSessionLogOpen, useSessionLogOpen } from './sessionLogStore';
import type { SessionRuntime, SessionSnapshot } from './runtime';
import { useSession } from './useSession';
import { slideAnimations } from './displayPrefs';
import { KeyboardKeeper, releaseKeyboard } from './keyboardKeeper';
import { fragmentOf, transitionAnimation, type FragmentInfo, type SlideAnimation } from './transitions';
import { playExit, snapshotFragment } from './exitingFragment';
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
  const { state: appState } = useReady();
  const prefs = appState.prefs;

  // The fragment shown and its slide (`SessionActivity.updateFragment`).
  const frag = session !== null && !logOpen
    ? fragmentOf(session, (s) => s.currentQuestion !== null && ankiMode(prefs, s.type, s.currentQuestion.type))
    : null;
  const fragKey = frag === null ? '' : `${frag.kind}:${frag.id}`;
  const lastFrag = useRef<FragmentInfo | null>(null);
  const slide = useRef<{ key: string; anim: SlideAnimation; n: number }>({ key: '', anim: 'NONE', n: 0 });
  const fragmentRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLDivElement>(null);
  // The fragment being replaced: a still copy of its view, taken before React swaps it out, which slides
  // out under the new one (FragmentTransaction.replace with setCustomAnimations(enter, exit)).
  const exiting = useRef<HTMLElement | null>(null);
  if (frag !== null && slide.current.key !== fragKey && session !== null) {
    const anim = slideAnimations(prefs) ? transitionAnimation(lastFrag.current, frag, session.questionChoiceReason) : 'NONE';
    // Only a slide remounts the wrapper (to play it again).
    slide.current = { key: fragKey, anim, n: slide.current.n + (anim === 'NONE' ? 0 : 1) };
    lastFrag.current = frag;
    exiting.current = anim !== 'NONE' && fragmentRef.current !== null ? snapshotFragment(fragmentRef.current) : null;
  }
  const slideClass = slide.current.anim === 'RTL' ? ' kk-slide-rtl' : slide.current.anim === 'LTR' ? ' kk-slide-ltr' : '';
  const slideN = slide.current.n;
  useLayoutEffect(() => {
    const node = exiting.current;
    exiting.current = null;
    if (node === null || clipRef.current === null || fragmentRef.current === null) return;
    playExit(clipRef.current, fragmentRef.current, node, slide.current.anim === 'LTR' ? 'LTR' : 'RTL');
  }, [slideN]);

  // A new question's field took the focus from the keeper; otherwise let it go.
  useLayoutEffect(() => {
    releaseKeyboard();
  });

  const state = session?.state ?? 'INACTIVE';
  const type = session?.type ?? 'NONE';

  // The log belongs to the running session: it closes when the session ends.
  useEffect(() => {
    if (state === 'INACTIVE' || state === 'FINISHING') setSessionLogOpen(false);
  }, [state]);

  // Set once the screen is on its way out (to the summary, the dashboard, the level test or the running
  // session's route): it stays blank until the next screen shows, as the app's start-up does, instead
  // of a frame of "Loading…" or the empty state with its Dashboard button.
  const leaving = useRef(false);
  useEffect(() => {
    if (!snap.loaded || session === null || leaving.current || (state === 'INACTIVE' && snap.state !== 'INACTIVE')) return;
    if (state === 'INACTIVE') {
      if (snap.finished !== null) {
        const to = snap.finished.levelTestRound !== 0 ? paths.levelTest() : paths.dashboard();
        leaving.current = true;
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
      leaving.current = true;
      navigate(paths.summary(), { replace: true });
      return;
    }
    if (type !== kind) {
      leaving.current = true;
      navigate(sessionPath(type), { replace: true });
    }
  }, [snap.loaded, snap.finished, snap.state, session, state, type, kind, start, rt, navigate]);

  if (!snap.loaded || session === null) return <p className="kk-muted" data-testid="session-loading">Loading…</p>;
  // Blank while leaving: a session that ended in place (not yet reported: `snap.state` is still the old
  // state), the end reported, the summary next, or another kind of session's route next.
  const ending = state === 'INACTIVE' && snap.state !== 'INACTIVE';
  if (leaving.current || ending || (state === 'INACTIVE' && snap.finished !== null) || state === 'FINISHING' || (state !== 'INACTIVE' && type !== kind)) {
    return <div data-testid="session-leaving" aria-busy="true" />;
  }
  if (state === 'INACTIVE') {
    return empty ? (
      <div className="kk-panel" data-testid="session-empty">
        <p>{emptyText}</p>
        <button type="button" className="kk-btn block" onClick={() => navigate(paths.dashboard(), { replace: true })}>Dashboard</button>
      </div>
    ) : <p className="kk-muted" data-testid="session-loading">Loading…</p>;
  }
  if (logOpen) return <SessionLog rt={rt} session={session} />;
  let body: ReactNode;
  if (state === 'IN_LESSON_PRESENTATION') body = presentation?.(rt, snap, session);
  else {
    const q = session.currentQuestion;
    if (q === null) return <p className="kk-muted">Loading…</p>;
    body = <Quiz key={`${q.item.id}:${q.type}`} rt={rt} snap={snap} session={session} question={q} />;
  }
  return (
    <>
      <KeyboardKeeper />
      <div ref={clipRef} className="kk-fragment-clip">
        <div key={slide.current.n} ref={fragmentRef} className={`kk-fragment${slideClass}`}>{body}</div>
      </div>
    </>
  );
}
