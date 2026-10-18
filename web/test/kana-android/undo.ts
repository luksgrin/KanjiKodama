/**
 * Test-side emulation of the EditText's undo (AOSP `Editor.UndoInputFilter` and `Editor.EditOperation`
 * with `UndoManager`): edits are recorded from the Editable's input-filter slot; edits a text watcher
 * makes (the app's `fixup`) are force-merged into the edit that triggered them, contiguous typing
 * merges, and undo/redo replay one operation (delete, then insert) and restore its cursor.
 */
import type { SpanEditable } from '../../src/core/kana/spanEditable';

type OpType = 'insert' | 'delete' | 'replace';

class EditOperation {
  type: OpType;

  constructor(public oldText: string, public start: number, public newText: string,
    public oldCursorPos: number, public newCursorPos: number) {
    this.type = newText.length > 0 && oldText.length === 0 ? 'insert'
      : newText.length === 0 && oldText.length > 0 ? 'delete' : 'replace';
  }

  get newTextEnd(): number {
    return this.start + this.newText.length;
  }

  get oldTextEnd(): number {
    return this.start + this.oldText.length;
  }

  /** `EditOperation.mergeWith` (not composing): contiguous inserts, deletes, insert after replace. */
  mergeWith(edit: EditOperation): boolean {
    if (this.type === 'insert') {
      if (edit.type !== 'insert' || this.newTextEnd !== edit.start) return false;
      this.newText += edit.newText;
      this.newCursorPos = edit.newCursorPos;
      return true;
    }
    if (this.type === 'delete') {
      if (edit.type !== 'delete' || this.start !== edit.oldTextEnd) return false;
      this.start = edit.start;
      this.oldText = edit.oldText + this.oldText;
      this.newCursorPos = edit.newCursorPos;
      return true;
    }
    if (edit.type === 'insert' && this.newTextEnd === edit.start) {
      this.newText += edit.newText;
      this.newCursorPos = edit.newCursorPos;
      return true;
    }
    return false;
  }

  /** `EditOperation.forceMergeWith`: else one replace of the whole text, before both to after both. */
  forceMergeWith(edit: EditOperation, current: string): void {
    if (this.mergeWith(edit)) return;
    const original = current.substring(0, this.start) + this.oldText + current.substring(this.newTextEnd);
    const final = current.substring(0, edit.start) + edit.newText + current.substring(edit.oldTextEnd);
    this.type = 'replace';
    this.newText = final;
    this.oldText = original;
    this.start = 0;
    this.newCursorPos = edit.newCursorPos;
  }
}

export class SimUndo {
  private readonly undos: { op: EditOperation; open: boolean }[] = [];
  private readonly redos: EditOperation[] = [];
  private inUndo = false;
  /** Inside a batch edit (`UndoInputFilter.mIsUserEdit`): key-listener edits. */
  userEdit = false;
  private previousOperationWasInSameBatchEdit = false;

  /** The input-filter hook for the field's Editable. */
  readonly filter = (s: SpanEditable, start: number, end: number, text: string): void => {
    if (this.inUndo) return;
    if (start === end && text.length === 0) return;
    const edit = new EditOperation(s.substring(start, end), start, text, s.selectionStart, start + text.length);
    const forceMerge = s.textWatcherDepth > 0 || this.previousOperationWasInSameBatchEdit;
    const top = this.undos[this.undos.length - 1];
    const last = top !== undefined && top.open ? top.op : null;
    if (last === null) {
      this.add(edit);
    } else if (forceMerge) {
      last.forceMergeWith(edit, s.toString());
    } else if (!this.userEdit) {
      this.add(edit);
    } else if (!last.mergeWith(edit)) {
      this.add(edit);
    }
    this.previousOperationWasInSameBatchEdit = this.userEdit;
  };

  private add(edit: EditOperation): void {
    for (const u of this.undos) u.open = false;
    this.undos.push({ op: edit, open: true });
    this.redos.length = 0;
  }

  beginBatchEdit(): void {
    this.userEdit = true;
  }

  endBatchEdit(): void {
    this.userEdit = false;
    this.previousOperationWasInSameBatchEdit = false;
  }

  canUndo(): boolean {
    return this.undos.length > 0;
  }

  canRedo(): boolean {
    return this.redos.length > 0;
  }

  undo(s: SpanEditable): void {
    const top = this.undos.pop();
    if (top === undefined) return;
    const op = top.op;
    this.run(() => modifyText(s, op.start, op.newTextEnd, op.oldText, op.start, op.oldCursorPos));
    this.redos.push(op);
  }

  redo(s: SpanEditable): void {
    const op = this.redos.pop();
    if (op === undefined) return;
    this.run(() => modifyText(s, op.start, op.oldTextEnd, op.newText, op.start, op.newCursorPos));
    for (const u of this.undos) u.open = false;
    this.undos.push({ op, open: false });
  }

  private run(f: () => void): void {
    this.inUndo = true;
    try {
      f();
    } finally {
      this.inUndo = false;
    }
  }
}

/** `EditOperation.modifyText`. */
function modifyText(text: SpanEditable, deleteFrom: number, deleteTo: number, newText: string, insertAt: number,
  newCursorPos: number): void {
  const valid = deleteFrom >= 0 && deleteFrom <= deleteTo && deleteTo <= text.length;
  if (valid && insertAt <= text.length - (deleteTo - deleteFrom)) {
    if (deleteFrom !== deleteTo) text.delete(deleteFrom, deleteTo);
    if (newText.length !== 0) text.insert(insertAt, newText);
  }
  if (newCursorPos >= 0 && newCursorPos <= text.length) text.setSelection(newCursorPos);
}
