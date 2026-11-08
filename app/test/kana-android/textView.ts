/**
 * Test-side emulation of an Android `EditText` fed by a hardware keyboard and the clipboard, enough to
 * replay `kana/fixup-keys.json` and the field part of `kana/keys-session.json`. Ported from AOSP
 * (API 36): `View.dispatchKeyEvent`, `TextView.onKeyDown/doKeyDown/onKeyUp/onKeyMultiple/
 * onKeyShortcut/onTextContextMenuItem/onEditorAction`, `QwertyKeyListener`, `BaseKeyListener`,
 * `MetaKeyKeyListener` (chorded modifiers), `ArrowKeyMovementMethod`, `Selection`,
 * `TextViewOnReceiveContentListener`, `KeyCharacterMap.VIRTUAL_KEYBOARD` (US layout).
 *
 * Simplifications, all fine for single-line kana/ASCII text: cursor and delete steps are one code
 * point (Android uses grapheme clusters and an emoji-aware backspace state machine); words come from
 * `Intl.Segmenter` (ICU, like Android's `WordIterator`); HTML clips are converted by dropping tags;
 * undo/redo follow `Editor.UndoInputFilter` for non-composing edits (`undo.ts`).
 */
import { FixupWatcher, handleEditorAction, isEnterKey, swallowFocusKey, type KeyEventLike } from '../../src/core/kana/answerField';
import { SELECTION_END, type SpanEditable } from '../../src/core/kana/spanEditable';
import { SimEditText, SimInputConnection } from './editText';
import { SimUndo } from './undo';

export type Meta = 'shift' | 'ctrl' | 'alt' | 'capsLock';

export interface SimKeyEvent extends KeyEventLike {
  repeat: number;
  meta: ReadonlySet<Meta>;
  /** `ACTION_MULTIPLE` text (`KEYCODE_UNKNOWN`). */
  characters?: string;
}

export interface EditorActionCall {
  actionId: number;
  event: 'down' | 'up' | 'other' | null;
  keyCode: string | null;
  returned: boolean;
}

/** One clipboard item: plain text and, for `newHtmlText`, its HTML. */
export interface ClipItem {
  text: string;
  html?: string;
}

/** The shared primary clip (the device clipboard outlives a test case). */
export class SimClipboard {
  items: ClipItem[] | null = null;

  /** `clipText()` of the golden test: the items' plain text joined by newlines. */
  text(): string | null {
    return this.items === null ? null : this.items.map((i) => i.text).join('\n');
  }
}

const MODIFIER_KEYS = new Set(['SHIFT_LEFT', 'SHIFT_RIGHT', 'CTRL_LEFT', 'CTRL_RIGHT', 'ALT_LEFT', 'ALT_RIGHT',
  'META_LEFT', 'META_RIGHT', 'SYM', 'FUNCTION', 'CAPS_LOCK']);
const DIRECTIONAL_KEYS = new Set(['DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT']);
const CONFIRM_KEYS = new Set(['DPAD_CENTER', 'ENTER', 'SPACE', 'NUMPAD_ENTER']);

/** `Selection.extendSelection` moves only `SELECTION_END`, a point-point span. */
const POINT_POINT_ANCHORS = { startAnchor: 'point', endAnchor: 'point' } as const;

const IME_ACTION_DONE = 6;
const IME_ACTION_NEXT = 5;
const IME_ACTION_PREVIOUS = 7;

export const isModifierKey = (keyCode: string): boolean => MODIFIER_KEYS.has(keyCode);

function hasNoModifiers(e: SimKeyEvent): boolean {
  return !e.meta.has('shift') && !e.meta.has('ctrl') && !e.meta.has('alt');
}

function hasOnly(e: SimKeyEvent, ...mods: Meta[]): boolean {
  const pressed = (['shift', 'ctrl', 'alt'] as const).filter((m) => e.meta.has(m));
  return pressed.length === mods.length && mods.every((m) => e.meta.has(m));
}

/** The virtual full keyboard's character for a key (`KeyEvent.getUnicodeChar`), or 0. */
export function unicodeChar(keyCode: string, meta: ReadonlySet<Meta>): string | null {
  if (meta.has('ctrl') || meta.has('alt')) return null;
  if (/^[A-Z]$/.test(keyCode)) {
    const upper = meta.has('shift') !== meta.has('capsLock');
    return upper ? keyCode : keyCode.toLowerCase();
  }
  if (/^[0-9]$/.test(keyCode) && !meta.has('shift')) return keyCode;
  const base: Record<string, string> = { SPACE: ' ', APOSTROPHE: "'", MINUS: '-', ENTER: '\n', NUMPAD_ENTER: '\n' };
  const shifted: Record<string, string> = { SPACE: ' ', APOSTROPHE: '"', MINUS: '_', ENTER: '\n', NUMPAD_ENTER: '\n' };
  return (meta.has('shift') ? shifted : base)[keyCode] ?? null;
}

/** `KeyCharacterMap.getEvents(chars)` for the virtual keyboard: shift around capitals. */
export function eventsForText(text: string, capsLock = false): SimKeyEvent[] {
  const events: SimKeyEvent[] = [];
  const extra: Meta[] = capsLock ? ['capsLock'] : [];
  for (const ch of text) {
    let keyCode: string;
    let shift = false;
    if (/^[a-z]$/.test(ch)) keyCode = ch.toUpperCase();
    else if (/^[A-Z]$/.test(ch)) { keyCode = ch; shift = true; }
    else if (/^[0-9]$/.test(ch)) keyCode = ch;
    else {
      const keys: Record<string, string> = { ' ': 'SPACE', "'": 'APOSTROPHE', '-': 'MINUS' };
      const k = keys[ch];
      if (k === undefined) throw new Error(`no key for ${JSON.stringify(ch)}`);
      keyCode = k;
    }
    const meta = new Set<Meta>([...extra, ...(shift ? ['shift' as const] : [])]);
    if (shift) events.push({ action: 'down', keyCode: 'SHIFT_LEFT', repeat: 0, meta });
    events.push({ action: 'down', keyCode, repeat: 0, meta });
    events.push({ action: 'up', keyCode, repeat: 0, meta });
    if (shift) events.push({ action: 'up', keyCode: 'SHIFT_LEFT', repeat: 0, meta: new Set(extra) });
  }
  return events;
}

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

/** One cursor step left (a surrogate pair is one step). */
function offsetLeftOf(text: string, offset: number): number {
  if (offset <= 0) return 0;
  if (offset >= 2 && isLow(text.charCodeAt(offset - 1)) && isHigh(text.charCodeAt(offset - 2))) return offset - 2;
  return offset - 1;
}

function offsetRightOf(text: string, offset: number): number {
  if (offset >= text.length) return text.length;
  if (offset + 1 < text.length && isHigh(text.charCodeAt(offset)) && isLow(text.charCodeAt(offset + 1))) return offset + 2;
  return offset + 1;
}

/** `Character.isLetterOrDigit` at a code point (Unicode letters and decimal digits). */
function isLetterOrDigitAt(text: string, offset: number): boolean {
  const cp = text.codePointAt(offset);
  return cp !== undefined && /[\p{L}\p{Nd}]/u.test(String.fromCodePoint(cp));
}

function isAfterLetterOrDigit(text: string, offset: number): boolean {
  if (offset < 1) return false;
  const before = offset >= 2 && isLow(text.charCodeAt(offset - 1)) && isHigh(text.charCodeAt(offset - 2)) ? offset - 2 : offset - 1;
  return isLetterOrDigitAt(text, before);
}

/** ICU word boundaries of `text` (segment starts plus the end). */
function wordBoundaries(text: string): number[] {
  const b = [...new Intl.Segmenter('en-US', { granularity: 'word' }).segment(text)].map((s) => s.index);
  b.push(text.length);
  return [...new Set(b)].sort((x, y) => x - y);
}

/** `WordIterator.preceding`: the previous boundary on a letter or digit, or −1. */
function wordPreceding(text: string, offset: number): number {
  const boundaries = wordBoundaries(text);
  for (let i = boundaries.length - 1; i >= 0; i--) {
    const b = boundaries[i] as number;
    if (b < offset && b < text.length && isLetterOrDigitAt(text, b)) return b;
  }
  return -1;
}

/** `WordIterator.following`: the next boundary after a letter or digit, or −1. */
function wordFollowing(text: string, offset: number): number {
  for (const b of wordBoundaries(text)) {
    if (b > offset && isAfterLetterOrDigit(text, b)) return b;
  }
  return -1;
}

/** `Html.fromHtml` for the inline markup the fixtures use: the text without tags. */
function htmlToText(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * A focused, laid-out single-line EditText with the app's watcher, the fragment's OnKeyListener and
 * an editor-action listener.
 */
export class SimKeyField {
  readonly edit: SimEditText;
  readonly conn: SimInputConnection;
  readonly undo = new SimUndo();
  /** `MetaKeyKeyListener` state of shift and alt in the Editable (chorded: pressed → used → removed). */
  private shift: 'none' | 'pressed' | 'used' = 'none';
  private alt: 'none' | 'pressed' | 'used' = 'none';
  private preventDefaultMovement = false;
  /** Editor-action listener calls (the app's `handleEditorAction`). */
  readonly actions: EditorActionCall[] = [];
  /** An `onEditorAction` the listener refused queues a soft-keyboard Enter (delivered by the caller). */
  pendingImeEnter = false;

  constructor(
    readonly clipboard: SimClipboard,
    /** The editor-action listener; returns whether it consumed the action. */
    private readonly onEditorAction: (actionId: number, event: SimKeyEvent | null) => boolean,
    /** The text watcher (default: the app's, active, reading question). */
    watcher: FixupWatcher = new FixupWatcher(() => true, () => true),
  ) {
    this.edit = new SimEditText(watcher);
    this.conn = new SimInputConnection(this.edit);
    this.edit.filters.push(this.undo.filter);
    this.edit.text.filters.push(this.undo.filter);
  }

  get text(): SpanEditable {
    return this.edit.text;
  }

  // ---- dispatch

  /** As the golden test's `dispatch`: `dispatchKeyEvent`, then the ctrl shortcut fallback. */
  dispatch(e: SimKeyEvent): boolean {
    if (this.dispatchKeyEvent(e)) return true;
    if (e.action === 'down' && e.meta.has('ctrl') && e.repeat === 0 && !isModifierKey(e.keyCode)) {
      return this.onKeyShortcut(e);
    }
    return false;
  }

  /** `View.dispatchKeyEvent`: the OnKeyListener (`swallowFocusKey`) first, then the TextView. */
  dispatchKeyEvent(e: SimKeyEvent): boolean {
    if (swallowFocusKey(e)) return true;
    if (e.action === 'down') return this.onKeyDown(e);
    if (e.action === 'up') return this.onKeyUp(e);
    return this.onKeyMultiple(e);
  }

  private onKeyDown(e: SimKeyEvent): boolean {
    const which = this.doKeyDown(e, null);
    if (which === 'notHandled') return this.viewOnKeyDown(e);
    return true;
  }

  /** `View.onKeyDown`: a confirm key on a clickable view is consumed (pressed state). */
  private viewOnKeyDown(e: SimKeyEvent): boolean {
    return CONFIRM_KEYS.has(e.keyCode) && hasNoModifiers(e) && e.repeat === 0;
  }

  private doKeyDown(e: SimKeyEvent, other: SimKeyEvent | null): 'handled' | 'notHandled' {
    if (e.repeat === 0 && !isModifierKey(e.keyCode)) this.preventDefaultMovement = false;
    switch (e.keyCode) {
      case 'ENTER':
      case 'NUMPAD_ENTER':
        if (hasNoModifiers(e)) {
          if (this.callEditorAction(0, e)) return 'handled';
          // shouldAdvanceFocusOnEnter(): single line, no click listener
          return 'handled';
        }
        break;
      case 'DPAD_CENTER':
        if (hasNoModifiers(e)) return 'notHandled';
        break;
      case 'FORWARD_DEL':
        if (hasOnly(e, 'shift') && this.canCut()) {
          if (this.onTextContextMenuItem('cut')) return 'handled';
        }
        break;
      default:
        break;
    }
    if (other !== null) {
      return this.batch(() => this.keyListenerOnKeyOther(other)) ? 'handled' : 'notHandled';
    }
    if (this.batch(() => this.keyListenerOnKeyDown(e))) return 'handled';
    if (this.movementOnKeyDown(e)) {
      if (e.repeat === 0 && !isModifierKey(e.keyCode)) this.preventDefaultMovement = true;
      return 'handled';
    }
    // Consume arrows from keyboard devices to prevent focus leaving the editor.
    if (DIRECTIONAL_KEYS.has(e.keyCode)) return 'handled';
    return this.preventDefaultMovement && !isModifierKey(e.keyCode) ? 'handled' : 'notHandled';
  }

  /** `TextView.beginBatchEdit/endBatchEdit` around the key listener: the undo filter's user edit. */
  private batch(f: () => boolean): boolean {
    this.undo.beginBatchEdit();
    try {
      return f();
    } finally {
      this.undo.endBatchEdit();
    }
  }

  private onKeyUp(e: SimKeyEvent): boolean {
    if (!isModifierKey(e.keyCode)) this.preventDefaultMovement = false;
    if (e.keyCode === 'DPAD_CENTER' && hasNoModifiers(e)) return false; // View.onKeyUp: performClick, no listener
    if (this.metaKeyOnKeyUp(e)) return true;
    return false;
  }

  private onKeyMultiple(e: SimKeyEvent): boolean {
    const down: SimKeyEvent = { ...e, action: 'down' };
    return this.doKeyDown(down, e) === 'handled';
  }

  /** `TextView.onKeyShortcut`. */
  onKeyShortcut(e: SimKeyEvent): boolean {
    if (hasOnly(e, 'ctrl')) {
      switch (e.keyCode) {
        case 'A': return this.canSelectText() ? this.onTextContextMenuItem('selectAll') : false;
        case 'Z': return this.canUndo() ? this.onTextContextMenuItem('undo') : false;
        case 'X': return this.canCut() ? this.onTextContextMenuItem('cut') : false;
        case 'C': return this.canCopy() ? this.onTextContextMenuItem('copy') : false;
        case 'V': return this.canPaste() ? this.onTextContextMenuItem('paste') : false;
        case 'Y': return this.canRedo() ? this.onTextContextMenuItem('redo') : false;
        default: return false;
      }
    }
    if (hasOnly(e, 'ctrl', 'shift')) {
      switch (e.keyCode) {
        case 'Z': return this.canRedo() ? this.onTextContextMenuItem('redo') : false;
        case 'V': return this.canPaste() ? this.onTextContextMenuItem('pasteAsPlainText') : false;
        default: return false;
      }
    }
    return false;
  }

  // ---- editor actions

  private callEditorAction(actionId: number, e: SimKeyEvent | null): boolean {
    const returned = this.onEditorAction(actionId, e);
    this.actions.push({
      actionId,
      event: e === null ? null : e.action === 'down' ? 'down' : e.action === 'up' ? 'up' : 'other',
      keyCode: e === null ? null : `KEYCODE_${e.keyCode}`,
      returned,
    });
    return returned;
  }

  /**
   * `EditableInputConnection.performEditorAction` → `TextView.onEditorAction(actionCode)`: the
   * listener first; if it refuses, NEXT/PREVIOUS/DONE have default handling, any other action is
   * turned into a soft-keyboard Enter press (posted, so the caller delivers it).
   */
  performEditorAction(actionId: number): boolean {
    if (this.callEditorAction(actionId, null)) return true;
    if (actionId !== IME_ACTION_NEXT && actionId !== IME_ACTION_PREVIOUS && actionId !== IME_ACTION_DONE) {
      this.pendingImeEnter = true;
    }
    return true;
  }

  // ---- QwertyKeyListener / BaseKeyListener / MetaKeyKeyListener

  private keyListenerOnKeyDown(e: SimKeyEvent): boolean {
    const s = this.text;
    let selStart = Math.min(s.selectionStart, s.selectionEnd);
    let selEnd = Math.max(s.selectionStart, s.selectionEnd);
    if (selStart < 0 || selEnd < 0) {
      selStart = selEnd = 0;
      s.setSelection(0, 0);
    }
    const ch = unicodeChar(e.keyCode, e.meta);
    if (ch !== null) {
      if (selStart !== selEnd) s.setSelection(selEnd);
      s.replace(selStart, selEnd, ch);
      this.adjustMetaAfterKeypress();
      return true;
    }
    let handled = false;
    if (e.keyCode === 'DEL') handled = this.backspaceOrForwardDelete(e, false);
    else if (e.keyCode === 'FORWARD_DEL') handled = this.backspaceOrForwardDelete(e, true);
    if (handled) {
      this.adjustMetaAfterKeypress();
      return true;
    }
    return this.metaKeyOnKeyDown(e);
  }

  /** `BaseKeyListener.onKeyOther`: `ACTION_MULTIPLE` text replaces the selection. */
  private keyListenerOnKeyOther(e: SimKeyEvent): boolean {
    if (e.action !== 'multiple' || e.keyCode !== 'UNKNOWN' || e.characters === undefined) return false;
    const s = this.text;
    const a = Math.min(s.selectionStart, s.selectionEnd);
    const b = Math.max(s.selectionStart, s.selectionEnd);
    s.replace(a, b, e.characters);
    return true;
  }

  private metaKeyOnKeyDown(e: SimKeyEvent): boolean {
    if (e.keyCode === 'SHIFT_LEFT' || e.keyCode === 'SHIFT_RIGHT') {
      if (this.shift === 'none') this.shift = 'pressed';
      return true;
    }
    if (e.keyCode === 'ALT_LEFT' || e.keyCode === 'ALT_RIGHT') {
      if (this.alt === 'none') this.alt = 'pressed';
      return true;
    }
    return false;
  }

  private metaKeyOnKeyUp(e: SimKeyEvent): boolean {
    if (e.keyCode === 'SHIFT_LEFT' || e.keyCode === 'SHIFT_RIGHT') {
      this.shift = 'none';
      return true;
    }
    if (e.keyCode === 'ALT_LEFT' || e.keyCode === 'ALT_RIGHT') {
      this.alt = 'none';
      return true;
    }
    return false;
  }

  private adjustMetaAfterKeypress(): void {
    if (this.shift === 'pressed') this.shift = 'used';
    if (this.alt === 'pressed') this.alt = 'used';
  }

  private get selecting(): boolean {
    return this.shift !== 'none';
  }

  /** `BaseKeyListener.backspaceOrForwardDelete`. */
  private backspaceOrForwardDelete(e: SimKeyEvent, forward: boolean): boolean {
    const s = this.text;
    if (s.selectionStart !== s.selectionEnd) {
      s.delete(Math.min(s.selectionStart, s.selectionEnd), Math.max(s.selectionStart, s.selectionEnd));
      return true;
    }
    const shiftActive = e.meta.has('shift') || this.shift !== 'none';
    const altActive = e.meta.has('alt') || this.alt !== 'none';
    if (e.meta.has('ctrl')) {
      if (altActive || shiftActive) return false;
      return this.deleteUntilWordBoundary(forward);
    }
    if (altActive && this.deleteLineFromCursor(forward)) return true;
    const start = s.selectionEnd;
    const text = s.toString();
    const end = forward ? offsetRightOf(text, start) : offsetLeftOf(text, start);
    if (start !== end) {
      s.delete(Math.min(start, end), Math.max(start, end));
      return true;
    }
    return false;
  }

  private deleteUntilWordBoundary(forward: boolean): boolean {
    const s = this.text;
    const cursor = s.selectionStart;
    if (cursor !== s.selectionEnd) return false;
    if ((!forward && cursor === 0) || (forward && cursor === s.length)) return false;
    const text = s.toString();
    if (forward) {
      let to = wordFollowing(text, cursor);
      if (to === -1) to = text.length;
      s.delete(cursor, to);
    } else {
      let from = wordPreceding(text, cursor);
      if (from === -1) from = 0;
      s.delete(from, cursor);
    }
    return true;
  }

  /** `deleteLineFromCursor` on a single-line layout: to the line start (or end). */
  private deleteLineFromCursor(forward: boolean): boolean {
    const s = this.text;
    const start = Math.min(s.selectionStart, s.selectionEnd);
    const end = Math.max(s.selectionStart, s.selectionEnd);
    const from = forward ? start : 0;
    const to = forward ? s.length : end;
    if (from === to) return false;
    s.delete(from, to);
    return true;
  }

  // ---- ArrowKeyMovementMethod / Selection

  private movementOnKeyDown(e: SimKeyEvent): boolean {
    const mods = (['ctrl', 'alt'] as const).filter((m) => e.meta.has(m));
    const none = mods.length === 0;
    const only = (m: 'ctrl' | 'alt'): boolean => mods.length === 1 && mods[0] === m;
    let handled = false;
    switch (e.keyCode) {
      case 'DPAD_LEFT':
        if (none) handled = this.left();
        else if (only('ctrl')) handled = this.leftWord();
        else if (only('alt')) handled = this.lineEdge(-1);
        break;
      case 'DPAD_RIGHT':
        if (none) handled = this.right();
        else if (only('ctrl')) handled = this.rightWord();
        else if (only('alt')) handled = this.lineEdge(1);
        break;
      case 'DPAD_UP':
        if (none) handled = this.upDown(-1);
        else if (only('alt')) handled = this.lineEdge(-1);
        break;
      case 'DPAD_DOWN':
        if (none) handled = this.upDown(1);
        else if (only('alt')) handled = this.lineEdge(1);
        break;
      case 'MOVE_HOME':
        if (none || only('ctrl')) handled = this.lineEdge(-1);
        break;
      case 'MOVE_END':
        if (none || only('ctrl')) handled = this.lineEdge(1);
        break;
      default:
        break;
    }
    if (handled) this.adjustMetaAfterKeypress();
    return handled;
  }

  private left(): boolean {
    const s = this.text;
    if (this.selecting) {
      const to = offsetLeftOf(s.toString(), s.selectionEnd);
      if (to !== s.selectionEnd) s.setSpan(SELECTION_END, to, to, POINT_POINT_ANCHORS);
      return true;
    }
    if (s.selectionStart !== s.selectionEnd) {
      s.setSelection(Math.min(s.selectionStart, s.selectionEnd));
      return true;
    }
    const to = offsetLeftOf(s.toString(), s.selectionEnd);
    if (to !== s.selectionEnd) {
      s.setSelection(to);
      return true;
    }
    return false;
  }

  private right(): boolean {
    const s = this.text;
    if (this.selecting) {
      const to = offsetRightOf(s.toString(), s.selectionEnd);
      if (to !== s.selectionEnd) s.setSpan(SELECTION_END, to, to, POINT_POINT_ANCHORS);
      return true;
    }
    if (s.selectionStart !== s.selectionEnd) {
      s.setSelection(Math.max(s.selectionStart, s.selectionEnd));
      return true;
    }
    const to = offsetRightOf(s.toString(), s.selectionEnd);
    if (to !== s.selectionEnd) {
      s.setSelection(to);
      return true;
    }
    return false;
  }

  /** `Selection.moveUp/moveDown` (and extend) on a single line: to the start or end of the text. */
  private upDown(direction: -1 | 1): boolean {
    const s = this.text;
    const edge = direction < 0 ? 0 : s.length;
    if (this.selecting) {
      if (s.selectionEnd !== edge) s.setSpan(SELECTION_END, edge, edge, POINT_POINT_ANCHORS);
      return true;
    }
    const start = s.selectionStart;
    const end = s.selectionEnd;
    if (start !== end) {
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      s.setSelection(direction < 0 ? min : max);
      return !(min === 0 && max === s.length);
    }
    if (end !== edge) {
      s.setSelection(edge);
      return true;
    }
    return false;
  }

  private lineEdge(direction: -1 | 1): boolean {
    const s = this.text;
    const edge = direction < 0 ? 0 : s.length;
    if (this.selecting) s.setSpan(SELECTION_END, edge, edge, POINT_POINT_ANCHORS);
    else s.setSelection(edge);
    return true;
  }

  private leftWord(): boolean {
    const s = this.text;
    const to = wordPreceding(s.toString(), s.selectionEnd);
    if (to !== -1) {
      if (this.selecting) s.setSpan(SELECTION_END, to, to, POINT_POINT_ANCHORS);
      else s.setSelection(to);
    }
    return true;
  }

  private rightWord(): boolean {
    const s = this.text;
    const to = wordFollowing(s.toString(), s.selectionEnd);
    if (to !== -1) {
      if (this.selecting) s.setSpan(SELECTION_END, to, to, POINT_POINT_ANCHORS);
      else s.setSelection(to);
    }
    return true;
  }

  // ---- context menu (cut, copy, paste, select all)

  private hasSelection(): boolean {
    const s = this.text;
    return s.selectionStart >= 0 && s.selectionStart !== s.selectionEnd;
  }

  canSelectText(): boolean {
    return this.text.length !== 0;
  }

  canCut(): boolean {
    return this.text.length > 0 && this.hasSelection();
  }

  canCopy(): boolean {
    return this.text.length > 0 && this.hasSelection();
  }

  canPaste(): boolean {
    return this.text.selectionStart >= 0 && this.text.selectionEnd >= 0 && this.clipboard.items !== null;
  }

  canUndo(): boolean {
    return this.undo.canUndo();
  }

  canRedo(): boolean {
    return this.undo.canRedo();
  }

  /** `TextView.onTextContextMenuItem` for the focused field. */
  onTextContextMenuItem(id: 'paste' | 'pasteAsPlainText' | 'cut' | 'copy' | 'selectAll' | 'undo' | 'redo'): boolean {
    const s = this.text;
    const min = Math.max(0, Math.min(s.selectionStart, s.selectionEnd));
    const max = Math.max(0, Math.max(s.selectionStart, s.selectionEnd));
    switch (id) {
      case 'paste':
        this.paste(true);
        return true;
      case 'pasteAsPlainText':
        this.paste(false);
        return true;
      case 'cut':
        this.clipboard.items = [{ text: s.substring(min, max) }];
        s.delete(min, max);
        return true;
      case 'copy':
        this.clipboard.items = [{ text: s.substring(min, max) }];
        return true;
      case 'selectAll':
        s.setSelection(0, s.length);
        return true;
      case 'undo':
        this.undo.undo(s);
        return true;
      case 'redo':
        this.undo.redo(s);
        return true;
    }
  }

  /** `TextView.paste` → `TextViewOnReceiveContentListener.onReceiveContent`. */
  private paste(withFormatting: boolean): void {
    const items = this.clipboard.items;
    if (items === null) return;
    const s = this.text;
    let didFirst = false;
    for (const item of items) {
      const text = withFormatting && item.html !== undefined ? htmlToText(item.html) : item.text;
      if (!didFirst) {
        const start = Math.max(0, Math.min(s.selectionStart, s.selectionEnd));
        const end = Math.max(0, Math.max(s.selectionStart, s.selectionEnd));
        s.setSelection(end);
        s.replace(start, end, text);
        didFirst = true;
      } else {
        s.insert(s.selectionEnd, '\n');
        s.insert(s.selectionEnd, text);
      }
    }
  }
}

/** A field whose editor-action listener is the app's `handleEditorAction` with fixed fragment state. */
export function appEditorActionListener(state: () => { active: boolean; interactionEnabled: boolean; answered: boolean },
  onSubmit: (text: string) => void, field: () => SimKeyField): (actionId: number, e: SimKeyEvent | null) => boolean {
  return (actionId, e) => {
    const r = handleEditorAction(actionId, e, state());
    if (r.submit) onSubmit(field().text.toString());
    return r.handled;
  };
}

export { isEnterKey };
