import { describe, expect, it } from 'vitest';
import { checkAnswer, primaryAnswer } from './answer';
import { subjectFromRow } from './subject';

// Row shaped like wk-content.db's subject table (JSON columns as strings); values are synthetic.
const subject = subjectFromRow({
  id: 1, level: 1, characters: '一',
  meanings: JSON.stringify([{ meaning: 'One', primary: true, accepted_answer: true }]),
  auxiliaryMeanings: JSON.stringify([{ meaning: '1', type: 'whitelist' }, { meaning: 'Uno', type: 'blacklist' }]),
  readings: JSON.stringify([
    { reading: 'いち', primary: true, accepted_answer: true, type: 'onyomi' },
    { reading: 'ひと', primary: false, accepted_answer: false, type: 'kunyomi' },
  ]),
});

describe('checkAnswer', () => {
  it('meanings: case and spacing insensitive, whitelist accepted, blacklist not', () => {
    expect(checkAnswer(subject, 'meaning', '  one ')).toBe(true);
    expect(checkAnswer(subject, 'meaning', '1')).toBe(true);
    expect(checkAnswer(subject, 'meaning', 'uno')).toBe(false);
    expect(checkAnswer(subject, 'meaning', '')).toBe(false);
  });
  it('readings: kana, katakana and unconverted romaji', () => {
    expect(checkAnswer(subject, 'reading', 'いち')).toBe(true);
    expect(checkAnswer(subject, 'reading', 'イチ')).toBe(true);
    expect(checkAnswer(subject, 'reading', 'ichi')).toBe(true);
    expect(checkAnswer(subject, 'reading', 'ひと')).toBe(false);
  });
  it('primary answers', () => {
    expect(primaryAnswer(subject, 'meaning')).toBe('One');
    expect(primaryAnswer(subject, 'reading')).toBe('いち');
  });
});
