/**
 * The top of every quiz screen: the question view in the subject type's colour with the progress counter
 * (top left), special button 3 (top left, after the counter), the SRS indicator (top centre), special
 * button 1 (top right), special button 2 (bottom left), the custom toasts (SRS change, close enough,
 * alternatives), the answered screen's check mark / cross at the right, the subject's characters
 * (inflected when the question has an inflection); below it the question type banner (meaning: white,
 * reading: black, 22 sp) with the question's title. The session menu is in the
 * toolbar (`useSessionMenu`).
 */
import { useEffect, type ReactNode } from 'react';
import { QUESTION_TYPE_INFO, type QuestionType } from '../../../core/answer/questionType';
import type { ContentSubject } from '../../../core/content';
import type { Session } from '../../../core/session';
import type { Preferences } from '../../../core/settings';
import {
  enableSrsIndicator,
  indicateKanjiReadingType,
  kanjiAcceptedReadingType,
  specialButtonBehavior,
  specialButtonCanShow,
  specialButtonLabel,
  type KanjiAcceptedReadingType,
  type SessionButtonState,
} from '../../../core/settings/sessionUi';

/** `Question.getTitle()`: the title with the subject's reading kind when the setting asks for it. */
export function titleFor(type: QuestionType, subject: ContentSubject, prefs: Preferences): string {
  return questionTitle(type, indicateKanjiReadingType(prefs) ? kanjiAcceptedReadingType(subject) : null);
}
import type { SessionToast } from './runtime';
import { useQuizFont } from '../../theme/useQuizFont';
import { useTitleLongPress } from '../subject/TitleActionMode';
import { SubjectChars, subjectGlyphCount } from '../subject/SubjectChars';

/**
 * `QuestionType.getTitle(indicateKanjiReadingType, kanjiAcceptedReadingType)`: the banner and toolbar
 * text. With `indicate_kanji_reading_type` (advanced) a kanji reading question names the reading kind
 * when the kanji accepts only one.
 */
export function questionTitle(type: QuestionType, readingType: KanjiAcceptedReadingType | null = null): string {
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
      if (readingType === 'ONYOMI') return "Kanji On'yomi";
      if (readingType === 'KUNYOMI') return "Kanji Kun'yomi";
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
  /** The answered screen's check mark / cross (`toastAnimation`, `show_answer_toast`); null: none. */
  answerMark?: 'ok' | 'bad' | null;
  /** Anki mode keeps a smaller glyph margin (`setQuizMargins` only without Anki). */
  anki?: boolean;
  /** The answered fragment's Next button (bottom right of the question view, `nextButton`). */
  next?: ReactNode;
  /** `quiz_question_view_height` is set (the height comes from `--kk-qv-fixed`). */
  fixedHeight?: boolean;
}

/** ic_arrow_up / ic_arrow_down (40 × 40 viewport, #00A000 / #A00000), drawn 20 dp as the toast's ImageSpan
 * (`<img src="*"/>  name`: the arrow, one space, the new stage). */
function SrsArrow({ up }: { up: boolean }) {
  return (
    <svg className="kk-quiz-toast-arrow" viewBox="0 0 40 40" width="20" height="20" aria-hidden="true" data-testid={up ? 'srs-arrow-up' : 'srs-arrow-down'}>
      <path fill={up ? '#00A000' : '#A00000'} d={up ? 'M20,0L0,24h12v16h16V24h12L20,0z' : 'M20,40L0,16h12v-16h16V16h12L20,40z'} />
    </svg>
  );
}

function Toast({ toast, onDone }: { toast: SessionToast; onDone(id: number): void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(toast.id), toast.kind === 'close' ? 5000 : 2750);
    return () => clearTimeout(t);
  }, [toast.id, toast.kind, onDone]);
  const arrow = toast.kind === 'srs-up' || toast.kind === 'srs-down' ? <SrsArrow up={toast.kind === 'srs-up'} /> : null;
  return <div className={`kk-quiz-toast ${toast.kind}`} role="status">{arrow}{arrow !== null ? ' ' : null}{toast.text}</div>;
}

export function QuestionView({
  session, subject, characters, questionType, prefs, srsStageName, toasts, onToastDone, onSpecial, answerMark = null, anki = false,
  next, fixedHeight = false,
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
  const len = subjectGlyphCount(subject, characters);
  // Font settings → Select fonts (tap: back to the default face and again); long press: Copy title / search.
  const quizFont = useQuizFont(session, subject.id, subject.characters ?? '', prefs);
  const press = useTitleLongPress(subject, characters, prefs);
  const glyphStyle = {
    ['--len' as string]: len,
    ...(quizFont.font.family !== null ? { fontFamily: `'${quizFont.font.family}', var(--font-ja)` } : {}),
    ...(quizFont.font.padTop > 0 ? { ['--kk-glyph-pad' as string]: quizFont.font.padTop / 100 } : {}),
  };
  const s2 = special(2);
  const bottom = s2 !== null || next !== undefined;
  return (
    <>
      <div className={`kk-quiz-question kk-type--${subject.object}${anki ? ' anki' : ''}${answerMark !== null ? ' with-mark' : ''}${bottom ? ' with-bottom' : ''}${fixedHeight ? ' fixed' : ''}`}
        data-testid="question-view">
        <div className="kk-quiz-top">
          <span className="kk-quiz-progress" data-testid="session-progress">{session.progressText()}</span>
          {special(3)}
          <span className="kk-quiz-srs">{enableSrsIndicator(prefs) && srsStageName !== null ? srsStageName : ''}</span>
          {special(1)}
        </div>
        <div className="kk-quiz-glyph kk-longpress" lang="ja" style={glyphStyle} data-testid="question-text" data-font={quizFont.font.id}
          {...press.handlers} onClick={() => { if (!press.consumeLongPress()) quizFont.toggle(); }}>
          <SubjectChars subject={subject} text={characters} />
        </div>
        {press.node}
        <div className="kk-quiz-bottom">
          {s2}
          {next}
        </div>
        {answerMark !== null && (
          <span className={`kk-quiz-mark ${answerMark}`} aria-hidden="true" data-testid="answer-mark">{answerMark === 'ok' ? '✓' : '✗'}</span>
        )}
        <div className="kk-quiz-toasts">
          {toasts.map((t) => <Toast key={t.id} toast={t} onDone={onToastDone} />)}
        </div>
      </div>
      {questionType !== null && (
        <div className={`kk-quiz-type ${QUESTION_TYPE_INFO[questionType].meaning ? 'meaning' : 'reading'}`} data-testid="question-type">
          {titleFor(questionType, subject, prefs)}
        </div>
      )}
    </>
  );
}
