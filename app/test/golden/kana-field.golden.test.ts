/**
 * The answer field (Tier B kana fixtures): the app's fixup watcher on Android's editable, driven the
 * way the device tests drove it. See test/kana-android for the emulated Android side.
 */
import { DummyEditable, fixup, JavaException } from '../../src/core/kana';
import { COMPOSING } from '../../src/core/kana/spanEditable';
import { SimEditText, SimInputConnection } from '../kana-android/editText';
import {
  appEditorActionListener, eventsForText, SimClipboard, SimKeyField, type ClipItem, type Meta, type SimKeyEvent,
} from '../kana-android/textView';
import { SimSessionScreen, StubSession } from '../kana-android/sessionScreen';
import { goldenSuite } from './harness';

type Edit =
  | { insert: string; at: number }
  | { backspace: true }
  | { deleteAt: number }
  | { replace: [number, number]; text: string }
  | { setText: string }
  | { compose: string }
  | { finishComposing: true };

const clampAt = (at: number, length: number): number => (at < 0 ? length : Math.min(at, length));

/** `FixupEditTextGoldenTest.runEditText`: through the InputConnection (`ic`) or direct Editable calls. */
function runEditText(edits: Edit[], ic: boolean): Record<string, unknown>[] {
  const edit = new SimEditText();
  edit.text.setSelection(0);
  const conn = new SimInputConnection(edit);
  return edits.map((e) => {
    edit.watcher.calls = 0;
    edit.watcher.maxDepth = 0;
    const s = edit.text;
    let applied = true;
    if ('insert' in e) {
      const at = clampAt(e.at, s.length);
      if (ic) {
        s.setSelection(at);
        conn.commitText(e.insert, 1);
      } else {
        s.insert(at, e.insert);
      }
    } else if ('backspace' in e) {
      if (s.length > 0) {
        if (ic) {
          s.setSelection(s.length);
          conn.deleteSurroundingText(1, 0);
        } else {
          s.delete(s.length - 1, s.length);
        }
      }
    } else if ('deleteAt' in e) {
      const at = Math.min(e.deleteAt, s.length);
      if (at > 0) {
        if (ic) {
          s.setSelection(at);
          conn.deleteSurroundingText(1, 0);
        } else {
          s.delete(at - 1, at);
        }
      }
    } else if ('replace' in e) {
      const a = Math.min(e.replace[0], s.length);
      const b = Math.min(e.replace[1], s.length);
      if (ic) {
        s.setSelection(a, b);
        conn.commitText(e.text, 1);
      } else {
        s.replace(a, b, e.text);
      }
    } else if ('setText' in e) {
      edit.setText(e.setText);
    } else if ('compose' in e) {
      if (ic) {
        if (s.selectionStart < 0) s.setSelection(s.length);
        conn.setComposingText(e.compose, 1);
      } else {
        applied = false;
      }
    } else if (ic) {
      conn.finishComposingText();
    } else {
      applied = false;
    }
    const t = edit.text;
    const step: Record<string, unknown> = {
      value: t.toString(),
      selStart: t.selectionStart,
      selEnd: t.selectionEnd,
      fixupCalls: edit.watcher.calls,
      maxDepth: edit.watcher.maxDepth,
    };
    if (ic) step.composing = [t.getSpanStart(COMPOSING), t.getSpanEnd(COMPOSING)];
    if (!applied) step.skipped = true;
    return step;
  });
}

/** `FixupEditTextGoldenTest.runDummy`: the Tier A model, one fixup per edit, no re-entrancy. */
function runDummy(edits: Edit[]): (string | null)[] {
  let s = new DummyEditable('');
  return edits.map((e) => {
    try {
      if ('insert' in e) {
        const at = clampAt(e.at, s.length);
        s.insert(at, e.insert);
        fixup(s, at, at + e.insert.length);
      } else if ('backspace' in e) {
        if (s.length > 0) {
          s.delete(s.length - 1, s.length);
          fixup(s, s.length, s.length);
        }
      } else if ('deleteAt' in e) {
        const at = Math.min(e.deleteAt, s.length);
        if (at > 0) {
          s.delete(at - 1, at);
          fixup(s, at - 1, at - 1);
        }
      } else if ('replace' in e) {
        const a = Math.min(e.replace[0], s.length);
        const b = Math.min(e.replace[1], s.length);
        s.replace(a, b, e.text);
        fixup(s, a, a + e.text.length);
      } else if ('setText' in e) {
        s = new DummyEditable(e.setText);
        fixup(s, 0, e.setText.length);
      } else {
        return null;
      }
    } catch (err) {
      if (!(err instanceof JavaException)) throw err;
    }
    return s.toString();
  });
}

function firstDiff(dummy: (string | null)[], steps: Record<string, unknown>[]): number | null {
  for (let i = 0; i < dummy.length; i++) {
    const d = dummy[i];
    if (d !== null && d !== undefined && d !== steps[i]?.value) return i;
  }
  return null;
}

goldenSuite<{ edits: Edit[] }>('kana/fixup-edittext.json', ({ edits }) => {
  const editText = runEditText(edits, true);
  const editable = runEditText(edits, false);
  const dummy = runDummy(edits);
  return {
    editText,
    editable,
    dummy,
    firstDiffFromDummy: firstDiff(dummy, editText),
    firstDiffFromDummyEditable: firstDiff(dummy, editable),
  };
});

// ---- kana/fixup-keys.json: hardware keys and the clipboard (FixupKeysGoldenTest)

type KeyOp = {
  type?: string; capsLock?: boolean;
  key?: string; meta?: ('shift' | 'ctrl' | 'alt')[]; times?: number; repeat?: number;
  keyDown?: string; keyUp?: string; multiple?: string;
  select?: [number, number];
  clip?: { text?: string; html?: string; items?: string[] };
  menu?: 'paste' | 'pasteAsPlainText' | 'cut' | 'copy' | 'selectAll' | 'undo' | 'redo';
  ime?: 'performEditorAction' | 'commitText'; actionId?: number; text?: string;
};

const MODIFIER_KEY: Record<string, string> = { shift: 'SHIFT_LEFT', ctrl: 'CTRL_LEFT', alt: 'ALT_LEFT' };

/** `FixupKeysGoldenTest.events`. */
function keyEvents(op: KeyOp): SimKeyEvent[] {
  if (op.type !== undefined) return eventsForText(op.type, op.capsLock === true);
  if (op.key !== undefined) {
    const events: SimKeyEvent[] = [];
    const mods = op.meta ?? [];
    const meta = new Set<Meta>();
    for (const m of mods) {
      meta.add(m);
      events.push({ action: 'down', keyCode: MODIFIER_KEY[m] as string, repeat: 0, meta: new Set(meta) });
    }
    if (op.repeat !== undefined) {
      for (let r = 0; r <= op.repeat; r++) events.push({ action: 'down', keyCode: op.key, repeat: r, meta: new Set(meta) });
      events.push({ action: 'up', keyCode: op.key, repeat: 0, meta: new Set(meta) });
    } else {
      for (let r = 0; r < (op.times ?? 1); r++) {
        events.push({ action: 'down', keyCode: op.key, repeat: 0, meta: new Set(meta) });
        events.push({ action: 'up', keyCode: op.key, repeat: 0, meta: new Set(meta) });
      }
    }
    for (let i = mods.length - 1; i >= 0; i--) {
      const m = mods[i] as Meta;
      meta.delete(m);
      events.push({ action: 'up', keyCode: MODIFIER_KEY[m] as string, repeat: 0, meta: new Set(meta) });
    }
    return events;
  }
  if (op.keyDown !== undefined) return [{ action: 'down', keyCode: op.keyDown, repeat: 0, meta: new Set() }];
  if (op.keyUp !== undefined) return [{ action: 'up', keyCode: op.keyUp, repeat: 0, meta: new Set() }];
  if (op.multiple !== undefined) return [{ action: 'multiple', keyCode: 'UNKNOWN', repeat: 0, meta: new Set(), characters: op.multiple }];
  return [];
}

function clipItems(clip: NonNullable<KeyOp['clip']>): ClipItem[] {
  if (clip.items !== undefined) return clip.items.map((text) => ({ text }));
  if (clip.html !== undefined) return [{ text: clip.text ?? '', html: clip.html }];
  return [{ text: clip.text ?? '' }];
}

/** A field as `FixupKeysGoldenTest.Field`: watcher, OnKeyListener and the copied editor-action listener. */
function keyField(clipboard: SimClipboard): { f: SimKeyField; submits: string[] } {
  const submits: string[] = [];
  let field: SimKeyField | null = null;
  field = new SimKeyField(clipboard, appEditorActionListener(
    () => ({ active: true, interactionEnabled: true, answered: false }),
    (text) => submits.push(text),
    () => field as SimKeyField));
  return { f: field, submits };
}

function snapshot(f: SimKeyField): Record<string, unknown> {
  const t = f.text;
  return { value: t.toString(), selStart: t.selectionStart, selEnd: t.selectionEnd,
    fixupCalls: f.edit.watcher.calls, maxDepth: f.edit.watcher.maxDepth };
}

const SELECTION_ONLY_KEYS = new Set(['DPAD_LEFT', 'DPAD_RIGHT', 'DPAD_UP', 'DPAD_DOWN', 'MOVE_HOME', 'MOVE_END',
  'ENTER', 'NUMPAD_ENTER', 'DPAD_CENTER', 'SHIFT_LEFT', 'CTRL_LEFT', 'ALT_LEFT', 'TAB']);

const hasCtrl = (op: KeyOp, key: string): boolean => op.key === key && (op.meta ?? []).includes('ctrl');

goldenSuite<{ ops?: KeyOp[] }>('kana/fixup-keys.json', (input, c, ctx) => {
  const state = ctx.state as { clipboard?: SimClipboard };
  // The device clipboard carries over between cases; setUp left "probe" in it.
  state.clipboard ??= Object.assign(new SimClipboard(), { items: [{ text: 'probe' }] });
  const clipboard = state.clipboard;
  if (c.name === 'env') {
    return { editorInfoImeOptions: 33554438, editorInfoInputType: 524289, keyListener: 'android.text.method.TextKeyListener',
      movementMethod: 'android.text.method.ArrowKeyMovementMethod', focused: true, imeActive: false, keyboardType: 4,
      modifierBehavior: 0, sdk: 36 };
  }
  const ops = input.ops ?? [];
  const { f, submits } = keyField(clipboard);
  const g = keyField(clipboard).f;
  const keys: Record<string, unknown>[] = [];
  const ic: Record<string, unknown>[] = [];
  let icLive = true;
  let icStoppedAt: number | null = null;
  let firstDiff: number | null = null;

  ops.forEach((op, i) => {
    f.edit.watcher.calls = 0;
    f.edit.watcher.maxDepth = 0;
    f.actions.length = 0;
    submits.length = 0;
    const clipBefore = clipboard.text();
    let handled: boolean[] | null = null;
    let returned: boolean | null = null;
    if (op.select !== undefined) {
      const len = f.text.length;
      f.text.setSelection(Math.min(op.select[0], len), Math.min(op.select[1], len));
    } else if (op.clip !== undefined) {
      clipboard.items = clipItems(op.clip);
    } else if (op.menu !== undefined) {
      returned = f.onTextContextMenuItem(op.menu);
    } else if (op.ime === 'performEditorAction') {
      returned = f.performEditorAction(op.actionId ?? 0);
      f.pendingImeEnter = false; // posted to the window, delivered after the step was recorded
    } else if (op.ime === 'commitText') {
      returned = f.conn.commitText(op.text ?? '', 1);
    } else {
      handled = keyEvents(op).map((e) => f.dispatch(e));
    }
    const step = snapshot(f);
    if (handled !== null) step.handled = handled;
    if (returned !== null) step.returned = returned;
    if (f.actions.length > 0) step.actions = f.actions.map((a) => ({ ...a }));
    if (submits.length > 0) step.submits = [...submits];
    const clipAfter = clipboard.text();
    if (clipAfter !== null && clipAfter !== clipBefore && op.clip === undefined) step.clip = clipAfter;
    keys.push(step);

    if (icLive) {
      g.edit.watcher.calls = 0;
      g.edit.watcher.maxDepth = 0;
      const gt = g.text;
      const gSel = Math.max(0, gt.selectionStart) !== Math.max(0, gt.selectionEnd);
      const selectionOnly = op.select !== undefined || op.keyDown !== undefined || op.keyUp !== undefined
        || op.clip !== undefined || (op.key !== undefined && SELECTION_ONLY_KEYS.has(op.key))
        || hasCtrl(op, 'A') || hasCtrl(op, 'C') || op.menu === 'selectAll' || op.menu === 'copy';
      let ok = true;
      if (op.type !== undefined) {
        for (const ch of op.type) g.conn.commitText(op.capsLock === true ? ch.toUpperCase() : ch, 1);
      } else if (op.multiple !== undefined) {
        g.conn.commitText(op.multiple, 1);
      } else if (op.key === 'SPACE' && op.meta === undefined && op.repeat === undefined) {
        for (let k = 0; k < (op.times ?? 1); k++) g.conn.commitText(' ', 1);
      } else if (op.ime === 'performEditorAction') {
        g.performEditorAction(op.actionId ?? 0);
        g.pendingImeEnter = false; // the unattached field has no window: nothing is delivered
      } else if (op.ime === 'commitText') {
        g.conn.commitText(op.text ?? '', 1);
      } else if (op.key !== undefined && op.meta === undefined && (op.key === 'DEL' || op.key === 'FORWARD_DEL')) {
        const times = op.repeat !== undefined ? op.repeat + 1 : op.times ?? 1;
        for (let k = 0; k < times; k++) {
          const t = g.text;
          if (t.selectionStart !== t.selectionEnd) g.conn.commitText('', 1);
          else if (op.key === 'DEL') g.conn.deleteSurroundingText(1, 0);
          else g.conn.deleteSurroundingText(0, 1);
        }
      } else if (op.menu === 'paste' || op.menu === 'pasteAsPlainText' || hasCtrl(op, 'V')) {
        g.conn.commitText(clipBefore ?? '', 1);
      } else if (op.menu === 'cut' || hasCtrl(op, 'X')) {
        if (gSel) g.conn.commitText('', 1);
      } else if (!selectionOnly) {
        ok = false;
      }
      if (ok && selectionOnly) {
        const len = g.text.length;
        g.conn.setSelection(Math.min(step.selStart as number, len), Math.min(step.selEnd as number, len));
      }
      if (ok) {
        ic.push(snapshot(g));
      } else {
        icLive = false;
        icStoppedAt = i;
      }
    }
    if (firstDiff === null && i < ic.length) {
      const a = keys[i] as Record<string, unknown>;
      const b = ic[i] as Record<string, unknown>;
      if (a.value !== b.value || a.selStart !== b.selStart || a.selEnd !== b.selEnd) firstDiff = i;
    }
  });
  return asWritten({ keys, inputConnection: ic, inputConnectionStoppedAt: icStoppedAt, firstDiffFromInputConnection: firstDiff });
});

/**
 * The fixture as `GoldenWriter` wrote it: Jackson encodes a lone UTF-16 surrogate (left by
 * `deleteSurroundingText(1, 0)` in the middle of an emoji, `del-emoji`) as `?`.
 */
function asWritten<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '?') as T;
  if (Array.isArray(value)) return value.map(asWritten) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, asWritten(v)])) as T;
  }
  return value;
}

// ---- kana/keys-session.json: the answer field in a running session (KeysSessionGoldenTest)

type SessionOp = {
  type?: string;
  key?: string; meta?: ('shift' | 'ctrl' | 'alt')[]; repeat?: number;
  keyDown?: string; keyUp?: string;
  ime?: 'performEditorAction' | 'sendKeyEvent' | 'commitText'; actionId?: number; text?: string;
  click?: 'submit' | 'next' | 'dontKnow';
  toReading?: boolean; toMeaning?: boolean;
};

const isMeaningQuestion = (s: SimSessionScreen): boolean => s.session.current?.endsWith('_MEANING') === true;

/** `KeysSessionGoldenTest.resolve`: the macros for the current question. */
function resolveTyped(screen: SimSessionScreen, s: string): string {
  if (!s.startsWith('@')) return s;
  const meaning = isMeaningQuestion(screen);
  if (s === '@answer') return meaning ? 'one' : 'ichi';
  if (s === '@wrong') return meaning ? 'qqqq' : 'nunu';
  if (s === '@kun') return 'hito';
  throw new Error(`unknown macro ${s}`);
}

function typeKeys(screen: SimSessionScreen, text: string): void {
  for (const e of eventsForText(text)) screen.sendKey(e);
}

/** `KeysSessionGoldenTest.sendKey`: modifier downs, the key (plus auto-repeats), its up, modifier ups. */
function sendSessionKey(screen: SimSessionScreen, keyCode: string, mods: ('shift' | 'ctrl' | 'alt')[], repeat: number): void {
  const meta = new Set<Meta>(mods);
  for (const m of mods) screen.sendKey({ action: 'down', keyCode: MODIFIER_KEY[m] as string, repeat: 0, meta });
  for (let r = 0; r <= repeat; r++) screen.sendKey({ action: 'down', keyCode, repeat: r, meta });
  screen.sendKey({ action: 'up', keyCode, repeat: 0, meta });
  for (const m of mods) screen.sendKey({ action: 'up', keyCode: MODIFIER_KEY[m] as string, repeat: 0, meta: new Set() });
}

function performSessionOp(screen: SimSessionScreen, op: SessionOp): void {
  if (op.type !== undefined) typeKeys(screen, resolveTyped(screen, op.type));
  else if (op.ime === 'performEditorAction') screen.performEditorAction(op.actionId ?? 0);
  else if (op.ime === 'sendKeyEvent') screen.imeSendKey(op.key ?? '');
  else if (op.ime === 'commitText') screen.commitText(op.text ?? '');
  else if (op.key !== undefined) sendSessionKey(screen, op.key, op.meta ?? [], op.repeat ?? 0);
  else if (op.keyDown !== undefined) screen.sendKey({ action: 'down', keyCode: op.keyDown, repeat: 0, meta: new Set() });
  else if (op.keyUp !== undefined) screen.sendKey({ action: 'up', keyCode: op.keyUp, repeat: 0, meta: new Set() });
  else if (op.click !== undefined) screen.click(op.click);
  else if (op.toReading === true || op.toMeaning === true) {
    const meaning = isMeaningQuestion(screen);
    if (meaning === (op.toReading === true)) {
      typeKeys(screen, meaning ? 'one' : 'ichi');
      sendSessionKey(screen, 'ENTER', [], 0);
      screen.settle();
      screen.click('next');
      screen.settle();
    }
  } else {
    throw new Error(`bad op ${JSON.stringify(op)}`);
  }
}

goldenSuite<{ subject?: number; ops?: SessionOp[] }>('kana/keys-session.json', (input, c, ctx) => {
  if (c.name === 'device/info') {
    // The device the fixture ran on; the emulation reproduces its field (input type, IME options).
    return { sdk: 36, ime: 'com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME', configKeyboard: 1,
      hardKeyboardHidden: 2, fieldInputType: 524289, fieldImeOptions: 50331654, fieldActionId: 0 };
  }
  const subject = ctx.content?.byId.get(input.subject ?? 0);
  if (subject === undefined) throw new Error(`no subject ${input.subject}`);
  // Self-study of one kanji, seed 1: the reading question first (see sessionScreen.ts).
  const screen = new SimSessionScreen(new StubSession(subject, ['WANIKANI_KANJI_READING', 'WANIKANI_KANJI_MEANING']));
  screen.settle();
  const start = screen.state();
  const steps = (input.ops ?? []).map((op) => {
    performSessionOp(screen, op);
    screen.settle();
    return { op, after: screen.state() };
  });
  return { start, steps };
}, { needsContent: true });
