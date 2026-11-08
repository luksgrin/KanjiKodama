import type { AuxiliaryMeaning, Content, Meaning, Reading, SubjectObject } from '../../src/core/content';
import {
  alternativeCandidates,
  alternativesToastMessage,
  closeEnoughMessage,
  digraphMessage,
  filterAlternatives,
  trimControlChars,
  submitPrecheck,
} from '../../src/core/answer/submit';
import {
  CLOSE_ENOUGH_ACTIONS,
  NOK_WITH_RETRY,
  QUESTION_TYPE_INFO,
  checkAnswer,
  type AnswerVerdict,
  type CheckSubject,
  type CloseEnoughAction,
  type QuestionType,
} from '../../src/core/answer';
import { cleanString, getMatchScore } from '../../src/core/answer/fuzzy';
import { TypedError } from '../../src/core/kana';
import { goldenSuite } from './harness';

/** A subject as the submit fixtures give it inline (synthetic), or a content id. */
interface FixtureSubject {
  id: number;
  object: SubjectObject;
  characters: string | null;
  meanings: Meaning[] | null;
  auxiliaryMeanings: AuxiliaryMeaning[] | null;
  readings: Reading[] | null;
}
type SubjectRef = number | FixtureSubject;

function resolve(ref: SubjectRef, content: Content | undefined): CheckSubject & { characters: string | null } {
  if (typeof ref !== 'number') {
    return {
      characters: ref.characters,
      meanings: ref.meanings ?? [],
      auxiliaryMeanings: ref.auxiliaryMeanings ?? [],
      readings: ref.readings ?? [],
    };
  }
  const s = content?.byId.get(ref);
  if (!s) throw new Error(`subject ${ref} not in the content DB`);
  return s;
}

const verdictOut = (v: AnswerVerdict) => ({ ...v, digraph: v.digraph === null ? null : [...v.digraph] });

function errorResult(e: unknown): { error: string } {
  if (e instanceof TypedError) return { error: e.errorType };
  throw e;
}

interface PrecheckInput {
  subject: SubjectRef;
  questionType: QuestionType;
  answer: string;
  matchingKanji: SubjectRef | null;
}

/** The precheck, then every variant's verdict (all of them for synthetic subjects). */
function precheckOutput(input: PrecheckInput, content: Content | undefined, allVariants: boolean): unknown {
  const subject = resolve(input.subject, content);
  const matchingKanji = input.matchingKanji === null ? null : resolve(input.matchingKanji, content);
  const meaning = QUESTION_TYPE_INFO[input.questionType].meaning;
  const variants: [string, CloseEnoughAction, boolean][] = meaning
    ? (allVariants ? CLOSE_ENOUGH_ACTIONS : (['SILENTLY_ACCEPT'] as CloseEnoughAction[])).map((a) => [a, a, false])
    : (allVariants ? [false, true] : [false]).map((k) => [`requireOnInKatakana=${k}`, 'SILENTLY_ACCEPT', k]);
  let precheck;
  try {
    precheck = submitPrecheck(input.questionType, subject.characters, input.answer);
  } catch (e) {
    return errorResult(e);
  }
  const trimmed = trimControlChars(precheck.answer);
  const rejection = precheck.rejection ?? (trimmed === '' ? NOK_WITH_RETRY : null);
  const verdicts: Record<string, unknown> = {};
  for (const [key, closeEnoughAction, requireOnInKatakana] of variants) {
    try {
      verdicts[key] = verdictOut(
        rejection ??
          checkAnswer(input.questionType, subject, trimmed, { matchingKanji, closeEnoughAction, requireOnInKatakana }),
      );
    } catch (e) {
      verdicts[key] = errorResult(e);
    }
  }
  return {
    answer: precheck.answer,
    trailingNFixed: precheck.trailingNFixed,
    rejectedBy: precheck.reason ?? (rejection !== null ? 'blank' : null),
    checkedAnswer: rejection === null ? trimmed : null,
    verdicts,
  };
}

goldenSuite<PrecheckInput, unknown>('answers/submit-precheck.json', (input) => precheckOutput(input, undefined, true));
goldenSuite<PrecheckInput, unknown>(
  'answers/submit-precheck-content-*.jsonl',
  (input, _c, ctx) => precheckOutput(input, ctx.content, false),
  { needsContent: true },
);

interface AlternativesInput extends PrecheckInput {
  meaningSynonyms: string[];
  closeEnoughAction: CloseEnoughAction;
  requireOnInKatakana: boolean;
}

const SHOWS_TOAST: Record<CloseEnoughAction, boolean> = {
  SILENTLY_ACCEPT: false,
  ACCEPT_WITH_TOAST: true,
  ACCEPT_WITH_TOAST_NO_LM: true,
  SHAKE_AND_RETRY: false,
  REJECT: false,
};

const toastText = (filtered: unknown): string | null =>
  Array.isArray(filtered) && filtered.length > 0 ? alternativesToastMessage(filtered.join(', ')) : null;

function filtered(candidates: (string | null)[], sessionAnswer: string, v: AnswerVerdict): string[] | { error: string } {
  try {
    return filterAlternatives(candidates, sessionAnswer, v);
  } catch (e) {
    return errorResult(e);
  }
}

/** The tied accepted meanings in subject order, or null. */
function ties(input: AlternativesInput, subject: CheckSubject, answer: string, referencePick: string | null): Record<string, unknown> | null {
  const accepted: string[] = [];
  const rejected: string[] = [];
  const add = (m: string | null): void => {
    if (m !== null && !accepted.includes(m)) accepted.push(m);
  };
  for (const m of subject.meanings) {
    if (m.accepted_answer) add(m.meaning);
    else if (m.meaning !== null) rejected.push(m.meaning);
  }
  for (const m of subject.auxiliaryMeanings) {
    if (m.type === 'whitelist') add(m.meaning);
    else if (m.type === 'blacklist' && m.meaning !== null) rejected.push(m.meaning);
  }
  for (const m of input.meaningSynonyms) add(m);
  const clean = cleanString(answer);
  const NONE = Number.MAX_SAFE_INTEGER;
  let bestRejected = NONE;
  for (const r of rejected) bestRejected = Math.min(bestRejected, getMatchScore(clean, cleanString(r)));
  let best = NONE;
  let tied: string[] = [];
  for (const a of accepted) {
    const sc = getMatchScore(clean, cleanString(a));
    if (sc < best) {
      best = sc;
      tied = [];
    }
    if (sc === best && sc < NONE) tied.push(a);
  }
  if (best === NONE || best > bestRejected || tied.length < 2) return null;
  return { score: best, ties: tied, subjectOrderFirst: tied[0], referencePick };
}

/** What submitting records: the alternatives and the toasts. */
function alternativesOutput(input: AlternativesInput, content: Content | undefined): unknown {
  const subject = resolve(input.subject, content);
  const matchingKanji = input.matchingKanji === null ? null : resolve(input.matchingKanji, content);
  const precheck = submitPrecheck(input.questionType, subject.characters, input.answer);
  const sessionAnswer = precheck.answer;
  const trimmed = trimControlChars(sessionAnswer);
  let v: AnswerVerdict;
  if (precheck.rejection !== null) v = precheck.rejection;
  else if (trimmed === '') v = NOK_WITH_RETRY;
  else {
    try {
      v = checkAnswer(input.questionType, subject, trimmed, {
        meaningSynonyms: input.meaningSynonyms,
        matchingKanji,
        closeEnoughAction: input.closeEnoughAction,
        requireOnInKatakana: input.requireOnInKatakana,
      });
    } catch (e) {
      return { verdict: errorResult(e) };
    }
  }
  const sets: Record<string, unknown> = {};
  const ui: Record<string, unknown> = {};
  let candidates: (string | null)[] | null = null;
  let alternatives: string[] | { error: string } | null = null;
  let tieRecord: Record<string, unknown> | null = null;
  const showToast = SHOWS_TOAST[input.closeEnoughAction];
  if (v.ok) {
    sets.lastVerdict = true;
    candidates = alternativeCandidates(input.questionType, subject);
    if (candidates !== null) {
      alternatives = filtered(candidates, sessionAnswer, v);
      if (Array.isArray(alternatives)) {
        sets.alternativesForLastCorrectAnswer = alternatives.join(', ');
        sets.showAlternativesToast = alternatives.length > 0;
      }
    } else {
      sets.alternativesForLastCorrectAnswer = null;
    }
    if (Array.isArray(alternatives) || alternatives === null) sets.showCloseToast = v.nearMatch;
    ui.alternativesToast = toastText(alternatives);
    ui.closeEnough = v.nearMatch && showToast ? closeEnoughMessage(v) : null;
    ui.digraph = null;
    const t = QUESTION_TYPE_INFO[input.questionType].meaning ? ties(input, subject, trimmed, v.matchedAnswer) : null;
    if (t !== null && candidates !== null) {
      const byPick: Record<string, unknown> = {};
      for (const pick of t.ties as string[]) {
        const pv = { ...v, matchedAnswer: pick };
        const f = filtered(candidates, sessionAnswer, pv);
        byPick[pick] = {
          alternatives: f,
          alternativesToast: toastText(f),
          closeEnough: pv.nearMatch && showToast ? closeEnoughMessage(pv) : null,
        };
      }
      tieRecord = { ...t, byPick };
    }
  } else if (!v.retry) {
    sets.lastVerdict = true;
    sets.showCloseToast = false;
    ui.alternativesToast = null;
    ui.closeEnough = null;
    ui.digraph = v.digraph === null ? null : digraphMessage(v.digraph);
  } else {
    ui.alternativesToast = null;
    ui.closeEnough = null;
    ui.digraph = null;
  }
  return { verdict: verdictOut(v), sessionAnswer, candidates, alternatives, sets, ui, ties: tieRecord };
}

goldenSuite<AlternativesInput, unknown>('answers/submit-alternatives.json', (input) => alternativesOutput(input, undefined));
goldenSuite<AlternativesInput, unknown>(
  'answers/submit-alternatives-content-*.jsonl',
  (input, _c, ctx) => alternativesOutput(input, ctx.content),
  { needsContent: true },
);
