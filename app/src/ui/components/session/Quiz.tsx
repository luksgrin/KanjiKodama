/**
 * The quiz for the current question of an active session, in three layouts:
 *
 * - unanswered: the question view (its own height: the progress line
 *   and the 104 sp text), the question type banner, the centred underlined answer field, a spacer, and the
 *   quick-action row Don't know | Submit at the bottom, on the keyboard. The quiz fills the height above the
 *   keyboard (`useVisibleViewport`: the Android WebView resizes, iOS / Chrome shrink the visual viewport);
 *   on a very short screen the question view gives up height first, so the row stays visible. Display
 *   settings: `stretch_quiz_question_view` (the question view takes the spacer's room),
 *   `quiz_question_view_height` (a fixed height in dp), `center_caret`. With the keyboard open the row sits
 *   8 px above it, and a tap beside the field keeps the keyboard (docs/behaviour.md);
 * - answered: the question view grows by its Next button (bottom right, focused, the keyboard closes), the answer band, the messages and the item info scroll, and
 *   the second Next sits in Submit's place at the bottom of the screen;
 * - Anki: the question view, banner, answer and item info scroll; the full-width
 *   flat Show answer / Incorrect | Correct / Next bar is pinned at the bottom, `anki_buttons_height` dp high.
 *
 * The toolbar is in the subject's colour with the question title and the session menu (`useSessionMenu`).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { QUESTION_TYPE_INFO } from '../../../core/answer/questionType';
import { digraphMessage } from '../../../core/answer/submit';
import { ankiMode } from '../../../core/anki';
import { meaningSynonymsRichText } from '../../../core/answer/synonymsRichText';
import { parseMeaningSynonyms } from '../../../core/answer/synonyms';
import { contentSubject, progressRow, srsSystemOf } from '../../../core/progression';
import type { Question, Session } from '../../../core/session';
import { hapticFeedbackOnCorrect, hapticFeedbackOnWrong } from '../../../core/settings';
import { showOnInKatakana as showOnInKatakanaSetting } from '../../../core/settings/subjectInfo';
import {
  autoplayAnkiReveal,
  dontKnowCanShow,
  infoDump,
  infoDumpFlags,
  infoDumpRevealLabel,
  infoDumpShowReveal,
  nextButtonDelay,
  showAnswerToast,
  swapAnkiButtons,
} from '../../../core/settings/sessionUi';
import type { RichText } from '../../../core/text/richText';
import type { HapticKind } from '../../../platform';
import { useReady } from '../../hooks/useApp';
import { AnswerField, type AnswerFieldHandle } from './AnswerField';
import { fontSizeAnkiAnswer, fontSizeQuestionEdit, maxFontSizeQuizText } from '../../theme/fontPrefs';
import { QuestionView, buttonState, questionHint, titleFor } from './QuestionView';
import { SessionItemInfo } from './SessionItemInfo';
import { useSessionMenu } from './SessionMenu';
import { useToolbar } from '../../shell/toolbar';
import { answerInputAttributes, ankiButtonsHeight, centerCaret, quizQuestionViewHeight, stretchQuestionView } from './displayPrefs';
import { holdKeyboard, useKeepAnswerFocus } from './keyboardKeeper';
import { useNativeKeepKeyboard } from './nativeKeepKeyboard';
import { sessionDialogOpen } from './SessionDialog';
import type { SessionRuntime, SessionSnapshot } from './runtime';
import { useVisibleViewport } from './visibleViewport';

/** Renders core `RichText` (bold spans). */
export function RichTextView({ value, className, lang }: { value: RichText; className?: string; lang?: string }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  value.spans.forEach(([, start, end], i) => {
    if (start > at) parts.push(value.text.slice(at, start));
    parts.push(<b key={i}>{value.text.slice(start, end)}</b>);
    at = Math.max(at, end);
  });
  if (at < value.text.length) parts.push(value.text.slice(at));
  return <div className={className} lang={lang}>{parts}</div>;
}

function useHaptics(): (kind: HapticKind) => void {
  const { platform } = useReady();
  return (kind) => {
    if (platform.capabilities.haptics) platform.haptics.feedback(kind);
  };
}

/** `Session.isNextButtonFrozen`: re-renders when the delay after a wrong typed answer runs out. */
function useNextFrozen(lastWrong: number, delaySeconds: number): boolean {
  const until = delaySeconds > 0 ? lastWrong + delaySeconds * 1000 : 0;
  const [, tick] = useState(0);
  const frozen = until > Date.now();
  useEffect(() => {
    if (!frozen) return;
    const t = setTimeout(() => tick((n) => n + 1), until - Date.now() + 10);
    return () => clearTimeout(t);
  }, [frozen, until]);
  return frozen;
}

export interface QuizProps {
  rt: SessionRuntime;
  snap: SessionSnapshot;
  session: Session;
  question: Question;
}

export function Quiz({ rt, snap, session, question }: QuizProps) {
  const { learner, state, platform } = useReady();
  const prefs = state.prefs;
  const haptic = useHaptics();
  const field = useRef<AnswerFieldHandle>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const subject = contentSubject(learner, question.item.id);
  const anki = ankiMode(prefs, session.type, question.type);
  const answered = session.answered;
  const floating = snap.floating;
  const stage = srsSystemOf(learner, subject.id).getStage(Number(progressRow(learner, subject.id).srsStage ?? 0));
  const srsName = stage.id === srsSystemOf(learner, subject.id).initialStageId ? null : stage.name;
  const questionKey = `${question.item.id}:${question.type}`;
  const frozen = useNextFrozen(floating.lastTypedIncorrectAnswer, nextButtonDelay(prefs));
  const kana = QUESTION_TYPE_INFO[question.type].kana;
  const title = titleFor(question.type, subject, prefs);
  const menu = useSessionMenu(rt, session, subject.id);
  // The toolbar in the subject's colour with the question title (`getToolbarTitle`, `getToolbarBackgroundColor`).
  useToolbar({ title, color: subject.object, actions: menu.actions });

  // The retry shake (`TranslateAnimation` with a 7-cycle interpolator).
  const lastRetry = useRef(floating.retryCount);
  useEffect(() => {
    if (floating.retryCount !== lastRetry.current) {
      lastRetry.current = floating.retryCount;
      setShake((n) => n + 1);
    }
  }, [floating.retryCount]);

  // An incorrect answer vibrates when the answered screen appears.
  const wrongBuzzed = useRef<string | null>(null);
  useEffect(() => {
    if (answered && !session.correct && !anki && wrongBuzzed.current !== questionKey && hapticFeedbackOnWrong(prefs)) {
      wrongBuzzed.current = questionKey;
      haptic('wrong');
    }
  });

  // One action at a time. Don't know / Submit / Next ignore taps while one runs but keep their look (no
  // pale disabled state, and the exiting copy of the screen slides out in the normal look; see
  // docs/behaviour.md). Next is disabled only by next_button_delay (`frozen`).
  const busyRef = useRef(false);
  const run = async (f: () => Promise<unknown>): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await f();
    } catch {
      // shown through snap.error
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const submit = () => run(async () => {
    const text = field.current?.commit() ?? session.currentAnswer;
    // A correct answer in lightning mode goes straight to the next question's field.
    holdKeyboard();
    const verdict = await rt.submit(text);
    if (verdict === null) return;
    if (verdict.ok && hapticFeedbackOnCorrect(prefs)) haptic('correct');
    if (verdict.retry) {
      if (hapticFeedbackOnWrong(prefs)) haptic('retry');
    }
  });
  // A retry leaves the question unanswered: back to the field (`requestFocusInTouchMode`, `showSoftInput`).
  useEffect(() => {
    if (!answered && !busy && floating.retryCount !== 0) field.current?.focus();
  }, [answered, busy, floating.retryCount]);

  useVisibleViewport();
  // The unanswered question: a tap beside the field leaves the keyboard open (owner's request).
  useKeepAnswerFocus(!answered && !anki, sessionDialogOpen);
  // Android app: and the keyboard is shown again natively if it still goes away (nativeKeepKeyboard.ts).
  useNativeKeepKeyboard(!answered && !anki, sessionDialogOpen);
  const fixedHeight = quizQuestionViewHeight(prefs);
  // Font settings: the question text's cap, the answer field and the Anki answer sizes.
  const quizStyle = {
    ...(fixedHeight > 0 ? { ['--kk-qv-fixed' as string]: `${fixedHeight}px` } : {}),
    ['--kk-quiz-text-max' as string]: `${maxFontSizeQuizText(prefs)}px`,
    ['--kk-answer-size' as string]: `${fontSizeQuestionEdit(prefs)}px`,
    ['--kk-anki-answer-size' as string]: `${fontSizeAnkiAnswer(prefs)}px`,
  } as CSSProperties;
  const nextRef = useRef<HTMLButtonElement>(null);
  const goNext = () => {
    holdKeyboard();
    void run(() => rt.next());
  };
  // The answered screen focuses its Next button (the focus highlight) and hides the keyboard.
  useEffect(() => {
    if (answered && !anki && !busy && !frozen) nextRef.current?.focus({ preventScroll: true });
  }, [answered, anki, busy, frozen]);

  const header = (
    <QuestionView
      session={session}
      subject={subject}
      characters={session.questionCharacters(question)}
      questionType={question.type}
      prefs={prefs}
      srsStageName={srsName}
      toasts={floating.toasts}
      onToastDone={(id) => rt.dismissToast(id)}
      onSpecial={(n) => { holdKeyboard(); void run(() => rt.special(n)); }}
      answerMark={answered && !anki && showAnswerToast(prefs) ? (session.correct ? 'ok' : 'bad') : null}
      anki={anki}
      fixedHeight={fixedHeight > 0}
      next={answered && !anki ? (
        <button ref={nextRef} type="button" className="kk-btn kk-quiz-next kk-btn-focus" disabled={frozen} data-testid="next"
          onClick={goNext}>Next</button>
      ) : undefined}
    />
  );

  if (anki) {
    return (
      <>
        <AnkiQuiz rt={rt} snap={snap} session={session} question={question} header={header} busy={busy} run={run} style={quizStyle} />
        {menu.dialogs}
      </>
    );
  }

  const state2 = buttonState(session);
  const showDontKnow = dontKnowCanShow(prefs, state2);
  const dump = floating.dumpStage ?? infoDump(prefs, question.type, session.correct);
  const verdict = floating.lastVerdict;

  const input = answerInputAttributes(prefs, question.type, platform.capabilities.imeFlags === true);
  // Taps on the quiz buttons leave the focus (and the keyboard) in the answer field.
  // Only the mousedown: cancelling a touch's pointerdown also drops its click in WebKit (iOS).
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();
  const stretch = !answered && stretchQuestionView(prefs);

  return (
    <section className={`kk-quiz ${answered ? 'answered' : 'unanswered'}${stretch ? ' stretch' : ''}`} style={quizStyle}
      aria-label="Quiz" data-answered={answered ? 'true' : 'false'}>
      {header}
      <div className={`kk-quiz-answer${answered ? (session.correct ? ' correct' : ' incorrect') : ''}${shake > 0 ? ` shake-${shake % 2}` : ''}`}
        data-testid="answer-frame">
        <AnswerField
          ref={field}
          kana={kana}
          placeholder={answered ? '' : questionHint(question.type)}
          label={title}
          questionKey={answered ? `${questionKey}:a:${floating.shownAnswer}` : `${questionKey}:u`}
          initial={answered ? floating.shownAnswer : session.currentAnswer}
          readOnly={answered || busy}
          centered={centerCaret(prefs)}
          input={input}
          onChange={(t) => rt.setAnswer(t)}
          onSubmit={() => void (answered ? (!frozen && goNext()) : submit())}
        />
      </div>
      {answered && floating.closeMessage !== null && <p className="kk-quiz-message" data-testid="close-message">{floating.closeMessage}</p>}
      {answered && verdict !== null && !verdict.ok && verdict.digraph !== null && (
        <p className="kk-quiz-message" data-testid="digraph-message">{digraphMessage(verdict.digraph)}</p>
      )}
      {snap.error !== null && <p className="kk-banner error" role="alert">{snap.error}</p>}
      {answered && (
        <SessionItemInfo
          subjectId={subject.id}
          visibility={infoDumpFlags(dump, { type: question.type, done: question.item.done })}
          revealLabel={infoDumpShowReveal(dump) ? infoDumpRevealLabel(dump) : null}
          onReveal={() => rt.revealMore()}
        />
      )}
      {/* quickActionSpacer: pushes the row down onto the keyboard (gone when the question view stretches). */}
      <div className="kk-quiz-spacer" aria-hidden="true" />
      <div className="kk-quiz-actions" data-testid="quick-actions">
        {!answered ? (
          <>
            {showDontKnow
              ? (
                <button type="button" className="kk-btn" data-testid="dont-know" onMouseDown={keepFocus}
                  onClick={() => { holdKeyboard(); void run(() => rt.dontKnow()); }}>Don&apos;t know</button>
              )
              : <span className="kk-quiz-actions-space" aria-hidden="true" />}
            <button type="button" className="kk-btn" data-testid="submit" onMouseDown={keepFocus}
              onClick={() => void submit()}>Submit</button>
          </>
        ) : (
          <>
            {/* The second Next takes Submit's place (spacer | Next). */}
            <span className="kk-quiz-actions-space" aria-hidden="true" />
            <button type="button" className="kk-btn" disabled={frozen} data-testid="next-bottom" onClick={goNext}>Next</button>
          </>
        )}
      </div>
      {menu.dialogs}
    </section>
  );
}

function AnkiQuiz({ rt, snap, session, question, header, busy, run, style }: QuizProps & {
  header: React.ReactNode; busy: boolean; run(f: () => Promise<unknown>): Promise<void>; style?: CSSProperties;
}) {
  const { learner, state } = useReady();
  const prefs = state.prefs;
  const showing = snap.floating.ankiShowingAnswer;
  const answered = session.answered;
  const subject = contentSubject(learner, question.item.id);
  const meaning = QUESTION_TYPE_INFO[question.type].meaning;
  const synonyms = parseSynonymsSafe(progressRow(learner, subject.id).meaningSynonyms);
  const dump = snap.floating.dumpStage ?? infoDump(prefs, question.type, session.correct);
  const grade = (correct: boolean) => (
    <button type="button" key={correct ? 'c' : 'i'} className={`kk-anki ${correct ? 'correct' : 'incorrect'}`} disabled={busy}
      data-testid={correct ? 'anki-correct' : 'anki-incorrect'} onClick={() => void run(() => rt.ankiGrade(correct))}>
      {correct ? 'Correct' : 'Incorrect'}
    </button>
  );
  const grades = swapAnkiButtons(prefs) ? [grade(true), grade(false)] : [grade(false), grade(true)];
  const barStyle = { ...style, ['--kk-anki-height' as string]: `${ankiButtonsHeight(prefs)}px` } as CSSProperties;
  return (
    <section className="kk-quiz anki" style={barStyle} aria-label="Quiz" data-answered={answered ? 'true' : 'false'}>
      {header}
      {showing && (
        <RichTextView className="kk-anki-answer" value={session.questionAnkiAnswer(question, showOnInKatakanaSetting(prefs))}
          lang={QUESTION_TYPE_INFO[question.type].kana ? 'ja' : undefined} />
      )}
      {showing && !answered && meaning && synonyms.length > 0 && (
        <RichTextView className="kk-anki-answer" value={meaningSynonymsRichText(synonyms)} />
      )}
      {answered && (
        <SessionItemInfo
          subjectId={subject.id}
          visibility={infoDumpFlags(dump, { type: question.type, done: question.item.done })}
          revealLabel={infoDumpShowReveal(dump) ? infoDumpRevealLabel(dump) : null}
          onReveal={() => rt.revealMore()}
        />
      )}
      <div className="kk-quiz-spacer" aria-hidden="true" />
      {/* buttonsView: full-width flat TextViews in the Anki colours. */}
      <div className="kk-anki-bar" data-testid="quick-actions">
        {!answered && !showing && (
          <button type="button" className="kk-anki show" disabled={busy} data-testid="anki-show"
            onClick={() => {
              rt.ankiReveal();
              if (autoplayAnkiReveal(prefs) && QUESTION_TYPE_INFO[question.type].reading) rt.playOnce(subject.id);
            }}>Show answer</button>
        )}
        {!answered && showing && grades}
        {answered && (
          <button type="button" className="kk-anki next" disabled={busy} data-testid="next"
            onClick={() => void run(() => rt.next())}>Next</button>
        )}
      </div>
    </section>
  );
}

function parseSynonymsSafe(v: unknown): string[] {
  try {
    return parseMeaningSynonyms(typeof v === 'string' ? v : null);
  } catch {
    return [];
  }
}
