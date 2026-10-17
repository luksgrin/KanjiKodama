/**
 * Incremental romaji → hiragana conversion in the wanakana style.
 * Port of core/srs/src/main/kotlin/app/kanjikodama/srs/KanaConverter.kt (keep behaviour in sync).
 *
 * Converts as much of the input as is unambiguous and leaves a trailing partial syllable as
 * latin, so it can be applied on every keystroke. Supports Hepburn and kunrei spellings,
 * doubled consonants (っ), n/nn/n' handling, small-kana prefixes (x, l), and "-" for ー.
 */
const ROWS: ReadonlyArray<readonly [string, string]> = [
  ['a', 'あ'], ['i', 'い'], ['u', 'う'], ['e', 'え'], ['o', 'お'],
  ['ka', 'か'], ['ki', 'き'], ['ku', 'く'], ['ke', 'け'], ['ko', 'こ'],
  ['ga', 'が'], ['gi', 'ぎ'], ['gu', 'ぐ'], ['ge', 'げ'], ['go', 'ご'],
  ['sa', 'さ'], ['shi', 'し'], ['si', 'し'], ['su', 'す'], ['se', 'せ'], ['so', 'そ'],
  ['za', 'ざ'], ['ji', 'じ'], ['zi', 'じ'], ['zu', 'ず'], ['ze', 'ぜ'], ['zo', 'ぞ'],
  ['ta', 'た'], ['chi', 'ち'], ['ti', 'ち'], ['tsu', 'つ'], ['tu', 'つ'], ['te', 'て'], ['to', 'と'],
  ['da', 'だ'], ['di', 'ぢ'], ['dzu', 'づ'], ['du', 'づ'], ['de', 'で'], ['do', 'ど'],
  ['na', 'な'], ['ni', 'に'], ['nu', 'ぬ'], ['ne', 'ね'], ['no', 'の'],
  ['ha', 'は'], ['hi', 'ひ'], ['fu', 'ふ'], ['hu', 'ふ'], ['he', 'へ'], ['ho', 'ほ'],
  ['ba', 'ば'], ['bi', 'び'], ['bu', 'ぶ'], ['be', 'べ'], ['bo', 'ぼ'],
  ['pa', 'ぱ'], ['pi', 'ぴ'], ['pu', 'ぷ'], ['pe', 'ぺ'], ['po', 'ぽ'],
  ['ma', 'ま'], ['mi', 'み'], ['mu', 'む'], ['me', 'め'], ['mo', 'も'],
  ['ya', 'や'], ['yu', 'ゆ'], ['yo', 'よ'],
  ['ra', 'ら'], ['ri', 'り'], ['ru', 'る'], ['re', 'れ'], ['ro', 'ろ'],
  ['wa', 'わ'], ['wo', 'を'], ['we', 'ゑ'], ['wi', 'ゐ'],
  ['nn', 'ん'], ["n'", 'ん'], ['-', 'ー'],
  ['kya', 'きゃ'], ['kyu', 'きゅ'], ['kyo', 'きょ'],
  ['gya', 'ぎゃ'], ['gyu', 'ぎゅ'], ['gyo', 'ぎょ'],
  ['sha', 'しゃ'], ['shu', 'しゅ'], ['sho', 'しょ'], ['sya', 'しゃ'], ['syu', 'しゅ'], ['syo', 'しょ'],
  ['ja', 'じゃ'], ['ju', 'じゅ'], ['jo', 'じょ'], ['jya', 'じゃ'], ['jyu', 'じゅ'], ['jyo', 'じょ'],
  ['zya', 'じゃ'], ['zyu', 'じゅ'], ['zyo', 'じょ'],
  ['cha', 'ちゃ'], ['chu', 'ちゅ'], ['cho', 'ちょ'], ['tya', 'ちゃ'], ['tyu', 'ちゅ'], ['tyo', 'ちょ'],
  ['dya', 'ぢゃ'], ['dyu', 'ぢゅ'], ['dyo', 'ぢょ'],
  ['nya', 'にゃ'], ['nyu', 'にゅ'], ['nyo', 'にょ'],
  ['hya', 'ひゃ'], ['hyu', 'ひゅ'], ['hyo', 'ひょ'],
  ['bya', 'びゃ'], ['byu', 'びゅ'], ['byo', 'びょ'],
  ['pya', 'ぴゃ'], ['pyu', 'ぴゅ'], ['pyo', 'ぴょ'],
  ['mya', 'みゃ'], ['myu', 'みゅ'], ['myo', 'みょ'],
  ['rya', 'りゃ'], ['ryu', 'りゅ'], ['ryo', 'りょ'],
  ['fa', 'ふぁ'], ['fi', 'ふぃ'], ['fe', 'ふぇ'], ['fo', 'ふぉ'],
  ['va', 'ゔぁ'], ['vi', 'ゔぃ'], ['vu', 'ゔ'], ['ve', 'ゔぇ'], ['vo', 'ゔぉ'],
  ['she', 'しぇ'], ['je', 'じぇ'], ['che', 'ちぇ'],
  ['tsa', 'つぁ'], ['tsi', 'つぃ'], ['tse', 'つぇ'], ['tso', 'つぉ'],
  ['thi', 'てぃ'], ['dhi', 'でぃ'], ['twu', 'とぅ'], ['dwu', 'どぅ'],
  ['wha', 'うぁ'], ['whi', 'うぃ'], ['whe', 'うぇ'], ['who', 'うぉ'],
  ['xa', 'ぁ'], ['xi', 'ぃ'], ['xu', 'ぅ'], ['xe', 'ぇ'], ['xo', 'ぉ'],
  ['xya', 'ゃ'], ['xyu', 'ゅ'], ['xyo', 'ょ'], ['xtu', 'っ'], ['xtsu', 'っ'], ['xwa', 'ゎ'], ['xka', 'ヵ'], ['xke', 'ヶ'],
  ['la', 'ぁ'], ['li', 'ぃ'], ['lu', 'ぅ'], ['le', 'ぇ'], ['lo', 'ぉ'],
  ['lya', 'ゃ'], ['lyu', 'ゅ'], ['lyo', 'ょ'], ['ltu', 'っ'], ['ltsu', 'っ'],
];

const TABLE: ReadonlyMap<string, string> = new Map(ROWS);
const MAX_KEY = Math.max(...ROWS.map(([k]) => k.length));
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
const CONSONANTS = new Set('bcdfghjklmpqrstvwxyz'.split(''));

/** Convert a submitted answer: a trailing lone "n" becomes ん. */
export function toHiragana(input: string): string {
  return convert(input, false);
}

/** Convert while typing: a trailing lone "n" stays latin until the next key resolves it. */
export function toHiraganaLive(input: string): string {
  return convert(input, true);
}

function convert(input: string, live: boolean): string {
  const s = input.toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    // doubled consonant (kk, ss, tt, pp, ...) → っ; also "tch" → っ + ch
    if (CONSONANTS.has(c) && i + 1 < s.length && (s.charAt(i + 1) === c || (c === 't' && s.startsWith('ch', i + 1)))) {
      out += 'っ';
      i++;
      continue;
    }
    // n: "n'" → ん; "nn" → ん (the second n starts the next syllable when a vowel or y follows,
    // as in konnichiwa); n before a consonant → ん; lone trailing n → ん on submit
    if (c === 'n') {
      if (i + 1 < s.length) {
        const next = s.charAt(i + 1);
        if (next === "'") { out += 'ん'; i += 2; continue; }
        if (next === 'n') {
          const after = i + 2 < s.length ? s.charAt(i + 2) : null;
          out += 'ん';
          i += after !== null && (VOWELS.has(after) || after === 'y') ? 1 : 2;
          continue;
        }
        if (!VOWELS.has(next) && next !== 'y') { out += 'ん'; i++; continue; }
      } else if (!live) {
        out += 'ん';
        i++;
        continue;
      }
    }
    let matched = false;
    for (let len = Math.min(MAX_KEY, s.length - i); len >= 1; len--) {
      const kana = TABLE.get(s.substring(i, i + len));
      if (kana !== undefined) {
        out += kana;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += c;
      i++;
    }
  }
  return out;
}

/** True when the string is entirely hiragana/katakana (plus ー and spaces). */
export function isKana(s: string): boolean {
  if (s.length === 0) return false;
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (!((code >= 0x3040 && code <= 0x30ff) || ch === 'ー' || ch === ' ')) return false;
  }
  return true;
}

/** Katakana → hiragana (for comparing on'yomi stored in katakana with typed hiragana). */
export function katakanaToHiragana(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    out += code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : ch;
  }
  return out;
}
