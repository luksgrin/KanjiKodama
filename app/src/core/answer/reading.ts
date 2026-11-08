/**
 * Reading answer matching: exact match (on'yomi also in katakana) and the digraph
 * check (a regular kana typed where the reading has a small one, or the other way round).
 */
import type { Reading } from '../content';
import { toKatakana } from '../kana';
import type { DigraphMatch } from './verdict';

const SMALL_KANA = 'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ';
const REGULAR_KANA = 'あいうえおつやゆよわかけアイウエオツヤユヨワカケ';

/** `Reading.isOnYomi`. */
export function isOnYomi(r: Reading): boolean {
  return r.type === 'onyomi';
}

/** `Reading.isKunYomi`. */
export function isKunYomi(r: Reading): boolean {
  return r.type === 'kunyomi';
}

/** `toKatakana`, passing null through. */
function katakanaOf(reading: string | null): string | null {
  return reading === null ? null : toKatakana(reading);
}

/**
 * `Reading.matches`: the answer equals the reading; an on'yomi also matches in katakana, and with
 * `requireOnInKatakana` only in katakana.
 */
export function readingMatches(r: Reading, answer: string, requireOnInKatakana: boolean): boolean {
  if (isOnYomi(r)) {
    if (requireOnInKatakana) return katakanaOf(r.reading) === answer;
    return r.reading === answer || katakanaOf(r.reading) === answer;
  }
  return r.reading === answer;
}

/** The private two-argument `Reading.matchesForDigraph`. */
function digraphAgainst(answer: string, baseLine: string | null): DigraphMatch | null {
  if (baseLine === null || answer.length !== baseLine.length) return null;
  let regular = '';
  let small = '';
  for (let i = 0; i < answer.length; i++) {
    const c1 = answer[i] as string;
    const c2 = baseLine[i] as string;
    if (c1 === c2) continue;
    const p1 = REGULAR_KANA.indexOf(c1);
    if (p1 >= 0 && SMALL_KANA[p1] === c2) {
      regular = c1;
      small = c2;
      continue;
    }
    const p2 = SMALL_KANA.indexOf(c1);
    if (p2 >= 0 && REGULAR_KANA[p2] === c2) {
      regular = c2;
      small = c1;
      continue;
    }
    return null;
  }
  return regular !== '' ? [regular, small] : null;
}

/**
 * `Reading.matchesForDigraph`: the answer differs from the reading only by regular/small kana swaps;
 * returns the last swapped pair. An on'yomi is also compared in katakana.
 */
export function readingMatchesForDigraph(r: Reading, answer: string): DigraphMatch | null {
  if (isOnYomi(r)) {
    return digraphAgainst(answer, r.reading) ?? digraphAgainst(answer, katakanaOf(r.reading));
  }
  return digraphAgainst(answer, r.reading);
}
