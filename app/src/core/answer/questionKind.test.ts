import { describe, expect, it } from 'vitest';
import type { Reading } from '../content';
import { checkAnswer } from './questionType';
import { acceptedKanjiReadingKind, questionKind, retryHint, retryHintText, type KindSubject } from './questionKind';

const r = (reading: string, type: string | null, accepted: boolean): Reading => ({ reading, primary: accepted, accepted_answer: accepted, type });
const kanji = (readings: Reading[]): KindSubject & { meanings: []; auxiliaryMeanings: [] } => ({ object: 'kanji', readings, meanings: [], auxiliaryMeanings: [] });
const vocab = (readings: Reading[]): KindSubject & { meanings: []; auxiliaryMeanings: [] } => ({ object: 'vocabulary', readings, meanings: [], auxiliaryMeanings: [] });

// 人: on'yomi じん / にん taught, kun'yomi ひと not accepted. 下: kun'yomi した taught, on'yomi か not.
const HITO = kanji([r('じん', 'onyomi', true), r('にん', 'onyomi', true), r('ひと', 'kunyomi', false)]);
const SHITA = kanji([r('か', 'onyomi', false), r('した', 'kunyomi', true)]);
const BOTH = kanji([r('いち', 'onyomi', true), r('ひと', 'kunyomi', true), r('かず', 'nanori', false)]);
const NONE = kanji([r('いち', 'onyomi', false)]);
const OPTS = { closeEnoughAction: 'SILENTLY_ACCEPT', requireOnInKatakana: false } as const;

describe('questionKind', () => {
  it('names the kind a kanji reading question takes, from its accepted readings', () => {
    expect(acceptedKanjiReadingKind(HITO)).toBe('onyomi');
    expect(acceptedKanjiReadingKind(SHITA)).toBe('kunyomi');
    expect(acceptedKanjiReadingKind(BOTH)).toBe('both');
    expect(acceptedKanjiReadingKind(NONE)).toBe('reading');
    expect(acceptedKanjiReadingKind(vocab([r('ひと', null, true)]))).toBe('reading');
    expect(questionKind('WANIKANI_KANJI_READING', HITO, true)).toBe('onyomi');
    expect(questionKind('WANIKANI_KANJI_READING', SHITA, true)).toBe('kunyomi');
    expect(questionKind('WANIKANI_KANJI_READING', BOTH, true)).toBe('both');
  });

  it("is a plain reading with the setting off, except for the on/kun'yomi questions", () => {
    expect(questionKind('WANIKANI_KANJI_READING', HITO, false)).toBe('reading');
    expect(questionKind('WANIKANI_KANJI_ONYOMI', SHITA, false)).toBe('onyomi');
    expect(questionKind('WANIKANI_KANJI_KUNYOMI', HITO, false)).toBe('kunyomi');
    expect(questionKind('WANIKANI_VOCAB_READING', vocab([]), true)).toBe('reading');
  });

  it('is the meaning for every meaning question', () => {
    for (const t of ['WANIKANI_RADICAL_NAME', 'WANIKANI_KANJI_MEANING', 'WANIKANI_VOCAB_MEANING', 'WANIKANI_KANA_VOCAB_MEANING'] as const) {
      expect(questionKind(t, HITO, true)).toBe('meaning');
    }
  });
});

describe('retryHint', () => {
  it("says a kun'yomi was typed where the on'yomi is wanted, and the other way round", () => {
    // The verdict itself is the unchanged shake.
    expect(checkAnswer('WANIKANI_KANJI_READING', HITO, 'ひと', OPTS).retry).toBe(true);
    const hint = retryHint('WANIKANI_KANJI_READING', HITO, 'ひと', null, false);
    expect(hint).toEqual({ given: 'kunyomi', wanted: 'onyomi' });
    expect(retryHintText(hint!)).toBe("That's a kun'yomi (訓). We're looking for the on'yomi (音).");
    const back = retryHint('WANIKANI_KANJI_READING', SHITA, 'か', null, false)!;
    expect(retryHintText(back)).toBe("That's an on'yomi (音). We're looking for the kun'yomi (訓).");
  });

  it('names the kind even with the setting off (the shake already gives it away)', () => {
    expect(retryHint('WANIKANI_KANJI_READING', HITO, 'ひと', null, false)?.wanted).toBe('onyomi');
  });

  it("asks for the lesson's reading when the kanji takes both kinds, or none is marked", () => {
    expect(retryHintText(retryHint('WANIKANI_KANJI_READING', BOTH, 'かず', null, false)!))
      .toBe("That's a name reading (nanori). We're looking for the reading taught in the lesson.");
    expect(retryHintText({ given: 'onyomi', wanted: 'reading' })).toBe("That's an on'yomi (音). We're looking for the reading taught in the lesson.");
  });

  it("covers the separate on'yomi / kun'yomi questions", () => {
    expect(retryHint('WANIKANI_KANJI_ONYOMI', SHITA, 'した', null, false)).toEqual({ given: 'kunyomi', wanted: 'onyomi' });
    expect(retryHint('WANIKANI_KANJI_KUNYOMI', HITO, 'じん', null, false)).toEqual({ given: 'onyomi', wanted: 'kunyomi' });
  });

  it('says a reading was typed for a meaning question (romaji or kana)', () => {
    expect(retryHint('WANIKANI_KANJI_MEANING', HITO, 'hito', null, false)).toEqual({ given: 'reading-for-meaning', wanted: 'meaning' });
    expect(retryHintText({ given: 'reading-for-meaning', wanted: 'meaning' })).toBe("That's a reading. We're looking for the meaning (意).");
    expect(retryHint('WANIKANI_KANJI_MEANING', HITO, 'person', null, false)).toBeNull();
  });

  it("covers vocabulary: an unaccepted reading of the word, or the kanji's reading", () => {
    const word = vocab([r('ひとり', null, true), r('いちにん', null, false)]);
    expect(retryHint('WANIKANI_VOCAB_READING', word, 'いちにん', null, false)).toEqual({ given: 'other-reading', wanted: 'reading' });
    expect(retryHint('WANIKANI_VOCAB_READING', word, 'じん', HITO, false)).toEqual({ given: 'kanji-reading', wanted: 'reading' });
    expect(retryHintText({ given: 'kanji-reading', wanted: 'reading' })).toBe("That's the kanji's reading. We're looking for this word's reading.");
    expect(retryHint('WANIKANI_VOCAB_READING', word, 'ふたり', HITO, false)).toBeNull();
  });

  it('is null when the answer is no reading of the subject', () => {
    expect(retryHint('WANIKANI_KANJI_READING', HITO, 'ふた', null, false)).toBeNull();
    expect(retryHint('WANIKANI_KANJI_READING', HITO, '', null, false)).toBeNull();
  });
});
