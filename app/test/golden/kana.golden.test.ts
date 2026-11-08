import { DummyEditable, fixup, TypedError, kanaMapGet, simulateInput, toKatakana } from '../../src/core/kana';
import { convertKatakanaToHiragana } from '../../src/core/kana/kanaUtil';
import { goldenSuite } from './harness';

/** `{value}`, or `{error, message}` for a thrown typed error. */
function attempt<T>(call: () => T): { value: T } | { error: string; message: string } {
  try {
    return { value: call() };
  } catch (e) {
    if (e instanceof TypedError) return { error: e.errorType, message: e.message };
    throw e;
  }
}

goldenSuite<{ romaji: string }>('kana/table.json', ({ romaji }) => ({
  mapValue: kanaMapGet(romaji),
  simulateInput: attempt(() => simulateInput(romaji)),
}));

goldenSuite<{ romaji: string }>('kana/edge.json', ({ romaji }) => ({
  simulateInput: attempt(() => simulateInput(romaji)),
}));

goldenSuite<{ text: string }>('kana/convert.json', ({ text }) => ({
  toKatakana: toKatakana(text),
  convertKatakanaToHiragana: convertKatakanaToHiragana(text),
}));

goldenSuite<{ reading: string; romaji: string; romajiKatakana: string }>('kana/readings.jsonl', (input) => {
  const katakana = toKatakana(input.reading);
  return {
    simulateInput: attempt(() => simulateInput(input.romaji)),
    simulateInputKatakana: attempt(() => simulateInput(input.romajiKatakana)),
    toKatakana: katakana,
    convertKatakanaToHiragana: convertKatakanaToHiragana(katakana),
  };
});

type SequenceEdit = { insert: string; at: number } | { backspace: true };

/**
 * Each edit on a `DummyEditable`, then one `fixup` over the inserted range (no
 * re-entrancy). Backspace removes a whole surrogate pair.
 */
goldenSuite<{ edits: SequenceEdit[] }>('kana/fixup-sequences.json', ({ edits }) => {
  const s = new DummyEditable('');
  const after = edits.map((edit) => attempt(() => {
    if ('backspace' in edit) {
      if (s.length > 0) {
        const end = s.length;
        const low = end >= 2 && isLowSurrogate(s.charAt(end - 1));
        s.delete(low ? end - 2 : end - 1, end);
        fixup(s, s.length, s.length);
      }
      return s.toString();
    }
    const at = edit.at < 0 ? s.length : Math.min(edit.at, s.length);
    s.insert(at, edit.insert);
    fixup(s, at, at + edit.insert.length);
    return s.toString();
  }));
  return { after };
});

function isLowSurrogate(c: string): boolean {
  const code = c.charCodeAt(0);
  return code >= 0xdc00 && code <= 0xdfff;
}
