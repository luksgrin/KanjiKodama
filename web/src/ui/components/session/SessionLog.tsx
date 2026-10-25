/**
 * The session log (`fragments/SessionLogFragment`, `adapter/sessionlog/*`), opened from the session
 * menu's "Session log...": the session's items under collapsible headers "Abandoned items", "Completed
 * items", "Started items", "Items not started" (with "n items"), one row per item in the subject's
 * colour with the status of each of its questions ("Meaning: Done, 1 incorrect answer").
 *
 * Restricted mode (the default) as Java: the tutorial text with Dismiss (`session_log_dismissed`),
 * not-started items show "?" instead of the subject, started items are not clickable. With
 * `full_session_log` (advanced) every row shows its subject and opens the item page. Not ported: the
 * full log's "Events" list (Java keeps it in memory only).
 *
 * Shown in place of the quiz (it is a fragment of the same activity); back or the toolbar arrow close it.
 */
import { useState } from 'react';
import { QUESTION_TYPE_INFO } from '../../../core/answer/questionType';
import { contentSubject, type LearnerDb } from '../../../core/progression';
import { itemStarted, type Session, type SessionItem } from '../../../core/session';
import { advancedEnabled, prefBoolean } from '../../../core/settings';
import { useApp, useReady } from '../../hooks/useApp';
import { useBackHandler, useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';
import { useToolbar } from '../../shell/toolbar';
import { subjectTitle } from '../subject/subjectText';
import type { SessionRuntime } from './runtime';
import { useSessionMenu } from './SessionMenu';
import { setSessionLogOpen } from './sessionLogStore';

export { setSessionLogOpen, useSessionLogOpen } from './sessionLogStore';

export const SESSION_LOG_TUTORIAL = 'By default, this session log shows only limited information to avoid giving away'
  + ' answers or showing inappropriate hints, and some items are deliberately not clickable.'
  + ' If you want to see the full session log, you can'
  + ' enable it in Settings -> Advanced -> Other.';

/** `SessionItemItemViewHolder.getQuestionStatus`. */
export function questionStatus(item: SessionItem, slot: 1 | 2 | 3 | 4): string | null {
  const question = item.questions.find((q) => QUESTION_TYPE_INFO[q.type].slot === slot);
  if (question === undefined) return null;
  const done = item.done[slot - 1]!;
  const n = item.incorrect[slot - 1]!;
  const title = QUESTION_TYPE_INFO[question.type].shortTitle;
  if (done) {
    if (n === 0) return `${title}: Done, no incorrect answers`;
    if (n === 1) return `${title}: Done, 1 incorrect answer`;
    return `${title}: Done, ${n} incorrect answers`;
  }
  if (n === 0) return `${title}: Unanswered`;
  if (n === 1) return `${title}: 1 incorrect answer`;
  return `${title}: ${n} incorrect answers`;
}

/** `SessionItem.isStarted`. */
const started = itemStarted;

export interface LogGroup {
  tag: 'abandoned' | 'completed' | 'started' | 'notstarted';
  title: string;
  items: SessionItem[];
  /** `isShowButtonInRestrictedMode`. */
  showButton: boolean;
  /** `isClickableInRestrictedMode`. */
  clickable: boolean;
}

/** `SessionLogAdapter.initialize`: the groups in Java's order, empty ones left out. */
export function sessionLogGroups(session: Session): LogGroup[] {
  const items = session.items;
  const groups: LogGroup[] = [
    { tag: 'abandoned', title: 'Abandoned items', items: items.filter((i) => i.state === 'ABANDONED'), showButton: true, clickable: true },
    { tag: 'completed', title: 'Completed items', items: items.filter((i) => i.state === 'PENDING' || i.state === 'REPORTED'), showButton: true, clickable: true },
    { tag: 'started', title: 'Started items', items: items.filter(started), showButton: true, clickable: false },
    { tag: 'notstarted', title: 'Items not started', items: items.filter((i) => i.state === 'ACTIVE' && !started(i)), showButton: false, clickable: false },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** The collapsed headers survive closing the log (`SessionLogAdapter.collapsedTags`). */
const collapsedTags = new Set<string>();

function LogRow({ learner, item, group, full, onOpen }: { learner: LearnerDb; item: SessionItem; group: LogGroup; full: boolean; onOpen(id: number): void }) {
  const subject = contentSubject(learner, item.id);
  const lines = ([1, 2, 3, 4] as const).map((slot) => questionStatus(item, slot)).filter((s): s is string => s !== null);
  const showButton = full || group.showButton;
  const clickable = full || group.clickable;
  const body = (
    <>
      {showButton
        ? <span className="kk-log-chars" lang="ja">{subjectTitle(subject)}</span>
        : <span className="kk-log-chars kk-log-unknown">?</span>}
      <span className="kk-log-status">
        {lines.map((l) => <span key={l}>{l}</span>)}
      </span>
    </>
  );
  return (
    <li className={`kk-log-item kk-type--${subject.object}`} data-testid={`log-item-${item.id}`}>
      {clickable
        ? <button type="button" className="kk-log-row" onClick={() => onOpen(item.id)}>{body}</button>
        : <div className="kk-log-row">{body}</div>}
    </li>
  );
}

export function SessionLog({ rt, session }: { rt: SessionRuntime; session: Session }) {
  const app = useApp();
  const { learner, state } = useReady();
  const navigate = useNavigate();
  const prefs = state.prefs;
  const full = advancedEnabled(prefs) && prefBoolean(prefs, 'full_session_log', false);
  const [, bump] = useState(0);
  const menu = useSessionMenu(rt, session, null);
  useToolbar({ title: 'Session log', color: 'default', back: () => setSessionLogOpen(false), actions: menu.actions });
  useBackHandler(() => { setSessionLogOpen(false); return true; }, true);
  const groups = sessionLogGroups(session);
  const showTutorial = !full && !prefBoolean(prefs, 'session_log_dismissed', false);

  return (
    <section className="kk-session-log" data-testid="session-log">
      {showTutorial && (
        <div className="kk-tutorial" data-testid="session-log-tutorial">
          <p>{SESSION_LOG_TUTORIAL}</p>
          <button type="button" className="kk-tutorial-dismiss" onClick={() => void app.setPreference('session_log_dismissed', true)}>Dismiss</button>
        </div>
      )}
      {groups.map((g) => {
        const collapsed = collapsedTags.has(g.tag);
        return (
          <div key={g.tag} className="kk-log-group">
            <button type="button" className="kk-log-header" aria-expanded={!collapsed} data-testid={`log-header-${g.tag}`}
              onClick={() => {
                if (collapsed) collapsedTags.delete(g.tag);
                else collapsedTags.add(g.tag);
                bump((n) => n + 1);
              }}>
              <span className={`kk-log-arrow${collapsed ? ' collapsed' : ''}`} aria-hidden="true" />
              <span className="kk-log-title">{g.title}</span>
              <span className="kk-log-details">{g.items.length === 1 ? '1 item' : `${g.items.length} items`}</span>
            </button>
            {!collapsed && (
              <ul className="kk-log-list">
                {g.items.map((i) => (
                  <LogRow key={i.id} learner={learner} item={i} group={g} full={full}
                    onOpen={(id) => navigate(paths.subject(id))} />
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {menu.dialogs}
    </section>
  );
}
