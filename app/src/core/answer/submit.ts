/**
 * What `Session.submit` does around the question type's answer check: the pre-checks on the typed
 * answer, and the feedback derived from the verdict (other accepted answers, close-enough and digraph
 * texts).
 *
 * Fixtures: `answers/submit-precheck*`, `answers/submit-alternatives*`.
 */
import { TypedError, convertKatakanaToHiragana } from '../kana';
import { androidToLowerCase } from './unicode';
import { checkAnswer, QUESTION_TYPE_INFO, type CheckOptions, type CheckSubject, type QuestionType } from './questionType';
import { NOK_WITH_RETRY, type AnswerVerdict, type DigraphMatch } from './verdict';

/** Why a pre-check rejected the answer (`SubmitPrecheck.EMPTY` etc.). */
export type PrecheckReason = 'empty' | 'non-kana' | 'missing-kana';

/** The answer pre-check's result. */
export interface SubmitPrecheck {
  /** The answer after the trailing `n` fix; Session stores it back as the current answer. */
  answer: string;
  trailingNFixed: boolean;
  /** The verdict submit returns when a pre-check rejects the answer (always NOK_WITH_RETRY), or null. */
  rejection: AnswerVerdict | null;
  reason: PrecheckReason | null;
}

/** Strips chars <= U+0020 at both ends (not NBSP or U+3000). */
export function trimControlChars(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.substring(start, end);
}

/**
 * `SubmitPrecheck.check`: empty answers get a retry; for kana question types a trailing lower-case `n`
 * becomes `ん`, then any char outside U+3040..U+30FF (whitespace included) or an answer that doesn't
 * contain the subject's own kana in order (kanji and full-width digits match one or more of anything;
 * the characters go into the regex unescaped, so `.` matches anything) gets a retry.
 */
export function submitPrecheck(
  questionType: QuestionType,
  subjectCharacters: string | null,
  currentAnswer: string,
): SubmitPrecheck {
  if (currentAnswer === '') return { answer: currentAnswer, trailingNFixed: false, rejection: NOK_WITH_RETRY, reason: 'empty' };
  let answer = currentAnswer;
  let fixed = false;
  if (QUESTION_TYPE_INFO[questionType].kana) {
    if (answer.endsWith('n')) {
      answer = `${answer.substring(0, answer.length - 1)}ん`;
      fixed = true;
    }
    for (let i = 0; i < answer.length; i++) {
      const c = answer.charCodeAt(i);
      if (c < 0x3040 || c > 0x30ff) return { answer, trailingNFixed: fixed, rejection: NOK_WITH_RETRY, reason: 'non-kana' };
    }
    if (subjectCharacters === null) throw new TypedError('NullPointerException', 'subject characters');
    // 〜 and the small katakana ヶ are dropped / read as か before comparing in hiragana.
    const characters = subjectCharacters.split('〜').join('').split('ヶ').join('か');
    const expectedKana = convertKatakanaToHiragana(characters).replace(/[\p{Script=Han}０-９]+/gu, '.+');
    let re: RegExp;
    try {
      re = new RegExp(`^(?:${expectedKana})$`);
    } catch (e) {
      throw new TypedError('PatternSyntaxException', String(e));
    }
    if (!re.test(convertKatakanaToHiragana(answer))) {
      return { answer, trailingNFixed: fixed, rejection: NOK_WITH_RETRY, reason: 'missing-kana' };
    }
  }
  return { answer, trailingNFixed: fixed, rejection: null, reason: null };
}

/** The pre-checks, then `checkAnswer` on the trimmed answer (an empty one gets a retry). */
export interface SubmitCheck {
  precheck: SubmitPrecheck;
  /** Rejected by `Question.checkAnswer` because the trimmed answer is empty. */
  blank: boolean;
  /** The trimmed answer `checkAnswer` got, or null when a check rejected it first. */
  checkedAnswer: string | null;
  verdict: AnswerVerdict;
}

/** `Session.submitHelper` up to the verdict (the state checks and bookkeeping aside). */
export function submitCheck(
  questionType: QuestionType,
  subject: CheckSubject & { characters: string | null },
  rawAnswer: string,
  options: CheckOptions,
): SubmitCheck {
  const precheck = submitPrecheck(questionType, subject.characters, rawAnswer);
  if (precheck.rejection !== null) return { precheck, blank: false, checkedAnswer: null, verdict: precheck.rejection };
  const trimmed = trimControlChars(precheck.answer);
  if (trimmed === '') return { precheck, blank: true, checkedAnswer: null, verdict: NOK_WITH_RETRY };
  return { precheck, blank: false, checkedAnswer: trimmed, verdict: checkAnswer(questionType, subject, trimmed, options) };
}

/**
 * The alternatives to show: for a meaning question all meanings (accepted or not) when
 * there are several; for a reading question all accepted readings when there are several; else null.
 */
export function alternativeCandidates(
  questionType: QuestionType,
  subject: CheckSubject,
): (string | null)[] | null {
  const info = QUESTION_TYPE_INFO[questionType];
  if (info.meaning && subject.meanings.length > 1) return subject.meanings.map((m) => m.meaning);
  const accepted = subject.readings.filter((r) => r.accepted_answer);
  if (info.reading && accepted.length > 1) return accepted.map((r) => r.reading);
  return null;
}

/** Lower-cased (non-Turkish locale), then one leading "the " removed. */
function withoutThe(s: string): string {
  return androidToLowerCase(s).replace(/^the /, '');
}

/**
 * Drops candidates equal (lower-cased, one leading "the " removed)
 * to the answer or the verdict's matched answer, and later duplicates; kept ones keep their case.
 * Throws a TypedError NullPointerException for a null candidate or matched answer.
 */
export function filterAlternatives(
  alternatives: readonly (string | null)[],
  currentAnswer: string,
  lastVerdict: AnswerVerdict | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const answer = withoutThe(currentAnswer);
  let closeEnough: string | null = null;
  if (lastVerdict !== null) {
    if (lastVerdict.matchedAnswer === null) throw new TypedError('NullPointerException', 'matchedAnswer');
    closeEnough = withoutThe(lastVerdict.matchedAnswer);
  }
  for (const alternative of alternatives) {
    if (alternative === null) throw new TypedError('NullPointerException', 'alternative');
    const key = withoutThe(alternative);
    if (key === answer || key === closeEnough || seen.has(key)) continue;
    seen.add(key);
    out.push(alternative);
  }
  return out;
}

/** The alternatives toast's text. */
export function alternativesToastMessage(alternativesForLastCorrectAnswer: string): string {
  return `Alt: ${alternativesForLastCorrectAnswer}`;
}

/** The close-enough toast's text (a null matched answer prints as "null"). */
export function closeEnoughMessage(verdict: AnswerVerdict): string {
  return (
    `Your answer ('${verdict.givenAnswer}') was a bit off, the closest correct answer was '${verdict.matchedAnswer}'. ` +
    'Check the meaning to make sure you are correct.'
  );
}

/** The digraph toast's text. */
export function digraphMessage(match: DigraphMatch): string {
  return (
    `Your answer was incorrect because you mixed up the regular kana ${match[0]} and the small kana ${match[1]}. ` +
    'Tap this message for more information about the difference between small and regular kana.'
  );
}
