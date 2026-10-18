/**
 * The answer Anki mode reveals for a question, and the subject texts it is built from.
 *
 * Java: `model/Question.getAnkiAnswerRichText`, `enums/QuestionType.getAnkiAnswerRichText`,
 * `db/model/Subject.getMeaningRichText` / `getRegularReadingRichText` / `getAcceptedOnYomiRichText` /
 * `getAcceptedKunYomiRichText`. Fixtures: `anki/answer-text.jsonl`, `anki/answer-inflection.json`.
 */
import type { QuestionType } from '../answer/questionType';
import type { ContentSubject, Meaning, Reading } from '../content';
import { toKatakana } from '../kana';
import { concatRich, escapeHtml, renderHtml, type RichText } from '../text/richText';

/** `Reading.getValue(showOnInKatakana)`: on'yomi in katakana when asked. */
function readingValue(r: Reading, showOnInKatakana: boolean): string {
  const v = r.reading ?? '';
  return showOnInKatakana && r.type === 'onyomi' ? toKatakana(v) : v;
}

/** One value, bold when it is primary among several accepted ones (the Java `<b>%s</b>` format). */
function item(value: string | null, primary: boolean, several: boolean): string {
  const escaped = escapeHtml(value ?? 'null');
  return primary && several ? `<b>${escaped}</b>` : escaped;
}

/** `Subject.getMeaningRichText(prefix)`: accepted meanings, the primary one bold when there are several. */
export function meaningRichText(subject: Pick<ContentSubject, 'meanings'>, prefix: string): RichText {
  const accepted = subject.meanings.filter((m: Meaning) => m.accepted_answer);
  return renderHtml(prefix + accepted.map((m) => item(m.meaning, m.primary, accepted.length > 1)).join(', '));
}

/** `Subject.getRegularReadingRichText(prefix)`: accepted readings, the primary one bold when there are several. */
export function regularReadingRichText(
  subject: Pick<ContentSubject, 'readings'>,
  prefix: string,
  showOnInKatakana: boolean,
): RichText {
  const accepted = subject.readings.filter((r) => r.accepted_answer);
  return renderHtml(
    prefix + accepted.map((r) => item(readingValue(r, showOnInKatakana), r.primary, accepted.length > 1)).join(', '),
  );
}

/** `Subject.getAcceptedOnYomiRichText(prefix)`: the accepted on'yomi, or all of them when none is accepted. */
export function acceptedOnYomiRichText(
  subject: Pick<ContentSubject, 'readings'>,
  prefix: string,
  showOnInKatakana: boolean,
): RichText {
  const on = subject.readings.filter((r) => r.type === 'onyomi');
  const anyAccepted = on.some((r) => r.accepted_answer);
  const shown = on.filter((r) => !anyAccepted || r.accepted_answer);
  return renderHtml(prefix + shown.map((r) => escapeHtml(readingValue(r, showOnInKatakana))).join(', '));
}

/** `Subject.getAcceptedKunYomiRichText(prefix)`: the accepted kun'yomi, or all of them when none is accepted. */
export function acceptedKunYomiRichText(subject: Pick<ContentSubject, 'readings'>, prefix: string): RichText {
  const kun = subject.readings.filter((r) => r.type === 'kunyomi');
  const anyAccepted = kun.some((r) => r.accepted_answer);
  const shown = kun.filter((r) => !anyAccepted || r.accepted_answer);
  return renderHtml(prefix + shown.map((r) => escapeHtml(readingValue(r, false))).join(', '));
}

/** `QuestionType.getAnkiAnswerRichText(subject)`. */
export function questionTypeAnkiAnswer(
  subject: Pick<ContentSubject, 'meanings' | 'readings'>,
  questionType: QuestionType,
  showOnInKatakana: boolean,
): RichText {
  switch (questionType) {
    case 'WANIKANI_KANJI_READING':
    case 'WANIKANI_VOCAB_READING':
      return regularReadingRichText(subject, 'Answer: ', showOnInKatakana);
    case 'WANIKANI_KANJI_ONYOMI':
      return acceptedOnYomiRichText(subject, 'Answer: ', showOnInKatakana);
    case 'WANIKANI_KANJI_KUNYOMI':
      return acceptedKunYomiRichText(subject, 'Answer: ');
    default:
      return meaningRichText(subject, 'Answer: ');
  }
}

/**
 * `Question.getAnkiAnswerRichText(subject, sessionType)`: the question type's answer, with
 * `" (<inflection>)"` appended when the question asks for an inflected form (see `inflection.ts`).
 */
export function ankiAnswerRichText(
  subject: Pick<ContentSubject, 'meanings' | 'readings'>,
  questionType: QuestionType,
  options: { showOnInKatakana: boolean; inflection?: string | null },
): RichText {
  const answer = questionTypeAnkiAnswer(subject, questionType, options.showOnInKatakana);
  return options.inflection ? concatRich(answer, ` (${options.inflection})`) : answer;
}
