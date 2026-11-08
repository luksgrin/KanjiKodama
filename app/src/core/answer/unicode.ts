/**
 * The Unicode behavior `util/FuzzyMatching.cleanString` gets from Android: `Character.getType` and
 * `String.toLowerCase(Locale.ENGLISH)`, frozen from the device (Android 16, ICU 76.1, Unicode 16) in
 * `unicodeData.ts`, so the result doesn't depend on the JavaScript engine's Unicode version.
 */
import { CLASS_CODES, CLASS_STARTS, LETTER_CASE_STARTS, LOWER_PAIRS } from './unicodeData';

/** cleanString's treatment of a code point. */
export const enum CleanClass {
  /** Appended as is. */
  Keep = 0,
  /** Unassigned, or SPACE_SEPARATOR..SURROGATE (separators, controls, format, private use, surrogates): becomes a space. */
  Space = 1,
  /** DECIMAL_DIGIT_NUMBER or DASH_PUNCTUATION and above: runs through `cleanReplace`. */
  Replace = 2,
}

/** Index of the last range start <= cp. */
function rangeIndex(starts: readonly number[], cp: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] as number) <= cp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** cleanString's class of a code point (from `Character.getType` on the device). */
export function cleanClass(cp: number): CleanClass {
  return CLASS_CODES[rangeIndex(CLASS_STARTS, cp)] as CleanClass;
}

/** `Character.isUpperCase || isLowerCase || isTitleCase` on Android (general category Lu, Ll or Lt). */
function isLetterCase(cp: number): boolean {
  if (cp < (LETTER_CASE_STARTS[0] as number)) return false;
  return rangeIndex(LETTER_CASE_STARTS, cp) % 2 === 0;
}

const LOWER = new Map<number, string>(LOWER_PAIRS);

const CAPITAL_SIGMA = 0x03a3;
const CAPITAL_I_WITH_DOT = 0x0130;

/**
 * Android's `CaseMapper.isFinalSigma`: the UTF-16 unit before Σ is a cased letter and the one after
 * (if any) is not.
 */
function isFinalSigmaSimple(s: string, i: number): boolean {
  if (i <= 0) return false;
  if (!isLetterCase(s.charCodeAt(i - 1))) return false;
  if (i + 1 >= s.length) return true;
  return !isLetterCase(s.charCodeAt(i + 1));
}

const CASED = /\p{Cased}/u;
const CASE_IGNORABLE = /\p{Case_Ignorable}/u;

/**
 * Unicode's Final_Sigma context, as ICU applies it: a cased letter, then case-ignorables, before Σ,
 * and no case-ignorables then cased letter after it. Uses the engine's Cased/Case_Ignorable
 * properties (the device has Unicode 16; only characters newer than that could differ).
 */
function isFinalSigmaIcu(s: string, i: number): boolean {
  let j = i;
  let before = false;
  while (j > 0) {
    const unit = s.charCodeAt(j - 1);
    const pair = unit >= 0xdc00 && unit <= 0xdfff && j >= 2 ? (s.codePointAt(j - 2) as number) : -1;
    const c = pair > 0xffff ? pair : unit;
    j -= c > 0xffff ? 2 : 1;
    const ch = String.fromCodePoint(c);
    if (CASE_IGNORABLE.test(ch)) continue;
    before = CASED.test(ch);
    break;
  }
  if (!before) return false;
  let k = i + 1;
  while (k < s.length) {
    const c = s.codePointAt(k) as number;
    k += c > 0xffff ? 2 : 1;
    const ch = String.fromCodePoint(c);
    if (CASE_IGNORABLE.test(ch)) continue;
    return !CASED.test(ch);
  }
  return true;
}

/**
 * `String.toLowerCase(Locale.ENGLISH)` on Android (libcore `CaseMapper.toLowerCase`): unit by unit
 * with `Character.toLowerCase` and its own final-sigma test, except that a string with U+0130 or a
 * high surrogate goes to ICU (full mappings per code point, Unicode's Final_Sigma).
 */
export function androidToLowerCase(s: string): string {
  let icu = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    if (ch === CAPITAL_I_WITH_DOT || (ch >= 0xd800 && ch <= 0xdbff)) {
      icu = true;
      break;
    }
  }
  let out = '';
  if (!icu) {
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      if (ch === CAPITAL_SIGMA && isFinalSigmaSimple(s, i)) out += 'ς';
      else out += LOWER.get(ch) ?? s[i];
    }
    return out;
  }
  let i = 0;
  while (i < s.length) {
    const cp = s.codePointAt(i) as number;
    const len = cp > 0xffff ? 2 : 1;
    if (cp === CAPITAL_SIGMA && isFinalSigmaIcu(s, i)) out += 'ς';
    else out += LOWER.get(cp) ?? s.slice(i, i + len);
    i += len;
  }
  return out;
}
