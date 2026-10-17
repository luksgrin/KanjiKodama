// Port of core/srs/src/test/kotlin/app/kanjikodama/srs/KanaConverterTest.kt
import { describe, expect, it } from 'vitest';
import { isKana, katakanaToHiragana, toHiragana, toHiraganaLive } from './kanaConverter';

describe('toHiragana', () => {
  it.each([
    ['kou', 'こう'], ['shi', 'し'], ['si', 'し'], ['chi', 'ち'], ['tsu', 'つ'], ['fu', 'ふ'],
    ['ji', 'じ'], ['kyou', 'きょう'], ['sha', 'しゃ'], ['jyo', 'じょ'], ['gakkou', 'がっこう'],
    ['kitte', 'きって'], ['matcha', 'まっちゃ'], ['zasshi', 'ざっし'], ['kanji', 'かんじ'],
    ["kan'i", 'かんい'], ['kani', 'かに'], ['konnichiwa', 'こんにちわ'], ['konnnichiwa', 'こんにちわ'],
    ['shinnen', 'しんねん'], ['onna', 'おんな'], ['hon', 'ほん'], ['nn', 'ん'], ['ra-men', 'らーめん'],
    ['xtsu', 'っ'], ['ltu', 'っ'], ['tyuu', 'ちゅう'], ['fa', 'ふぁ'], ['KOU', 'こう'], ['nya', 'にゃ'],
  ])('%s -> %s', (input, expected) => {
    expect(toHiragana(input)).toBe(expected);
  });
});

describe('toHiraganaLive keeps the unfinished syllable', () => {
  it.each([
    ['k', 'k'], ['ky', 'ky'], ['kyo', 'きょ'], ['n', 'n'], ['hon', 'ほn'], ['honn', 'ほん'],
    ['sh', 'sh'], ['shi', 'し'], ['kan', 'かn'], ['kanj', 'かんj'],
  ])('partial %s -> %s', (input, expected) => {
    expect(toHiraganaLive(input)).toBe(expected);
  });

  it('is idempotent on already converted text plus a new key (keystroke-by-keystroke)', () => {
    let field = '';
    for (const key of 'gakkou') field = toHiraganaLive(field + key);
    expect(field).toBe('がっこう');
    // Like real IMEs (and the Kotlin app, which also converts the whole field per keystroke),
    // a typed "nn" commits ん at once, so ん+に needs three n's when typed key by key.
    field = '';
    for (const key of 'konnnichiwa') field = toHiraganaLive(field + key);
    expect(field).toBe('こんにちわ');
    field = '';
    for (const key of 'kanji') field = toHiraganaLive(field + key);
    expect(field).toBe('かんじ');
  });
});

describe('katakanaToHiragana', () => {
  it.each([['コウ', 'こう'], ['ジ', 'じ'], ['ひ', 'ひ'], ['キョウ', 'きょう']])('kata %s -> %s', (input, expected) => {
    expect(katakanaToHiragana(input)).toBe(expected);
  });
});

describe('isKana', () => {
  it('accepts kana and rejects latin/empty', () => {
    expect(isKana('こうー')).toBe(true);
    expect(isKana('コウ')).toBe(true);
    expect(isKana('kou')).toBe(false);
    expect(isKana('')).toBe(false);
  });
});
