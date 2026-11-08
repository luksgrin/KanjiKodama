/**
 * The text of the answer field as Android keeps it: Android's `SpannableStringBuilder` reduced to
 * what the answer field's behaviour depends on. Text watchers run synchronously inside every
 * `replace`, so a watcher that edits the text (the app's `PseudoIme.fixup` watcher) runs again,
 * nested, for its own edits, and the selection and composing region move with each edit by
 * Android's span rules. `answerField.ts` builds the app's field on top of it.
 *
 * Positions are UTF-16 units. Ported from AOSP `android.text.SpannableStringBuilder` (`replace`,
 * `change`, `updatedIntervalBound`, `moveGapTo`) and `android.text.Selection`, in logical
 * coordinates (no gap buffer).
 */
import type { Editable } from './pseudoIme';
import { JavaException } from './javaException';

/**
 * How a span end moves when text is inserted exactly at it: a `point` sticks to the text after it
 * (moves right), a `mark` to the text before it (stays).
 */
export type Anchor = 'point' | 'mark';

export interface Span {
  start: number;
  end: number;
  startAnchor: Anchor;
  endAnchor: Anchor;
}

/** `Selection.SELECTION_START` / `SELECTION_END`: zero-length `SPAN_POINT_POINT` spans. */
export const SELECTION_START: object = Object.freeze({ span: 'SELECTION_START' });
export const SELECTION_END: object = Object.freeze({ span: 'SELECTION_END' });
/** `BaseInputConnection.COMPOSING`: the IME's composing region, `SPAN_EXCLUSIVE_EXCLUSIVE`. */
export const COMPOSING: object = Object.freeze({ span: 'COMPOSING' });

/** `SPAN_EXCLUSIVE_EXCLUSIVE` (point start, mark end): Android's flags for the composing region. */
export const EXCLUSIVE_EXCLUSIVE = { startAnchor: 'point', endAnchor: 'mark' } as const;
/** `SPAN_POINT_POINT`: the selection ends. */
export const POINT_POINT = { startAnchor: 'point', endAnchor: 'point' } as const;

/** Android's `TextWatcher` (the before-change callback is never used here). */
export interface TextWatcher {
  onTextChanged(s: SpanEditable, start: number, before: number, count: number): void;
  afterTextChanged(s: SpanEditable): void;
}

/** Text with spans to insert (`replace` copies its spans, as Android does for a `Spanned`). */
export interface SpannedText {
  text: string;
  spans: ReadonlyMap<object, Span>;
}

export class SpanEditable implements Editable {
  private value: string;
  private readonly spans = new Map<object, Span>();
  readonly watchers: TextWatcher[] = [];
  /**
   * Called at the start of every `replace` with the range and the new text (where Android runs the
   * Editable's input filters; the field's undo filter records edits there).
   */
  readonly filters: ((s: SpanEditable, start: number, end: number, text: string) => void)[] = [];
  /** How many watcher callbacks are running (Android's `getTextWatcherDepth`). */
  textWatcherDepth = 0;

  constructor(value = '') {
    this.value = value;
  }

  get length(): number {
    return this.value.length;
  }

  toString(): string {
    return this.value;
  }

  /** `SpannableStringBuilder.charAt`: throws `IndexOutOfBoundsException` like Android. */
  charAt(index: number): string {
    if (index < 0) throw new JavaException('IndexOutOfBoundsException', `charAt: ${index} < 0`);
    if (index >= this.value.length) {
      throw new JavaException('IndexOutOfBoundsException', `charAt: ${index} >= length ${this.value.length}`);
    }
    return this.value.charAt(index);
  }

  substring(start: number, end: number): string {
    return this.value.substring(start, end);
  }

  // ---- spans

  getSpan(what: object): Span | undefined {
    return this.spans.get(what);
  }

  /** `getSpanStart`: −1 when the span is not set. */
  getSpanStart(what: object): number {
    return this.spans.get(what)?.start ?? -1;
  }

  getSpanEnd(what: object): number {
    return this.spans.get(what)?.end ?? -1;
  }

  setSpan(what: object, start: number, end: number, anchors: Pick<Span, 'startAnchor' | 'endAnchor'>): void {
    this.spans.set(what, { start, end, startAnchor: anchors.startAnchor, endAnchor: anchors.endAnchor });
  }

  removeSpan(what: object): void {
    this.spans.delete(what);
  }

  // ---- selection (android.text.Selection)

  get selectionStart(): number {
    return this.getSpanStart(SELECTION_START);
  }

  get selectionEnd(): number {
    return this.getSpanStart(SELECTION_END);
  }

  /** `Selection.setSelection(text, start, stop)`. */
  setSelection(start: number, stop: number = start): void {
    this.setSpan(SELECTION_START, start, start, POINT_POINT);
    this.setSpan(SELECTION_END, stop, stop, POINT_POINT);
  }

  // ---- editing

  insert(where: number, text: string | SpannedText): void {
    this.replace(where, where, text);
  }

  delete(start: number, end: number): void {
    this.replace(start, end, '');
  }

  /**
   * `SpannableStringBuilder.replace(start, end, text)`: filters, the edit with its span updates,
   * the selection kept at the same relative position inside a replaced range, then the watchers
   * (`onTextChanged` for all, then `afterTextChanged` for all), which may edit again (nested).
   */
  replace(start: number, end: number, replacement: string | SpannedText): void {
    if (start < 0 || end < start || end > this.value.length) {
      throw new JavaException('IndexOutOfBoundsException', `replace (${start} ... ${end}) has end before start or is out of bounds (length ${this.value.length})`);
    }
    const text = typeof replacement === 'string' ? replacement : replacement.text;
    for (const filter of this.filters) filter(this, start, end, text);

    const origLen = end - start;
    const newLen = text.length;
    if (origLen === 0 && newLen === 0 && !hasNonExclusiveExclusiveSpanAt(replacement)) return;

    const watchers = [...this.watchers];

    const adjustSelection = origLen !== 0 && newLen !== 0;
    const selStart = this.selectionStart;
    const selEnd = this.selectionEnd;

    this.change(start, end, replacement);

    if (adjustSelection) {
      if (selStart > start && selStart < end) {
        const s = start + Math.trunc(((selStart - start) * newLen) / origLen);
        this.setSpan(SELECTION_START, s, s, POINT_POINT);
      }
      if (selEnd > start && selEnd < end) {
        const s = start + Math.trunc(((selEnd - start) * newLen) / origLen);
        this.setSpan(SELECTION_END, s, s, POINT_POINT);
      }
    }

    for (const w of watchers) {
      this.textWatcherDepth++;
      try {
        w.onTextChanged(this, start, origLen, newLen);
      } finally {
        this.textWatcherDepth--;
      }
    }
    for (const w of watchers) {
      this.textWatcherDepth++;
      try {
        w.afterTextChanged(this);
      } finally {
        this.textWatcherDepth--;
      }
    }
  }

  /** `SpannableStringBuilder.change`: the text edit and the span bounds. */
  private change(start: number, end: number, replacement: string | SpannedText): void {
    const text = typeof replacement === 'string' ? replacement : replacement.text;
    const replacedLength = end - start;
    const newLen = text.length;
    const delta = newLen - replacedLength;
    const textIsRemoved = newLen === 0;

    if (replacedLength > 0) {
      // Exclusive-exclusive spans inside the replaced range that would become empty are removed.
      for (const [what, span] of [...this.spans]) {
        if (span.startAnchor !== 'point' || span.endAnchor !== 'mark') continue;
        const startInside = span.start >= start && span.start < end;
        const endInside = span.end >= start && span.end <= end;
        if (startInside && endInside && (textIsRemoved || span.start > start || span.end < end)) {
          this.spans.delete(what);
        }
      }
    }

    this.value = this.value.substring(0, start) + text + this.value.substring(end);

    for (const span of this.spans.values()) {
      span.start = movedBound(span.start, span.startAnchor, start, end, newLen, delta, textIsRemoved);
      span.end = movedBound(span.end, span.endAnchor, start, end, newLen, delta, textIsRemoved);
    }

    if (typeof replacement !== 'string') {
      for (const [what, span] of replacement.spans) {
        if (this.spans.has(what)) continue;
        const st = Math.max(span.start, 0);
        const en = Math.min(span.end, newLen);
        this.spans.set(what, { start: st + start, end: en + start, startAnchor: span.startAnchor, endAnchor: span.endAnchor });
      }
    }
  }
}

/**
 * Where one span bound ends up after `[start, end)` is replaced by `newLen` chars (logical form of
 * `moveGapTo` + `updatedIntervalBound`). Before the range: unchanged; after it: shifted. Inside:
 * - insertion (empty range): a point at `start` moves after the new text, a mark stays;
 * - otherwise a bound at `start` stays (unless the text is removed, then everything goes to
 *   `start`), a point further in moves to the end of the new text, a mark inside moves to `start`
 *   and a mark at `end` to the end of the new text.
 */
function movedBound(offset: number, anchor: Anchor, start: number, end: number, newLen: number, delta: number,
  textIsRemoved: boolean): number {
  if (offset < start) return offset;
  if (offset > end) return offset + delta;
  if (start === end) return anchor === 'point' ? start + newLen : start;
  if (anchor === 'point') return textIsRemoved || offset > start ? start + newLen : offset;
  if (textIsRemoved || offset < end) return start;
  return start + newLen;
}

/** `hasNonExclusiveExclusiveSpanAt(text, 0)`: an empty insert still notifies when it carries such a span. */
function hasNonExclusiveExclusiveSpanAt(replacement: string | SpannedText): boolean {
  if (typeof replacement === 'string') return false;
  for (const span of replacement.spans.values()) {
    if (span.start <= 0 && span.end >= 0 && !(span.startAnchor === 'point' && span.endAnchor === 'mark')) return true;
  }
  return false;
}
