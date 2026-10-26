/**
 * The learner's own synonyms and notes: the "My synonyms" line with its "+" (Add synonym) dialog from
 * the subject info, and the notes form (`StudyMaterialsActivity`). Both build the same save-job data as
 * Java with the core helpers and hand it to `onSave`; persisting it is the caller's job
 * (`storeStudyMaterialJob` columns locally, a study-material upload in server mode).
 *
 * Java: `views/SubjectInfoView.prepareAddSynonymButton`/`addSynonym`, `activities/StudyMaterialsActivity`,
 * `views/SynonymRowView`.
 */
import './subject.css';
import { useId, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  editStudyMaterialsForm,
  populateStudyMaterialsForm,
  storeStudyMaterialJob,
  studyMaterialsFormJobData,
  type StudyMaterialColumns,
  type StudyMaterialsForm,
} from '../../../core/answer/studyMaterials';
import { confirmSynonym, synonymDialogStep, type SynonymDialogOp, type SynonymDialogState } from '../../../core/answer/synonymDialog';
import { parseStudyMaterialJob, type StudyMaterialJob } from '../../../core/answer/synonyms';
import { FORM_SYNONYM_ROWS } from '../../../core/answer/synonyms';
import { NOTE_MAX_LENGTH } from '../../../core/answer/studyMaterials';
import { synonymsHtml } from './subjectText';
import { WkMarkup } from './WkMarkup';

/** What a save hands to the caller. */
export interface StudyMaterialSave {
  subjectId: number;
  /** `SaveStudyMaterialJob` data, exactly as the Java app builds it. */
  jobData: string;
  /** The parsed job (`new SaveStudyMaterialJob(jobData)`). */
  job: StudyMaterialJob;
  /** The subject columns a local save writes (`SaveStudyMaterialJob.runLocal`). */
  columns: StudyMaterialColumns;
}

export type SaveStudyMaterial = (save: StudyMaterialSave) => void | Promise<void>;

export function studyMaterialSave(subjectId: number, jobData: string): StudyMaterialSave {
  const job = parseStudyMaterialJob(jobData);
  return { subjectId, jobData, job, columns: storeStudyMaterialJob(job) };
}

export interface SynonymsLineProps {
  subjectId: number;
  synonyms: readonly string[];
  meaningNote: string | null;
  readingNote: string | null;
  /** No "+" button without it. */
  onSave?: SaveStudyMaterial;
  highlight?: boolean;
}

/** "My synonyms: …" with the "+" button and the Add synonym dialog. */
export function SynonymsLine({ subjectId, synonyms, meaningNote, readingNote, onSave, highlight = true }: SynonymsLineProps) {
  const [dialog, setDialog] = useState<SynonymDialogState>({ showing: false, field: '' });

  const apply = (op: SynonymDialogOp): void => {
    const { state, confirm } = synonymDialogStep(dialog, op);
    setDialog(state);
    if (confirm === null || onSave === undefined) return;
    const result = confirmSynonym(subjectId, synonyms, meaningNote, readingNote, confirm);
    if (result !== null) void onSave(studyMaterialSave(subjectId, result.jobData));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      apply({ key: 'ENTER', meta: e.shiftKey ? ['SHIFT'] : [] });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      apply({ key: 'BACK' });
    }
  };

  // A text input drops pasted line breaks; Android's filter turns them into a space, so do that here.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>): void => {
    const pasted = e.clipboardData.getData('text');
    if (!/[\r\n]/.test(pasted)) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    apply({ setText: el.value.slice(0, start) + pasted + el.value.slice(end) });
  };

  return (
    <div className="kk-synonyms">
      <WkMarkup html={synonymsHtml(synonyms)} highlight={highlight} className="kk-synonyms-text" />
      {onSave !== undefined && (
        <button type="button" className="kk-add-synonym" data-testid="add-synonym" aria-label="Add synonym" onClick={() => apply({ open: true })}>
          <span aria-hidden="true">+</span>
        </button>
      )}
      <ConfirmDialog
        open={dialog.showing}
        title="Add synonym"
        confirmLabel="Save"
        onConfirm={() => apply({ button: 'save' })}
        onCancel={() => apply({ button: 'cancel' })}
      >
        <input
          className="kk-subject-input"
          type="text"
          aria-label="Synonym"
          autoFocus
          value={dialog.field}
          onChange={(e) => apply({ setText: e.target.value })}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          enterKeyHint="done"
        />
      </ConfirmDialog>
    </div>
  );
}

export interface StudyMaterialsEditorProps {
  subjectId: number;
  synonyms: readonly string[];
  meaningNote: string | null;
  readingNote: string | null;
  onSave: SaveStudyMaterial;
  /** Called after Save (the Java activity closes). */
  onDone?: () => void;
}

/** The notes form: meaning note, reading note (500 chars each), 10 synonym rows with ⇩/⇧ to reorder. */
export function StudyMaterialsEditor({ subjectId, synonyms, meaningNote, readingNote, onSave, onDone }: StudyMaterialsEditorProps) {
  const [form, setForm] = useState<StudyMaterialsForm>(() => populateStudyMaterialsForm(synonyms, meaningNote, readingNote));
  const id = useId();

  const save = (e?: FormEvent): void => {
    e?.preventDefault();
    void Promise.resolve(onSave(studyMaterialSave(subjectId, studyMaterialsFormJobData(subjectId, form, synonyms)))).then(() => onDone?.());
  };

  return (
    <form className="kk-study-materials" onSubmit={save}>
      <div className="kk-study-materials-head">
        <span className="kk-subject-label">My notes:</span>
        <button type="submit" className="kk-btn small">
          Save
        </button>
      </div>
      <label className="kk-subject-label" htmlFor={`${id}-mn`}>
        Meaning note:
      </label>
      <textarea
        id={`${id}-mn`}
        className="kk-subject-input kk-subject-note"
        placeholder="My meaning note"
        maxLength={NOTE_MAX_LENGTH}
        value={form.meaningNote}
        onChange={(e) => setForm((f) => editStudyMaterialsForm(f, { meaningNote: e.target.value }))}
      />
      <label className="kk-subject-label" htmlFor={`${id}-rn`}>
        Reading note:
      </label>
      <textarea
        id={`${id}-rn`}
        className="kk-subject-input kk-subject-note"
        placeholder="My reading note"
        maxLength={NOTE_MAX_LENGTH}
        value={form.readingNote}
        onChange={(e) => setForm((f) => editStudyMaterialsForm(f, { readingNote: e.target.value }))}
      />
      <span className="kk-subject-label">Synonyms:</span>
      {form.rows.map((row, i) => (
        <div key={i} className="kk-synonym-row">
          <button
            type="button"
            className="kk-btn small secondary kk-synonym-move"
            aria-label={`Move synonym ${i + 1} down`}
            disabled={i === FORM_SYNONYM_ROWS - 1}
            onClick={() => setForm((f) => editStudyMaterialsForm(f, { down: i }))}
          >
            ⇩
          </button>
          <button
            type="button"
            className="kk-btn small secondary kk-synonym-move"
            aria-label={`Move synonym ${i + 1} up`}
            disabled={i === 0}
            onClick={() => setForm((f) => editStudyMaterialsForm(f, { up: i }))}
          >
            ⇧
          </button>
          <input
            className="kk-subject-input"
            type="text"
            placeholder="Synonym"
            aria-label={`Synonym ${i + 1}`}
            value={row}
            onChange={(e) => setForm((f) => editStudyMaterialsForm(f, { row: i, text: e.target.value }))}
          />
        </div>
      ))}
      <button type="submit" className="kk-btn small">
        Save
      </button>
    </form>
  );
}
