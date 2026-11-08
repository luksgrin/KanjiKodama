/**
 * Test-side emulation of the Android pieces around the answer field that the device kana fixtures
 * drive: `TextView.setText` and the field's `InputConnection` (AOSP `BaseInputConnection`). The
 * app logic under test (the watcher, `fixup`, the span rules) is in `src/core/kana`; this only
 * reproduces how Android calls into it.
 */
import { COMPOSING, EXCLUSIVE_EXCLUSIVE, SpanEditable, type Span } from '../../src/core/kana/spanEditable';
import { FixupWatcher } from '../../src/core/kana/answerField';

/** An EditText holding the app's watcher (active, reading question), as in the golden tests. */
export class SimEditText {
  text: SpanEditable;
  readonly watcher: FixupWatcher;
  /** Hooks re-attached to every new Editable (`setText` makes a new one), e.g. the undo filter. */
  readonly filters: SpanEditable['filters'][number][] = [];

  constructor(watcher = new FixupWatcher(() => true, () => true)) {
    this.watcher = watcher;
    this.text = this.newEditable('');
    this.text.setSelection(0);
  }

  private newEditable(value: string): SpanEditable {
    const s = new SpanEditable(value);
    s.watchers.push(this.watcher);
    s.filters.push(...this.filters);
    return s;
  }

  /**
   * `TextView.setText(t)`: a new Editable, cursor at 0 (`ArrowKeyMovementMethod.initialize`), then
   * `onTextChanged(0, oldLength, newLength)` and `afterTextChanged` on the new text.
   */
  setText(value: string): void {
    const oldLength = this.text.length;
    const s = this.newEditable(value);
    s.setSelection(0);
    this.text = s;
    for (const w of [...s.watchers]) w.onTextChanged(s, 0, oldLength, value.length);
    for (const w of [...s.watchers]) w.afterTextChanged(s);
  }
}

/** AOSP `BaseInputConnection` (editable mode) on a {@link SimEditText}. */
export class SimInputConnection {
  constructor(private readonly edit: SimEditText) {}

  private get content(): SpanEditable {
    return this.edit.text;
  }

  commitText(text: string, newCursorPosition = 1): boolean {
    this.replaceText(text, newCursorPosition, false);
    return true;
  }

  setComposingText(text: string, newCursorPosition = 1): boolean {
    this.replaceText(text, newCursorPosition, true);
    return true;
  }

  finishComposingText(): boolean {
    this.content.removeSpan(COMPOSING);
    return true;
  }

  setSelection(start: number, end: number): boolean {
    const len = this.content.length;
    if (start < 0 || end < 0 || start > len || end > len) return true;
    this.content.setSelection(start, end);
    return true;
  }

  /** `BaseInputConnection.replaceText`. */
  private replaceText(text: string, newCursorPosition: number, composing: boolean): void {
    const content = this.content;
    let a = content.getSpanStart(COMPOSING);
    let b = content.getSpanEnd(COMPOSING);
    if (b < a) [a, b] = [b, a];
    if (a !== -1 && b !== -1) {
      content.removeSpan(COMPOSING);
    } else {
      a = Math.max(content.selectionStart, 0);
      b = Math.max(content.selectionEnd, 0);
      if (b < a) [a, b] = [b, a];
    }
    let cursor = newCursorPosition > 0 ? newCursorPosition + b - 1 : newCursorPosition + a;
    cursor = Math.min(Math.max(cursor, 0), content.length);
    content.setSelection(cursor);
    if (composing) {
      const spans = new Map<object, Span>([[COMPOSING, { start: 0, end: text.length, ...EXCLUSIVE_EXCLUSIVE }]]);
      content.replace(a, b, { text, spans });
    } else {
      content.replace(a, b, text);
    }
  }

  /** `BaseInputConnection.deleteSurroundingText`: relative to the selection widened by the composing region. */
  deleteSurroundingText(beforeLength: number, afterLength: number): boolean {
    const content = this.content;
    let a = content.selectionStart;
    let b = content.selectionEnd;
    if (a > b) [a, b] = [b, a];
    let ca = content.getSpanStart(COMPOSING);
    let cb = content.getSpanEnd(COMPOSING);
    if (cb < ca) [ca, cb] = [cb, ca];
    if (ca !== -1 && cb !== -1) {
      if (ca < a) a = ca;
      if (cb > b) b = cb;
    }
    let deleted = 0;
    if (beforeLength > 0) {
      const start = Math.max(a - beforeLength, 0);
      const n = a - start;
      if (a >= 0 && n > 0) {
        content.delete(start, a);
        deleted = n;
      }
    }
    if (afterLength > 0) {
      b -= deleted;
      const end = Math.min(b + afterLength, content.length);
      const n = end - b;
      if (b >= 0 && n > 0) content.delete(b, end);
    }
    return true;
  }
}
