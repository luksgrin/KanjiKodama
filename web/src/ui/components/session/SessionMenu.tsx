/**
 * The session part of Java's options menu (`AbstractActivity.onOptionsItemSelected`): Last completed item…,
 * Back to lesson presentation…, Abandon session, Wrap up session, with the same confirmations
 * ("Yes and don't ask again" turns `ui_confirm_*` off).
 */
import { useState } from 'react';
import type { Session } from '../../../core/session';
import { uiConfirmAbandonSession, uiConfirmWrapupSession } from '../../../core/settings/sessionUi';
import { useApp, useAppState } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { SessionDialog } from './SessionDialog';
import type { SessionRuntime } from './runtime';

/** `R.id.action_abandon_session`'s message. */
export function abandonMessage(s: Session): string {
  const numActive = s.numActive();
  const numPending = s.numPending();
  const numReported = s.items.filter((i) => i.state === 'REPORTED').length;
  const numStarted = s.numStarted();
  const numNotStarted = numActive - numStarted;
  let message = 'Are you sure you want to abandon this session? If you do:';
  if (numPending > 0) message += `\n- ${numPending} finished items will not be reported`;
  if (numReported > 0) message += `\n- ${numReported} already finished items will still be reported`;
  if (numStarted > 0) message += `\n- ${numStarted} partially quizzed items will not be reported`;
  if (numNotStarted > 0) message += `\n- ${numNotStarted} unquizzed items will not be reported`;
  return message;
}

/** `R.id.action_wrapup_session`'s message. */
export function wrapupMessage(s: Session): string {
  const numStarted = s.numStarted();
  const numNotStarted = s.numActive() - numStarted;
  let message = 'Are you sure you want to wrap up this session? If you do:';
  if (numStarted > 0) message += `\n- ${numStarted} partially quizzed items will remain in the session`;
  if (numNotStarted > 0) message += `\n- ${numNotStarted} unquizzed items will be removed from the session`;
  return message;
}

export function SessionMenu({ rt, session }: { rt: SessionRuntime; session: Session }) {
  const app = useApp();
  const { prefs } = useAppState();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'abandon' | 'wrapup' | null>(null);

  const abandon = () => void rt.abandon();
  const wrapup = () => void rt.wrapUp();
  const items: { label: string; run: () => void; testId: string }[] = [];
  if (session.lastFinishedSubjectId !== -1) {
    items.push({ label: 'Last completed item...', testId: 'menu-last', run: () => navigate(paths.subject(session.lastFinishedSubjectId)) });
  }
  if (session.type === 'LESSON' && session.isActive()) {
    items.push({ label: 'Back to lesson presentation...', testId: 'menu-presentation', run: () => void rt.backToPresentation() });
  }
  if (session.state !== 'INACTIVE') {
    items.push({ label: 'Abandon session', testId: 'menu-abandon', run: () => (uiConfirmAbandonSession(prefs) ? setDialog('abandon') : abandon()) });
  }
  if (session.canBeWrappedUp()) {
    items.push({ label: 'Wrap up session', testId: 'menu-wrapup', run: () => (uiConfirmWrapupSession(prefs) ? setDialog('wrapup') : wrapup()) });
  }

  return (
    <div className="kk-quiz-menu">
      <button type="button" className="kk-quiz-menu-btn" aria-label="Session menu" aria-expanded={open} aria-haspopup="menu"
        data-testid="session-menu" onClick={() => setOpen((o) => !o)}>⋮</button>
      {open && (
        <ul className="kk-quiz-menu-list" role="menu">
          {items.map((it) => (
            <li key={it.testId} role="none">
              <button type="button" role="menuitem" data-testid={it.testId} onClick={() => { setOpen(false); it.run(); }}>{it.label}</button>
            </li>
          ))}
        </ul>
      )}
      <SessionDialog
        open={dialog === 'abandon'}
        title="Abandon session?"
        message={dialog === 'abandon' ? abandonMessage(session) : ''}
        onNo={() => setDialog(null)}
        onYesDontAsk={() => { setDialog(null); void app.setPreference('ui_confirm_abandon_session', false); abandon(); }}
        onYes={() => { setDialog(null); abandon(); }}
      />
      <SessionDialog
        open={dialog === 'wrapup'}
        title="Wrap up session?"
        message={dialog === 'wrapup' ? wrapupMessage(session) : ''}
        onNo={() => setDialog(null)}
        onYesDontAsk={() => { setDialog(null); void app.setPreference('ui_confirm_wrapup_session', false); wrapup(); }}
        onYes={() => { setDialog(null); wrapup(); }}
      />
    </div>
  );
}
