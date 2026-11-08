/**
 * The notes screen (`StudyMaterialsActivity`) as a pure model, and what saving a study material stores.
 *
 * Java: `activities/StudyMaterialsActivity` (form, `SynonymRowView` arrows, note fields with
 * `android:maxLength="500"`), `jobs/SaveStudyMaterialJob.runLocal`,
 * `db/dao/SubjectSyncDao.insertOrUpdateStudyMaterial`. Fixtures: `answers/synonyms-ui-device.json`,
 * `answers/synonyms-storage.json`.
 */
import {
  FORM_SYNONYM_ROWS,
  formExtraSynonyms,
  formJobData,
  formSynonymFields,
  serializeSynonymsColumn,
  type StudyMaterialJob,
} from './synonyms';

/** The note fields' `maxLength`. */
export const NOTE_MAX_LENGTH = 500;

/**
 * Android `InputFilter.LengthFilter(max)` on a `setText` into an empty field: the first `max` UTF-16
 * units, one fewer if that would split a surrogate pair.
 */
export function lengthFilter(text: string, max: number): string {
  if (text.length <= max) return text;
  let keep = max;
  const last = text.charCodeAt(keep - 1);
  if (last >= 0xd800 && last <= 0xdbff) keep--;
  return keep <= 0 ? '' : text.substring(0, keep);
}

/** The notes form: the 10 synonym rows and the two note fields. */
export interface StudyMaterialsForm {
  rows: string[];
  meaningNote: string;
  readingNote: string;
}

/** `StudyMaterialsActivity.populateForm`: rows from the synonyms, notes with NULL as "" and cut to 500. */
export function populateStudyMaterialsForm(
  synonyms: readonly string[],
  meaningNote: string | null,
  readingNote: string | null,
): StudyMaterialsForm {
  return {
    rows: formSynonymFields(synonyms),
    meaningNote: lengthFilter(meaningNote ?? '', NOTE_MAX_LENGTH),
    readingNote: lengthFilter(readingNote ?? '', NOTE_MAX_LENGTH),
  };
}

/** One user edit on the form. */
export type StudyMaterialsEdit =
  | { row: number; text: string }
  | { down: number }
  | { up: number }
  | { meaningNote: string }
  | { readingNote: string };

/**
 * Applies an edit: set a row (no limit), swap a row with the next (`down`) or previous (`up`) one (no
 * effect past the ends), or set a note field (cut to 500 like typing into it).
 */
export function editStudyMaterialsForm(form: StudyMaterialsForm, edit: StudyMaterialsEdit): StudyMaterialsForm {
  const rows = [...form.rows];
  if ('row' in edit) {
    rows[edit.row] = edit.text;
    return { ...form, rows };
  }
  if ('down' in edit || 'up' in edit) {
    const i = 'down' in edit ? edit.down : edit.up;
    const j = 'down' in edit ? i + 1 : i - 1;
    if (j < 0 || j >= FORM_SYNONYM_ROWS) return form;
    [rows[i], rows[j]] = [rows[j] as string, rows[i] as string];
    return { ...form, rows };
  }
  if ('meaningNote' in edit) return { ...form, meaningNote: lengthFilter(edit.meaningNote, NOTE_MAX_LENGTH) };
  return { ...form, readingNote: lengthFilter(edit.readingNote, NOTE_MAX_LENGTH) };
}

/**
 * `StudyMaterialsActivity.saveStudyMaterials`: the job data from the rows as typed, followed by the
 * synonyms beyond the 10th that the form doesn't show (`synonyms` is what the form was populated from).
 */
export function studyMaterialsFormJobData(
  subjectId: number,
  form: StudyMaterialsForm,
  synonyms: readonly string[],
): string {
  return formJobData(subjectId, form.meaningNote, form.readingNote, [...form.rows, ...formExtraSynonyms(synonyms)]);
}

/** The study-material columns of a subject row. */
export interface StudyMaterialColumns {
  meaningSynonyms: string | null;
  meaningNote: string | null;
  readingNote: string | null;
  studyMaterialPatched: number;
}

/**
 * `SaveStudyMaterialJob.runLocal` → `insertOrUpdateStudyMaterial(material, patched = true)`: the notes as
 * given, the synonyms serialized, `studyMaterialPatched` 1 (the study material id is left alone).
 */
export function storeStudyMaterialJob(job: StudyMaterialJob): StudyMaterialColumns {
  return {
    meaningSynonyms: serializeSynonymsColumn(job.meaningSynonyms),
    meaningNote: job.meaningNote,
    readingNote: job.readingNote,
    studyMaterialPatched: 1,
  };
}
