/**
 * Port of `util/KanaUtil`.
 */

/**
 * `KanaUtil.convertKatakanaToHiragana`: full-width katakana U+30A1–U+30FE minus 0x60, and half-width
 * katakana U+FF66–U+FF9D minus 0xCF25 (Java's exact arithmetic, which maps half-width forms onto
 * unrelated characters around U+3041); everything else unchanged, char by char.
 */
export function convertKatakanaToHiragana(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x30a1 && c <= 0x30fe) out += String.fromCharCode(c - 0x60);
    else if (c >= 0xff66 && c <= 0xff9d) out += String.fromCharCode(c - 0xcf25);
    else out += String.fromCharCode(c);
  }
  return out;
}
