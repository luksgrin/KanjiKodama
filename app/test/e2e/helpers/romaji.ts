/** Kana → romaji as a learner would type it on a Latin keyboard (the inverse the answer field undoes). */
const BASE: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', だ: 'da', ぢ: 'di', づ: 'du', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'wo', ん: 'nn',
  ぁ: 'xa', ぃ: 'xi', ぅ: 'xu', ぇ: 'xe', ぉ: 'xo', ー: '-',
};
const YOON: Record<string, string> = { ゃ: 'ya', ゅ: 'yu', ょ: 'yo' };

function toHiragana(s: string): string {
  return [...s].map((c) => {
    const code = c.charCodeAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : c;
  }).join('');
}

export function kanaToRomaji(kana: string): string {
  const chars = [...toHiragana(kana)];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const next = chars[i + 1];
    if (c === 'っ' && next !== undefined) {
      const r = kanaToRomaji(chars.slice(i + 1).join(''));
      out += r[0] === 'c' ? 't' : (r[0] ?? '');
      continue;
    }
    const base = BASE[c];
    if (base === undefined) throw new Error('kana without a romaji spelling');
    if (next !== undefined && YOON[next] !== undefined && base.endsWith('i') && base.length > 1) {
      const stem = base.slice(0, -1);
      const y = YOON[next]!;
      out += stem === 'sh' || stem === 'ch' || stem === 'j' ? stem + y.slice(1) : stem + y;
      i++;
      continue;
    }
    out += base;
  }
  return out;
}
