/**
 * Romaji to kana (port of `util/PseudoIme`: live `fixup` and submit-time `simulateInput`),
 * `toKatakana`, `KanaUtil.convertKatakanaToHiragana`, and the answer field model (the app's
 * TextWatcher running `fixup` re-entrantly, and the Enter/editor-action decisions).
 * Replaces the spike's src/kana/kanaConverter.ts. Java: util/PseudoIme, util/KanaUtil,
 * fragments/UnansweredSessionFragment. Fixtures: kana/*.
 */
export { DummyEditable, fixup, isJavaWhitespace, kanaMapGet, kanaMapKeys, simulateInput, toKatakana } from './pseudoIme';
export type { Editable } from './pseudoIme';
export { convertKatakanaToHiragana } from './kanaUtil';
export { JavaException } from './javaException';
export {
  FixupWatcher,
  handleEditorAction,
  isEnterKey,
  newAnswerEditable,
  swallowFocusKey,
  type EditorActionResult,
  type EditorActionState,
  type KeyEventLike,
} from './answerField';
export {
  COMPOSING,
  EXCLUSIVE_EXCLUSIVE,
  POINT_POINT,
  SELECTION_END,
  SELECTION_START,
  SpanEditable,
  type Anchor,
  type Span,
  type SpannedText,
  type TextWatcher,
} from './spanEditable';
