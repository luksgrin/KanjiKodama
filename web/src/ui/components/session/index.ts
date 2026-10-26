/**
 * The study session UI on top of core `session/`: the runtime (one session per app, persisted in the
 * Dexie `session` table), the quiz (question view, answer field, quick-action row, Anki mode, item info),
 * the session menu and dialogs. Screens: `screens/{lessons,reviews,summary,selfStudy,levelTest}`.
 *
 * From other screens: `sessionRuntime(app).start('SELF_STUDY', ids)` then `navigate(paths.selfStudyQuiz())`
 * (e.g. "Start self-study quiz" on the search results); `useActiveSession()` for a Resume button
 * (`sessionPath(type)` is the route that shows it).
 */
export { sessionRuntime, setSessionRuntime, SessionRuntime, type FinishedSession, type FloatingState, type SessionEvent, type SessionRuntimeDeps, type SessionSnapshot, type SessionToast } from './runtime';
export { useActiveSession, useSession, useSessionRuntime } from './useSession';
export { SessionScreen, sessionPath, type SessionScreenProps } from './SessionScreen';
export { AnswerField, replayEdit, type AnswerFieldHandle, type AnswerFieldProps } from './AnswerField';
export { QuestionView, questionHint, questionTitle, titleFor } from './QuestionView';
export { Quiz, RichTextView } from './Quiz';
export { SessionDialog, sessionDialogOpen, type SessionDialogProps } from './SessionDialog';
export { answerInputAttributes, ankiButtonsHeight, centerCaret, quizQuestionViewHeight, slideAnimations, stretchQuestionView, type AnswerInputAttributes } from './displayPrefs';
export { useVisibleViewport, visibleHeight } from './visibleViewport';
export { SessionItemInfo } from './SessionItemInfo';
export { useSessionMenu, abandonMessage, wrapupMessage, type SessionMenu } from './SessionMenu';
export { SessionLog, sessionLogGroups, questionStatus, setSessionLogOpen, useSessionLogOpen, SESSION_LOG_TUTORIAL, formatElapsedTime } from './SessionLog';
export { SESSION_PROPERTIES_KEY, fromSessionRecords, loadSession, saveSession, sessionRecords, type SessionMeta } from './sessionStorage';
