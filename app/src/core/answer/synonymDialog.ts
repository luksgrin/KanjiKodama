/**
 * The "Add synonym" dialog of the subject info screen as a pure state machine.
 *
 * Java: `views/SubjectInfoView.prepareAddSynonymButton` / `onSynonymEditorAction` / `addSynonym`, with the
 * Android behavior `answers/synonyms-dialog-device.json` recorded on the real dialog: a single-line field
 * whose input filter turns each run of line breaks into one space; Enter or any keyboard action saves
 * (actions other than Done reach the listener as a synthesized Enter); Shift+Enter and a numpad Enter on
 * a non-empty field insert a line break (so a space); Save saves, Cancel and Back close.
 */
import { addSynonym, addSynonymJobData, synonymInput } from './synonyms';

export interface SynonymDialogState {
  /** The dialog is open. */
  showing: boolean;
  /** The field's text (only meaningful while open). */
  field: string;
}

/** A user action on the dialog. */
export type SynonymDialogOp =
  | { open: true }
  | { setText: string }
  | { keys: string }
  | { key: 'ENTER' | 'NUMPAD_ENTER' | 'BACK'; meta?: readonly string[] }
  | { ime: 'performEditorAction'; actionId: number }
  | { ime: 'commitText'; text: string }
  | { button: 'save' | 'cancel' };

/** The dialog field's input filter: line breaks become a space. */
export function synonymFieldFilter(text: string): string {
  return text.replace(/[\r\n]+/g, ' ');
}

/** What an op does: the next state, and the text to save when it confirms (null: nothing is saved). */
export function synonymDialogStep(
  state: SynonymDialogState,
  op: SynonymDialogOp,
): { state: SynonymDialogState; confirm: string | null } {
  if ('open' in op) return { state: { showing: true, field: '' }, confirm: null };
  if (!state.showing) return { state, confirm: null };
  const edit = (field: string) => ({ state: { showing: true, field }, confirm: null });
  const confirm = () => ({ state: { showing: false, field: '' }, confirm: state.field });
  const close = () => ({ state: { showing: false, field: '' }, confirm: null });
  if ('setText' in op) return edit(synonymFieldFilter(op.setText));
  if ('keys' in op) return edit(state.field + op.keys);
  if ('ime' in op) return op.ime === 'commitText' ? edit(state.field + synonymFieldFilter(op.text)) : confirm();
  if ('button' in op) return op.button === 'save' ? confirm() : close();
  if (op.key === 'BACK') return close();
  const modified = (op.meta ?? []).length > 0;
  if (op.key === 'ENTER' && !modified) return confirm();
  if (op.key === 'NUMPAD_ENTER' && !modified && state.field === '') return confirm();
  return edit(state.field + ' ');
}

/**
 * `SubjectInfoView.addSynonym(synonymInput(text))`: the new synonym list and the save job's data, or null
 * when nothing happens (blank value, or one the list already has).
 */
export function confirmSynonym(
  subjectId: number,
  synonyms: readonly string[],
  meaningNote: string | null,
  readingNote: string | null,
  text: string,
): { synonyms: string[]; jobData: string } | null {
  const list = addSynonym(synonyms, synonymInput(text));
  if (list === null) return null;
  return { synonyms: list, jobData: addSynonymJobData(subjectId, meaningNote, readingNote, list) };
}
