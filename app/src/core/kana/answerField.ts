/**
 * The quiz answer field's logic, from `fragments/UnansweredSessionFragment`: the TextWatcher that
 * runs `PseudoIme.fixup` over every change while a reading is typed, and the decisions of its
 * key and editor-action listeners (which keys submit, which are swallowed).
 *
 * The watcher is attached to a {@link SpanEditable}, so it runs again, nested, for every
 * replacement `fixup` itself makes, exactly like on Android: an unconverted `n` right before a
 * replaced range becomes ん (`kana/fixup-edittext.json`). The UI feeds edits into the editable
 * (insert, delete, replace at the selection) and reads back the text and selection.
 */
import { fixup } from './pseudoIme';
import { SpanEditable, type TextWatcher } from './spanEditable';

/** A key event, reduced to what the listeners look at. `keyCode` is the `KEYCODE_` suffix. */
export interface KeyEventLike {
  action: 'down' | 'up' | 'multiple';
  keyCode: string;
}

/**
 * The app's answer-field TextWatcher. While the field is active, every change is the current
 * answer; for kana questions, `afterTextChanged` runs `fixup` over the range the last
 * `onTextChanged` reported (start, start + count).
 */
export class FixupWatcher implements TextWatcher {
  /** The range from the last `onTextChanged` (the span the Java watcher puts on its copy); −1 when unset. */
  private pendingStart = -1;
  private pendingEnd = -1;
  /** Counters for tests: fixup calls, current and maximum nesting. */
  calls = 0;
  depth = 0;
  maxDepth = 0;

  constructor(
    /** `questionEdit.getTag() == true`: the field accepts input (false once an answer is submitted). */
    private readonly isActive: () => boolean,
    /** `question.getType().isKana()`: a reading question. */
    private readonly isKana: () => boolean,
    /** `FloatingUiState.setCurrentAnswer`. */
    private readonly onAnswer: (text: string) => void = () => {},
  ) {}

  onTextChanged(s: SpanEditable, start: number, _before: number, count: number): void {
    if (!this.isActive()) return;
    this.onAnswer(s.toString());
    if (this.isKana()) {
      this.pendingStart = start;
      this.pendingEnd = start + count;
    }
  }

  afterTextChanged(s: SpanEditable): void {
    if (!this.isActive()) return;
    if (!this.isKana()) return;
    const begin = this.pendingStart;
    const end = this.pendingEnd;
    this.pendingStart = -1;
    this.pendingEnd = -1;
    this.calls++;
    this.depth++;
    this.maxDepth = Math.max(this.maxDepth, this.depth);
    try {
      fixup(s, begin, end);
    } catch {
      // `ObjectSupport.safe` swallows it in the app.
    } finally {
      this.depth--;
    }
  }
}

/** `UnansweredSessionFragment.isEnterKey`: Enter or numpad Enter. */
export function isEnterKey(event: KeyEventLike | null): boolean {
  return event !== null && (event.keyCode === 'ENTER' || event.keyCode === 'NUMPAD_ENTER');
}

/**
 * `UnansweredSessionFragment.swallowFocusKey` (the field's OnKeyListener): Tab (with or without
 * Shift) and every Enter or numpad Enter release are consumed, so focus never leaves the field
 * for the session buttons.
 */
export function swallowFocusKey(event: KeyEventLike): boolean {
  if (event.keyCode === 'TAB') return true;
  return isEnterKey(event) && event.action === 'up';
}

/** The fragment state `handleEditorAction` reads. */
export interface EditorActionState {
  /** `questionEdit.getTag() == true`. */
  active: boolean;
  interactionEnabled: boolean;
  /** `session.isAnswered()`. */
  answered: boolean;
}

export interface EditorActionResult {
  /** The listener's return value (the action was consumed). */
  handled: boolean;
  /** The current text is submitted (`Session.submit`). */
  submit: boolean;
}

/**
 * `UnansweredSessionFragment.handleEditorAction(actionId, event)`: an IME action other than
 * `IME_ACTION_UNSPECIFIED` (0) or an Enter/numpad Enter press submits; an Enter release is consumed.
 * After a submit the caller makes the field inactive, and active again on a retry verdict.
 */
export function handleEditorAction(actionId: number, event: KeyEventLike | null,
  state: EditorActionState): EditorActionResult {
  if (!state.active) return { handled: false, submit: false };
  let ok = event === null && actionId !== 0;
  if (isEnterKey(event) && event?.action === 'down') ok = true;
  if (isEnterKey(event) && event?.action === 'up') return { handled: true, submit: false };
  if (ok && state.interactionEnabled) return { handled: true, submit: !state.answered };
  return { handled: false, submit: false };
}

/** Creates the field's editable with the app's watcher attached (cursor at 0, like a new EditText). */
export function newAnswerEditable(watcher: FixupWatcher, text = ''): SpanEditable {
  const s = new SpanEditable(text);
  s.setSelection(0);
  s.watchers.push(watcher);
  return s;
}
