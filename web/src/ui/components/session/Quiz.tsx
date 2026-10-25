/**
 * The quiz (`UnansweredSessionFragment`, `AnsweredSessionFragment`, `AnkiSessionFragment`) for the current
 * question of an active session.
 *
 * As the Java layouts: the toolbar in the subject's colour titled with the question type and the session
 * menu (`useSessionMenu`), the question view, the question type banner, the centred underlined answer field
 * (after answering: the full-width band in the answer colour) and the quick-action row. Owner decision
 * (2026-10-25): **Don't know | Submit directly under the field; Next takes Submit's place after
 * answering**. The question view's height follows the small viewport height so the row stays above the
 * keyboard on the smallest supported screens (iPhone SE, 320×568 Android); the item info comes after the
 * row and scrolls. No `visualViewport` code.
 */
import { useEffect, useRef, useState } from 'react';
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
import { QuestionView, buttonState, questionHint, titleFor } from './QuestionView';
import { SessionItemInfo } from './SessionItemInfo';
import { useSessionMenu } from './SessionMenu';
import { useToolbar } from '../../shell/toolbar';
import type { SessionRuntime, SessionSnapshot } from './runtime';

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
  const { learner, state } = useReady();
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

  // An incorrect answer vibrates when the answered screen appears (`AnsweredSessionFragment.onViewCreated`).
  const wrongBuzzed = useRef<string | null>(null);
  useEffect(() => {
    if (answered && !session.correct && !anki && wrongBuzzed.current !== questionKey && hapticFeedbackOnWrong(prefs)) {
      wrongBuzzed.current = questionKey;
      haptic('wrong');
    }
  });

  const run = async (f: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await f();
    } catch {
      // shown through snap.error
    } finally {
      setBusy(false);
    }
  };

  const submit = () => run(async () => {
    const text = field.current?.commit() ?? session.currentAnswer;
    const verdict = await rt.submit(text);
    if (verdict === null) return;
    if (verdict.ok && hapticFeedbackOnCorrect(prefs)) haptic('correct');
    if (verdict.retry) {
      if (hapticFeedbackOnWrong(prefs)) haptic('retry');
      field.current?.focus();
    }
  });

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
      onSpecial={(n) => void run(() => rt.special(n))}
      answerMark={answered && !anki && showAnswerToast(prefs) ? (session.correct ? 'ok' : 'bad') : null}
      anki={anki}
    />
  );

  if (anki) {
    return (
      <>
        <AnkiQuiz rt={rt} snap={snap} session={session} question={question} header={header} busy={busy} run={run} />
        {menu.dialogs}
      </>
    );
  }

  const state2 = buttonState(session);
  const showDontKnow = dontKnowCanShow(prefs, state2);
  const dump = floating.dumpStage ?? infoDump(prefs, question.type, session.correct);
  const verdict = floating.lastVerdict;

  return (
    <section className="kk-quiz" aria-label="Quiz" data-answered={answered ? 'true' : 'false'}>
      {header}
      <div className={`kk-quiz-answer${answered ? (session.correct ? ' correct' : ' incorrect') : ''}${shake > 0 ? ` shake-${shake % 2}` : ''}`}
        data-testid="answer-frame">
        <AnswerField
          ref={field}
          kana={kana}
          placeholder={questionHint(question.type)}
          label={title}
          questionKey={answered ? `${questionKey}:a:${floating.shownAnswer}` : `${questionKey}:u`}
          initial={answered ? floating.shownAnswer : session.currentAnswer}
          readOnly={answered || busy}
          centered={prefs.center_caret === true}
          onChange={(t) => rt.setAnswer(t)}
          onSubmit={() => void (answered ? (!frozen && run(() => rt.next())) : submit())}
        />
      </div>
      <div className="kk-quiz-actions" data-testid="quick-actions">
        {!answered ? (
          <>
            {showDontKnow
              ? (
                <button type="button" className="kk-btn" disabled={busy} data-testid="dont-know"
                  onClick={() => void run(() => rt.dontKnow())}>Don&apos;t know</button>
              )
              : <span className="kk-quiz-actions-space" aria-hidden="true" />}
            <button type="button" className="kk-btn" disabled={busy} data-testid="submit" onClick={() => void submit()}>Submit</button>
          </>
        ) : (
          <>
            {/* Next takes Submit's place (fragment_answered_question.xml: Space | nextButton2). */}
            <span className="kk-quiz-actions-space" aria-hidden="true" />
            <button type="button" className="kk-btn" disabled={busy || frozen} data-testid="next"
              onClick={() => void run(() => rt.next())}>Next</button>
          </>
        )}
      </div>
      {answered && floating.closeMessage !== null && <p className="kk-quiz-message" data-testid="close-message">{floating.closeMessage}</p>}
      {answered && verdict !== null && !verdict.ok && verdict.digraph !== null && (
        <p className="kk-quiz-message" data-testid="digraph-message">{digraphMessage(verdict.digraph)}</p>
      )}
      {snap.error !== null && <p className="kk-banner error" role="alert">{snap.error}</p>}
      {answered && (
        <>
          <SessionItemInfo
            subjectId={subject.id}
            visibility={infoDumpFlags(dump, { type: question.type, done: question.item.done })}
            revealLabel={infoDumpShowReveal(dump) ? infoDumpRevealLabel(dump) : null}
            onReveal={() => rt.revealMore()}
          />
          <div className="kk-quiz-actions bottom">
            <span className="kk-quiz-actions-space" aria-hidden="true" />
            <button type="button" className="kk-btn" disabled={busy || frozen} onClick={() => void run(() => rt.next())}>Next</button>
          </div>
        </>
      )}
      {menu.dialogs}
    </section>
  );
}

function AnkiQuiz({ rt, snap, session, question, header, busy, run }: QuizProps & {
  header: React.ReactNode; busy: boolean; run(f: () => Promise<unknown>): Promise<void>;
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
    <button type="button" className={`kk-btn kk-anki ${correct ? 'correct' : 'incorrect'}`} disabled={busy}
      data-testid={correct ? 'anki-correct' : 'anki-incorrect'} onClick={() => void run(() => rt.ankiGrade(correct))}>
      {correct ? 'Correct' : 'Incorrect'}
    </button>
  );
  const grades = swapAnkiButtons(prefs) ? [grade(true), grade(false)] : [grade(false), grade(true)];
  return (
    <section className="kk-quiz anki" aria-label="Quiz" data-answered={answered ? 'true' : 'false'}>
      {header}
      <div className="kk-quiz-actions anki" data-testid="quick-actions">
        {!answered && !showing && (
          <button type="button" className="kk-btn kk-anki show" disabled={busy} data-testid="anki-show"
            onClick={() => {
              rt.ankiReveal();
              if (autoplayAnkiReveal(prefs) && QUESTION_TYPE_INFO[question.type].reading) rt.playOnce(subject.id);
            }}>Show answer</button>
        )}
        {!answered && showing && grades}
        {answered && (
          <button type="button" className="kk-btn kk-anki next" disabled={busy} data-testid="next"
            onClick={() => void run(() => rt.next())}>Next</button>
        )}
      </div>
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
