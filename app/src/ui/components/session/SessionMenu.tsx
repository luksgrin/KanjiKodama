/**
 * The session part of the options menu as toolbar actions: Session
 * log..., Last completed item..., Back to lesson presentation..., Abandon session, Wrap up session, My
 * notes..., each visible when it applies, with confirmations ("Yes and don't ask again" turns
 * `ui_confirm_*` off) and toasts ("Session abandoned", "Session wrapping up..."). Settings, Mute,
 * Download audio, Browse/search... and About... are the toolbar's built-in items; Self-study quiz is
 * hidden while a session runs.
 */
import { useState, type ReactNode } from 'react';
import type { Session } from '../../../core/session';
import { uiConfirmAbandonSession, uiConfirmWrapupSession } from '../../../core/settings/sessionUi';
import { isMuted, MUTE_PREF } from '../../../app/mute';
import { useApp, useAppState } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import type { ToolbarAction } from '../../shell/toolbar';
import { toast } from '../../shell/toast';
import { NotesDialog } from '../subject/NotesDialog';
import { SessionDialog } from './SessionDialog';
import './session.css';
import { sessionPath } from './SessionScreen';
import { setSessionLogOpen } from './sessionLogStore';
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

export interface SessionMenu {
  /** For `useToolbar({ actions })`. */
  actions: ToolbarAction[];
  /** The confirmations and the notes dialog; render them somewhere in the screen. */
  dialogs: ReactNode;
}

/**
 * The session menu for the current screen. `subjectId`: the screen's current subject
 * (`getCurrentSubject()`, for My notes...), null when there is none (summary, session log). `session`
 * null: not loaded yet (the session items are hidden). `onSessionScreen` false (the item page): the
 * session log opens on the session's screen, and an abandoned session is not reported back to it.
 */
export function useSessionMenu(rt: SessionRuntime, session: Session | null, subjectId: number | null,
  { onSessionScreen = true }: { onSessionScreen?: boolean } = {}): SessionMenu {
  const app = useApp();
  const { prefs } = useAppState();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'abandon' | 'wrapup' | null>(null);
  const [notes, setNotes] = useState<number | null>(null);

  const abandon = () => {
    void rt.abandon().then(() => { if (!onSessionScreen) rt.clearFinished(); });
    toast('Session abandoned');
  };
  const wrapup = () => {
    void rt.wrapUp();
    toast('Session wrapping up...');
  };
  const inactive = session === null || session.state === 'INACTIVE';
  const actions: ToolbarAction[] = [
    {
      id: 'session_log', label: 'Session log...', hidden: inactive, onSelect: () => {
        setSessionLogOpen(true);
        if (!onSessionScreen && session !== null) navigate(sessionPath(session.type));
      },
    },
    {
      id: 'view_last_finished', label: 'Last completed item...', hidden: session === null || session.lastFinishedSubjectId === -1,
      onSelect: () => { if (session !== null) navigate(paths.subject(session.lastFinishedSubjectId)); },
    },
    {
      id: 'back_to_presentation', label: 'Back to lesson presentation...', hidden: !(session !== null && session.type === 'LESSON' && session.isActive()),
      onSelect: () => {
        void rt.backToPresentation();
        if (!onSessionScreen) navigate(paths.lessons());
      },
    },
    {
      id: 'abandon_session', label: 'Abandon session', hidden: inactive,
      onSelect: () => (uiConfirmAbandonSession(prefs) ? setDialog('abandon') : abandon()),
    },
    {
      id: 'wrapup_session', label: 'Wrap up session', hidden: session === null || !session.canBeWrappedUp(),
      onSelect: () => (uiConfirmWrapupSession(prefs) ? setDialog('wrapup') : wrapup()),
    },
    { id: 'study_materials', label: 'My notes...', hidden: subjectId === null, onSelect: () => setNotes(subjectId) },
    { id: 'self_study', label: 'Self-study quiz', hidden: !inactive, onSelect: () => navigate(paths.selfStudy()) },
    // The session toolbar has room for Search and Dashboard only: Mute goes to the overflow.
    {
      id: 'mute', label: isMuted(prefs) ? 'Unmute' : 'Mute', showAsAction: false,
      onSelect: () => void app.setPreference(MUTE_PREF, !isMuted(prefs)),
    },
    { id: 'fast_travel', label: 'Fast travel', hidden: true, onSelect: () => undefined },
    { id: 'level_test', label: 'Level test', hidden: true, onSelect: () => undefined },
  ];

  const dialogs = (
    <>
      <SessionDialog
        open={dialog === 'abandon'}
        warning
        title="Abandon session?"
        message={dialog === 'abandon' && session !== null ? abandonMessage(session) : ''}
        testId="abandon-dialog"
        onNo={() => setDialog(null)}
        onYesDontAsk={() => { setDialog(null); abandon(); void app.setPreference('ui_confirm_abandon_session', false); }}
        onYes={() => { setDialog(null); abandon(); }}
      />
      <SessionDialog
        open={dialog === 'wrapup'}
        warning
        title="Wrap up session?"
        message={dialog === 'wrapup' && session !== null ? wrapupMessage(session) : ''}
        testId="wrapup-dialog"
        onNo={() => setDialog(null)}
        onYesDontAsk={() => { setDialog(null); wrapup(); void app.setPreference('ui_confirm_wrapup_session', false); }}
        onYes={() => { setDialog(null); wrapup(); }}
      />
      <NotesDialog subjectId={notes} onClose={() => setNotes(null)} />
    </>
  );
  return { actions, dialogs };
}
