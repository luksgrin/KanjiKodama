/**
 * The study session UI on top of core `session/`: the runtime (one session per app, persisted in the
 * Dexie `session` table), the quiz (question view, answer field, quick-action row, Anki mode, item info),
 * the session menu and dialogs. Screens: `screens/{lessons,reviews,summary,selfStudy,levelTest}`.
 *
 * From other screens: `sessionRuntime(app).start('SELF_STUDY', ids)` then `navigate(paths.selfStudyQuiz())`
 * (e.g. "Start self-study quiz" on the search results); `useActiveSession()` for a Resume button
 * (`sessionPath(type)` is the route that shows it).
 */
export { sessionRuntime, setSessionRuntime, SessionRuntime, type FinishedSession, type FloatingState, type SessionRuntimeDeps, type SessionSnapshot, type SessionToast } from './runtime';
export { useActiveSession, useSession, useSessionRuntime } from './useSession';
export { SessionScreen, sessionPath, type SessionScreenProps } from './SessionScreen';
export { AnswerField, replayEdit, type AnswerFieldHandle, type AnswerFieldProps } from './AnswerField';
export { QuestionView, questionHint, questionTitle } from './QuestionView';
export { Quiz, RichTextView } from './Quiz';
export { SessionDialog, type SessionDialogProps } from './SessionDialog';
export { SessionItemInfo } from './SessionItemInfo';
export { SessionMenu, abandonMessage, wrapupMessage } from './SessionMenu';
export { SESSION_PROPERTIES_KEY, fromSessionRecords, loadSession, saveSession, sessionRecords, type SessionMeta } from './sessionStorage';
