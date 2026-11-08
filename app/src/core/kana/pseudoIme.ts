/**
 * Replaces romaji in a string with kana, roughly the way a Japanese IME
 * with romaji input does. Lower-case romaji give hiragana, upper-case romaji katakana.
 *
 * `fixup` works on an {@link Editable} in place; the
 * answer field's re-entrant use of it is modelled in `answerField.ts`.
 */
import { stringIndexOutOfBounds } from './typedError';

/**
 * The part of an editable text that `fixup` uses. Indices are UTF-16 units.
 */
export interface Editable {
  readonly length: number;
  /** The unit at `index`: throws {@link TypedError} (`StringIndexOutOfBoundsException`) when out of range. */
  charAt(index: number): string;
  /** The text from `start` to `end`. */
  substring(start: number, end: number): string;
  replace(start: number, end: number, text: string): void;
  delete(start: number, end: number): void;
  toString(): string;
}

/** The lower-case (hiragana) entries of the kana map, in matching order. */
const HIRAGANA_ENTRIES: readonly (readonly [string, string])[] = [
  // Single vowels
  ['a', 'あ'],
  ['i', 'い'],
  ['u', 'う'],
  ['e', 'え'],
  ['o', 'お'],

  // K and G
  ['ka', 'か'],
  ['ga', 'が'],
  ['ki', 'き'],
  ['gi', 'ぎ'],
  ['ku', 'く'],
  ['gu', 'ぐ'],
  ['ke', 'け'],
  ['ge', 'げ'],
  ['ko', 'こ'],
  ['go', 'ご'],

  // K variants
  ['ca', 'か'],
  ['ci', 'き'],
  ['cu', 'く'],
  ['ce', 'け'],
  ['co', 'こ'],

  // S and Z, special case shi/si
  ['sa', 'さ'],
  ['za', 'ざ'],
  ['shi', 'し'],
  ['si', 'し'],
  ['ji', 'じ'],
  ['zi', 'じ'],
  ['su', 'す'],
  ['zu', 'ず'],
  ['se', 'せ'],
  ['ze', 'ぜ'],
  ['so', 'そ'],
  ['zo', 'ぞ'],

  // T and D, special cases chi/ti, tsu/tu and the small tsu
  ['ta', 'た'],
  ['da', 'だ'],
  ['chi', 'ち'],
  ['ti', 'ち'],
  ['di', 'ぢ'],
  ['tsu', 'つ'],
  ['tu', 'つ'],
  ['du', 'づ'],
  ['te', 'て'],
  ['de', 'で'],
  ['to', 'と'],
  ['do', 'ど'],

  // Standalone small tsu, when not triggered a a double consonant
  ['ltu', 'っ'],
  ['xtu', 'っ'],
  ['ltsu', 'っ'],

  // N but without the standalone N
  ['na', 'な'],
  ['ni', 'に'],
  ['nu', 'ぬ'],
  ['ne', 'ね'],
  ['no', 'の'],

  // H, B and P, with special case fu/hu
  ['ha', 'は'],
  ['ba', 'ば'],
  ['pa', 'ぱ'],
  ['hi', 'ひ'],
  ['bi', 'び'],
  ['pi', 'ぴ'],
  ['fu', 'ふ'],
  ['hu', 'ふ'],
  ['bu', 'ぶ'],
  ['pu', 'ぷ'],
  ['he', 'へ'],
  ['be', 'べ'],
  ['pe', 'ぺ'],
  ['ho', 'ほ'],
  ['bo', 'ぼ'],
  ['po', 'ぽ'],

  // M
  ['ma', 'ま'],
  ['mi', 'み'],
  ['mu', 'む'],
  ['me', 'め'],
  ['mo', 'も'],

  // Y with special cases the small ones
  ['ya', 'や'],
  ['yu', 'ゆ'],
  ['yo', 'よ'],

  // Small ya/yu/yo standalone, when not triggered by a contraction like 'kyo'
  ['xya', 'ゃ'],
  ['xyu', 'ゅ'],
  ['xyo', 'ょ'],

  // R
  ['ra', 'ら'],
  ['ri', 'り'],
  ['ru', 'る'],
  ['re', 'れ'],
  ['ro', 'ろ'],

  // R variants for loan words with L sounds
  ['la', 'ら'],
  ['li', 'り'],
  ['lu', 'る'],
  ['le', 'れ'],
  ['lo', 'ろ'],

  // W with special case small wa
  // wi and we are not represented here, they are used for digraphs 'ui', 'ue'
  ['wa', 'わ'],
  ['wo', 'を'],
  ['lwe', 'ゎ'],
  ['xwa', 'ゎ'],

  // Standalone N
  // This one has some special cases when followed by a non-vowel, such as nk -> んk
  ['nn', 'ん'],
  ['n ', 'ん'],
  ['xn', 'ん'],

  // Regular ya/yu/yo digraphs, many with variants
  ['kya', 'きゃ'],
  ['kyu', 'きゅ'],
  ['kyo', 'きょ'],
  ['gya', 'ぎゃ'],
  ['gyu', 'ぎゅ'],
  ['gyo', 'ぎょ'],
  ['qya', 'くゃ'],
  ['qyu', 'くゅ'],
  ['qyo', 'くょ'],
  ['sha', 'しゃ'],
  ['shya', 'しゃ'],
  ['sya', 'しゃ'],
  ['shu', 'しゅ'],
  ['shyu', 'しゅ'],
  ['syu', 'しゅ'],
  ['sho', 'しょ'],
  ['shyo', 'しょ'],
  ['syo', 'しょ'],
  ['zya', 'じゃ'],
  ['zyu', 'じゅ'],
  ['zyo', 'じょ'],
  ['ja', 'じゃ'],
  ['ju', 'じゅ'],
  ['jo', 'じょ'],
  ['jya', 'じゃ'],
  ['jyu', 'じゅ'],
  ['jyo', 'じょ'],
  ['cha', 'ちゃ'],
  ['cya', 'ちゃ'],
  ['chya', 'ちゃ'],
  ['tya', 'ちゃ'],
  ['chu', 'ちゅ'],
  ['cyu', 'ちゅ'],
  ['chyu', 'ちゅ'],
  ['tyu', 'ちゅ'],
  ['cho', 'ちょ'],
  ['cyo', 'ちょ'],
  ['chyo', 'ちょ'],
  ['tyo', 'ちょ'],
  ['dya', 'ぢゃ'],
  ['dyu', 'ぢゅ'],
  ['dyo', 'ぢょ'],
  ['tha', 'てゃ'],
  ['thu', 'てゅ'],
  ['tho', 'てょ'],
  ['dha', 'でゃ'],
  ['dhu', 'でゅ'],
  ['dho', 'でょ'],
  ['nya', 'にゃ'],
  ['nyu', 'にゅ'],
  ['nyo', 'にょ'],
  ['hya', 'ひゃ'],
  ['hyu', 'ひゅ'],
  ['hyo', 'ひょ'],
  ['bya', 'びゃ'],
  ['byu', 'びゅ'],
  ['byo', 'びょ'],
  ['pya', 'ぴゃ'],
  ['pyu', 'ぴゅ'],
  ['pyo', 'ぴょ'],
  ['fya', 'ふゃ'],
  ['fyu', 'ふゅ'],
  ['fyo', 'ふょ'],
  ['mya', 'みゃ'],
  ['myu', 'みゅ'],
  ['myo', 'みょ'],
  ['rya', 'りゃ'],
  ['ryu', 'りゅ'],
  ['ryo', 'りょ'],
  ['lya', 'りゃ'],
  ['lyu', 'りゅ'],
  ['lyo', 'りょ'],
  ['vya', 'ゔゃ'],
  ['vyu', 'ゔゅ'],
  ['vyo', 'ゔょ'],

  // A bunch of digraphs that use small a/i/u/e/o vowels
  ['ye', 'いぇ'],
  ['wha', 'うぁ'],
  ['whi', 'うぃ'],
  ['whe', 'うぇ'],
  ['who', 'うぉ'],
  ['wi', 'うぃ'],
  ['we', 'うぇ'],
  ['kyi', 'きぃ'],
  ['kye', 'きぇ'],
  ['qwa', 'くぁ'],
  ['qwi', 'くぃ'],
  ['qwu', 'くぅ'],
  ['qwe', 'くぇ'],
  ['qwo', 'くぉ'],
  ['qa', 'くぁ'],
  ['qi', 'くぃ'],
  ['qe', 'くぇ'],
  ['qo', 'くぉ'],
  ['kwa', 'くぁ'],
  ['qyi', 'くぃ'],
  ['qye', 'くぇ'],
  ['gyi', 'ぎぃ'],
  ['gye', 'ぎぇ'],
  ['gwa', 'ぐぁ'],
  ['gwi', 'ぐぃ'],
  ['gwu', 'ぐぅ'],
  ['gwe', 'ぐぇ'],
  ['gwo', 'ぐぉ'],
  ['syi', 'しぃ'],
  ['sye', 'しぇ'],
  ['she', 'しぇ'],
  ['shye', 'しぇ'],
  ['zyi', 'じぃ'],
  ['zye', 'じぇ'],
  ['je', 'じぇ'],
  ['jyi', 'じぃ'],
  ['jye', 'じぇ'],
  ['swa', 'すぁ'],
  ['swi', 'すぃ'],
  ['swu', 'すぅ'],
  ['swe', 'すぇ'],
  ['swo', 'すぉ'],
  ['che', 'ちぇ'],
  ['cyi', 'ちぃ'],
  ['cye', 'ちぇ'],
  ['tyi', 'ちぃ'],
  ['tye', 'ちぇ'],
  ['chye', 'ちぇ'],
  ['dyi', 'ぢぃ'],
  ['dye', 'ぢぇ'],
  ['tsa', 'つぁ'],
  ['tsi', 'つぃ'],
  ['tse', 'つぇ'],
  ['tso', 'つぉ'],
  ['thi', 'てぃ'],
  ['the', 'てぇ'],
  ['twa', 'とぁ'],
  ['twi', 'とぃ'],
  ['twu', 'とぅ'],
  ['twe', 'とぇ'],
  ['two', 'とぉ'],
  ['dhi', 'でぃ'],
  ['dhe', 'でぇ'],
  ['dwa', 'どぁ'],
  ['dwi', 'どぃ'],
  ['dwu', 'どぅ'],
  ['dwe', 'どぇ'],
  ['dwo', 'どぉ'],
  ['nyi', 'にぃ'],
  ['nye', 'にぇ'],
  ['hyi', 'ひぃ'],
  ['hye', 'ひぇ'],
  ['fwa', 'ふぁ'],
  ['fwi', 'ふぃ'],
  ['fwu', 'ふぅ'],
  ['fwe', 'ふぇ'],
  ['fwo', 'ふぉ'],
  ['fa', 'ふぁ'],
  ['fi', 'ふぃ'],
  ['fe', 'ふぇ'],
  ['fo', 'ふぉ'],
  ['fyi', 'ふぃ'],
  ['fye', 'ふぇ'],
  ['byi', 'びぃ'],
  ['bye', 'びぇ'],
  ['pyi', 'ぴぃ'],
  ['pye', 'ぴぇ'],
  ['myi', 'みぃ'],
  ['mye', 'みぇ'],
  ['ryi', 'りぃ'],
  ['rye', 'りぇ'],
  ['lyi', 'りぃ'],
  ['lye', 'りぇ'],
  ['ve', 'ゔぇ'],
  ['vo', 'ゔぉ'],
  ['vyi', 'ゔぃ'],
  ['vye', 'ゔぇ'],
  ['va', 'ゔぁ'],
  ['vi', 'ゔぃ'],

  // Some misc vowel representations
  ['yi', 'い'],
  ['wu', 'う'],
  ['whu', 'う'],
  ['xa', 'ぁ'],
  ['xi', 'ぃ'],
  ['xu', 'ぅ'],
  ['xe', 'ぇ'],
  ['xo', 'ぉ'],
  ['xyi', 'ぃ'],
  ['xye', 'ぇ'],

  // 'u' with dakuten -> vu sound
  ['vu', 'ゔ'],

  // Small ka/ke
  ['lka', 'ゕ'],
  ['lke', 'ゖ'],
  ['xka', 'ゕ'],
  ['xke', 'ゖ'],
  ['lca', 'ゕ'],
  ['lce', 'ゖ'],
  ['xca', 'ゕ'],
  ['xce', 'ゖ'],

  // Vowel doubler '-' -> 'ー'
  ['-', 'ー'],
];

/**
 * The kana map: the lower-case entries plus, for each, its upper-case key mapped to the
 * katakana value (`key.toUpperCase(Locale.ENGLISH)` → `toKatakana(value)`). `-` is its own upper
 * case, so it maps to `toKatakana("ー")`, which is `ー` again.
 */
const KANA_MAP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>(HIRAGANA_ENTRIES);
  for (const [key, value] of HIRAGANA_ENTRIES) map.set(key.toUpperCase(), toKatakana(value));
  return map;
})();

/** `KANA_MAP.get(key)`: the kana for a romaji key, or null. */
export function kanaMapGet(key: string): string | null {
  return KANA_MAP.get(key) ?? null;
}

/** All keys of `KANA_MAP` (lower- and upper-case). */
export function kanaMapKeys(): string[] {
  return [...KANA_MAP.keys()];
}

/**
 * Whitespace: Unicode space separators except the no-break ones
 * (U+00A0, U+2007, U+202F), line and paragraph separators, and U+0009–U+000D, U+001C–U+001F.
 */
export function isWhitespaceChar(c: string): boolean {
  const code = c.charCodeAt(0);
  if ((code >= 0x09 && code <= 0x0d) || (code >= 0x1c && code <= 0x20)) return true;
  if (code < 0x1680) return false;
  return code === 0x1680 || (code >= 0x2000 && code <= 0x2006) || (code >= 0x2008 && code <= 0x200a)
    || code === 0x2028 || code === 0x2029 || code === 0x205f || code === 0x3000;
}

/**
 * Advances the IME over the edited range `[editStart, editEnd)`, converting in
 * place. An `n` before anything but a vowel, `y`, `n` or space becomes ん, a doubled consonant
 * becomes っ, the longest romaji key (up to 4 chars) ending at each position is replaced by its kana,
 * and whitespace is removed.
 */
export function fixup(s: Editable, editStart: number, editEnd: number): void {
  let start = editStart;
  let end = editEnd;

  while (start >= 0 && start < end) {
    if (start > 0) {
      const c1 = s.charAt(start - 1);
      const c2 = s.charAt(start);
      if (c1 === 'n' && 'aiueoyn '.indexOf(c2) < 0) {
        s.replace(start - 1, start, 'ん');
        continue;
      }
      if (c1 === c2 && 'bcdfghjklmpqrstvwxz'.indexOf(c1) >= 0) {
        s.replace(start - 1, start, 'っ');
        continue;
      }
    }

    let found = false;
    for (let i = start - 3; i <= start; i++) {
      if (i < 0) continue;
      const replacement = KANA_MAP.get(s.substring(i, start + 1));
      if (replacement !== undefined) {
        s.replace(i, start + 1, replacement);
        end -= start + 1 - i;
        end += replacement.length;
        if (end > s.length) end = s.length;
        start = i + replacement.length;
        found = true;
        break;
      }
    }
    if (found) continue;

    if (isWhitespaceChar(s.charAt(start))) {
      s.delete(start, start + 1);
      end--;
      continue;
    }

    start++;
  }
}

/**
 * A plain string, just enough of an `Editable` for {@link fixup}.
 */
export class DummyEditable implements Editable {
  private value: string;

  constructor(value: string) {
    this.value = value;
  }

  get length(): number {
    return this.value.length;
  }

  charAt(index: number): string {
    if (index < 0 || index >= this.value.length) throw stringIndexOutOfBounds(index, this.value.length);
    return this.value.charAt(index);
  }

  substring(start: number, end: number): string {
    return this.value.substring(start, end);
  }

  replace(start: number, end: number, text: string): void {
    this.value = this.value.substring(0, start) + text + this.value.substring(end);
  }

  insert(where: number, text: string): void {
    this.replace(where, where, text);
  }

  delete(start: number, end: number): void {
    this.replace(start, end, '');
  }

  toString(): string {
    return this.value;
  }
}

/**
 * Types `input` character by character through the IME, then turn a
 * trailing `n` into ん (what submitting does). Throws `StringIndexOutOfBoundsException` when the
 * result is empty (`""`, or only whitespace).
 */
export function simulateInput(input: string): string {
  const editable = new DummyEditable(input);
  fixup(editable, 0, input.length);
  if (editable.charAt(editable.length - 1) === 'n') {
    editable.replace(editable.length - 1, editable.length, 'ん');
  }
  return editable.toString();
}

/** Hiragana (U+3040–U+3096) to katakana; everything else unchanged. */
export function toKatakana(hiragana: string): string {
  let out = '';
  for (let i = 0; i < hiragana.length; i++) {
    const c = hiragana.charCodeAt(i);
    out += String.fromCharCode(c >= 0x3040 && c <= 0x3096 ? c + 0x60 : c);
  }
  return out;
}
