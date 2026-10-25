/**
 * The top of every quiz screen (`AbstractSessionFragment.onViewCreatedCommon`, layouts
 * `fragment_*_question.xml`): the question view in the subject type's colour with the progress counter
 * (top left), special button 3 (top left, after the counter), the SRS indicator (top centre), special
 * button 1 (top right), special button 2 (bottom left), the session menu (bottom right), the toasts, the
 * subject's characters (inflected when the question has an inflection); below it the question type banner
 * (meaning: light, reading: dark, as Java's hint colours) with `Question.getTitle()`.
 */
import { useEffect, type ReactNode } from 'react';
import { QUESTION_TYPE_INFO, type QuestionType } from '../../../core/answer/questionType';
import type { ContentSubject } from '../../../core/content';
import type { Session } from '../../../core/session';
import type { Preferences } from '../../../core/settings';
import {
  enableSrsIndicator,
  specialButtonBehavior,
  specialButtonCanShow,
  specialButtonLabel,
  type SessionButtonState,
} from '../../../core/settings/sessionUi';
import type { SessionToast } from './runtime';

/** `QuestionType.getTitle(indicateKanjiReadingType, …)`: the banner and toolbar text. */
export function questionTitle(type: QuestionType): string {
  switch (type) {
    case 'WANIKANI_RADICAL_NAME':
      return 'Radical Name';
    case 'WANIKANI_KANJI_MEANING':
      return 'Kanji Meaning';
    case 'WANIKANI_VOCAB_MEANING':
      return 'Vocabulary Meaning';
    case 'WANIKANI_KANA_VOCAB_MEANING':
      return 'Kana Vocabulary Meaning';
    case 'WANIKANI_KANJI_READING':
      return 'Kanji Reading';
    case 'WANIKANI_VOCAB_READING':
      return 'Vocabulary Reading';
    case 'WANIKANI_KANJI_ONYOMI':
      return "Kanji On'yomi";
    case 'WANIKANI_KANJI_KUNYOMI':
      return "Kanji Kun'yomi";
  }
}

/** `QuestionType.getHint(false)`. */
export function questionHint(type: QuestionType): string {
  return QUESTION_TYPE_INFO[type].kana ? '答え' : 'Your response';
}

/** The state the special buttons read. */
export function buttonState(s: Session): SessionButtonState {
  return { active: s.isActive(), answered: s.answered, correct: s.correct, canUndo: s.canUndo() };
}

export interface QuestionViewProps {
  session: Session;
  subject: ContentSubject;
  /** `Question.getCharacters`: inflected characters, else the subject's (null: image radical, slug shown). */
  characters: string | null;
  questionType: QuestionType | null;
  prefs: Preferences;
  /** The SRS stage name of the subject (`subject.getSrsStage().getName()`), null when initial. */
  srsStageName: string | null;
  toasts: readonly SessionToast[];
  onToastDone(id: number): void;
  onSpecial(button: 1 | 2 | 3): void;
  /** The session menu button (bottom right). */
  menu?: ReactNode;
  /** Anki mode keeps a smaller glyph margin (`setQuizMargins` only without Anki). */
  anki?: boolean;
}

function Toast({ toast, onDone }: { toast: SessionToast; onDone(id: number): void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(toast.id), toast.kind === 'close' ? 5000 : 2750);
    return () => clearTimeout(t);
  }, [toast.id, toast.kind, onDone]);
  const arrow = toast.kind === 'srs-up' ? '▲ ' : toast.kind === 'srs-down' ? '▼ ' : '';
  return <div className={`kk-quiz-toast ${toast.kind}`} role="status">{arrow}{toast.text}</div>;
}

export function QuestionView({
  session, subject, characters, questionType, prefs, srsStageName, toasts, onToastDone, onSpecial, menu, anki = false,
}: QuestionViewProps) {
  const state = buttonState(session);
  const special = (n: 1 | 2 | 3) => {
    const b = specialButtonBehavior(prefs, n);
    if (!specialButtonCanShow(b, state)) return null;
    return (
      <button type="button" className={`kk-quiz-special s${n}`} onClick={() => onSpecial(n)} data-testid={`special-${n}`}>
        {specialButtonLabel(b, session.isLightningModeActive())}
      </button>
    );
  };
  const text = characters ?? subject.slug ?? '';
  const len = Math.max(1, [...text].length);
  return (
    <>
      <div className={`kk-quiz-question kk-type--${subject.object}${anki ? ' anki' : ''}`} data-testid="question-view">
        <div className="kk-quiz-top">
          <span className="kk-quiz-progress" data-testid="session-progress">{session.progressText()}</span>
          {special(3)}
          <span className="kk-quiz-srs">{enableSrsIndicator(prefs) && srsStageName !== null ? srsStageName : ''}</span>
          {special(1)}
        </div>
        <div className="kk-quiz-glyph" lang="ja" style={{ ['--len' as string]: len }} data-testid="question-text">{text}</div>
        <div className="kk-quiz-bottom">
          {special(2)}
          <span className="kk-quiz-spacer" />
          {menu}
        </div>
        <div className="kk-quiz-toasts">
          {toasts.map((t) => <Toast key={t.id} toast={t} onDone={onToastDone} />)}
        </div>
      </div>
      {questionType !== null && (
        <div className={`kk-quiz-type ${QUESTION_TYPE_INFO[questionType].meaning ? 'meaning' : 'reading'}`} data-testid="question-type">
          {questionTitle(questionType)}
        </div>
      )}
    </>
  );
}
