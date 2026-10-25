// Spike answer checking: exact match after normalisation. The real AnswerChecker.kt is ported later.
import { convertKatakanaToHiragana, simulateInput } from '../core/kana';
import type { KanjiSubject } from './subject';

export type QuestionKind = 'meaning' | 'reading';

const normMeaning = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const normReading = (s: string) => convertKatakanaToHiragana(s.trim()).replace(/\s+/g, '');
/** Romaji to kana as on submit (`PseudoIme.simulateInput`; kana pass through); '' when nothing is left. */
const toKana = (s: string) => {
  const t = s.trim();
  if (t === '') return '';
  try {
    return simulateInput(t);
  } catch {
    return '';
  }
};

export function acceptedAnswers(subject: KanjiSubject, kind: QuestionKind): string[] {
  if (kind === 'meaning') {
    return [
      ...subject.meanings.filter((m) => m.accepted_answer).map((m) => m.meaning),
      ...subject.auxiliaryMeanings.filter((m) => m.type === 'whitelist').map((m) => m.meaning),
    ];
  }
  return subject.readings.filter((r) => r.accepted_answer).map((r) => r.reading);
}

export function primaryAnswer(subject: KanjiSubject, kind: QuestionKind): string {
  const list = kind === 'meaning' ? subject.meanings.map((m) => ({ v: m.meaning, p: m.primary })) : subject.readings.map((r) => ({ v: r.reading, p: r.primary }));
  return (list.find((x) => x.p) ?? list[0])?.v ?? '';
}

export function checkAnswer(subject: KanjiSubject, kind: QuestionKind, answer: string): boolean {
  if (kind === 'meaning') {
    const a = normMeaning(answer);
    return a !== '' && acceptedAnswers(subject, kind).some((m) => normMeaning(m) === a);
  }
  const a = normReading(toKana(answer));
  return a !== '' && acceptedAnswers(subject, kind).some((r) => normReading(r) === a);
}
