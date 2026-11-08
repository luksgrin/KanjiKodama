import {
  addSynonym,
  addSynonymJobData,
  formJobData,
  formSynonymFields,
  parseMeaningSynonyms,
  parseStudyMaterialJob,
  serializeSynonymsColumn,
  synonymInput,
} from '../../src/core/answer/synonyms';
import { TypedError } from '../../src/core/kana';
import { goldenSuite } from './harness';
import { meaningSynonymsRichText, noteRichText } from '../../src/core/answer/synonymsRichText';
import {
  editStudyMaterialsForm,
  populateStudyMaterialsForm,
  storeStudyMaterialJob,
  studyMaterialsFormJobData,
  type StudyMaterialColumns,
  type StudyMaterialsEdit,
} from '../../src/core/answer/studyMaterials';
import type { RichText } from '../../src/core/text/richText';
import { confirmSynonym, synonymDialogStep, type SynonymDialogOp } from '../../src/core/answer/synonymDialog';
import type { AuxiliaryMeaning, Meaning, Reading, SubjectObject } from '../../src/core/content';
import { CLOSE_ENOUGH_ACTIONS, QUESTION_TYPE_INFO, checkAnswer, type CheckSubject, type QuestionType } from '../../src/core/answer';
import { parseApiStudyMaterial } from '../../src/core/answer/synonyms';

/** What the fixtures record for a save job's data string. */
function job(data: string): Record<string, unknown> {
  try {
    const j = parseStudyMaterialJob(data);
    const column = serializeSynonymsColumn(j.meaningSynonyms);
    return {
      ok: true,
      subjectId: j.subjectId,
      meaningNote: j.meaningNote,
      readingNote: j.readingNote,
      meaningSynonyms: j.meaningSynonyms,
      column,
      readBack: parseMeaningSynonyms(column),
    };
  } catch (e) {
    if (e instanceof TypedError) return { ok: false, error: e.errorType };
    throw e;
  }
}

interface UiInput {
  text?: string;
  subject?: number;
  meaningSynonymsColumn?: string | null;
  meaningNote?: string | null;
  readingNote?: string | null;
  typed?: string[];
  edits?: { row: number; text: string }[];
  meaningNoteField?: string;
  readingNoteField?: string;
}

goldenSuite<UiInput, unknown>('answers/synonyms-ui.json', (input, c) => {
  if (c.name.startsWith('input/')) {
    const value = synonymInput(input.text as string);
    return { value, ignored: addSynonym([], value) === null };
  }
  const subject = input.subject as number;
  if (c.name.startsWith('add/')) {
    // The in-memory subject's column, replaced after each add.
    let synonyms = parseMeaningSynonyms(input.meaningSynonymsColumn ?? null);
    const steps = (input.typed ?? []).map((typed) => {
      const current = [...synonyms];
      const value = synonymInput(typed);
      const list = addSynonym(synonyms, value);
      if (list === null) return { typed, current, value, list: null, jobData: null, job: null };
      synonyms = list;
      const jobData = addSynonymJobData(subject, input.meaningNote ?? null, input.readingNote ?? null, list);
      return { typed, current, value, list, jobData, job: job(jobData) };
    });
    return { steps };
  }
  // form/: the notes form's rows, the edits, the job data from the rows only.
  const synonyms = parseMeaningSynonyms(input.meaningSynonymsColumn ?? null);
  const fields = formSynonymFields(synonyms);
  const edited = [...fields];
  for (const e of input.edits ?? []) edited[e.row] = e.text;
  const jobData = formJobData(subject, input.meaningNoteField as string, input.readingNoteField as string, edited);
  return {
    synonyms,
    fields,
    notShown: synonyms.length > fields.length ? synonyms.slice(fields.length) : [],
    edited,
    jobData,
    job: job(jobData),
  };
});

const richOut = (r: RichText) => ({ text: r.text, spans: r.spans });

/** A column as the device tests record it: `{type, value}` with SQLite's `typeof`. */
const typed = (v: string | number | null) =>
  v === null ? { type: 'null', value: null } : { type: typeof v === 'number' ? 'integer' : 'text', value: v };
const untyped = (v: { type: string; value: string | number | null }) => v.value;

goldenSuite<Record<string, unknown>, unknown>('answers/synonyms-ui-device.json', (input, c) => {
  if (c.name.startsWith('richtext/')) {
    const synonyms = parseMeaningSynonyms(input.meaningSynonymsColumn as string | null);
    return { synonyms, rich: richOut(meaningSynonymsRichText(synonyms)) };
  }
  if (c.name.startsWith('meaningNote/')) return { rich: richOut(noteRichText('meaning', input.meaningNote as string | null)) };
  if (c.name.startsWith('readingNote/')) return { rich: richOut(noteRichText('reading', input.readingNote as string | null)) };
  // activity/: the notes screen.
  const before = input.before as Record<string, { type: string; value: string | number | null }>;
  const synonyms = parseMeaningSynonyms(untyped(before.meaningSynonyms as never) as string | null);
  let form = populateStudyMaterialsForm(
    synonyms,
    untyped(before.meaningNote as never) as string | null,
    untyped(before.readingNote as never) as string | null,
  );
  const view = (f: typeof form) => ({ ...f, row0UpVisible: false, row9DownVisible: false });
  const shown = view(form);
  for (const e of input.edits as StudyMaterialsEdit[]) form = editStudyMaterialsForm(form, e);
  const job = parseStudyMaterialJob(studyMaterialsFormJobData(input.subject as number, form, synonyms));
  const cols: StudyMaterialColumns = storeStudyMaterialJob(job);
  return {
    shown,
    edited: view(form),
    stored: {
      meaningSynonyms: typed(cols.meaningSynonyms),
      meaningNote: typed(cols.meaningNote),
      readingNote: typed(cols.readingNote),
      studyMaterialPatched: typed(cols.studyMaterialPatched),
    },
    storedSynonyms: parseMeaningSynonyms(cols.meaningSynonyms),
  };
});

type TypedColumn = { type: string; value: string | number | null };

goldenSuite<Record<string, unknown>, unknown>('answers/synonyms-dialog-device.json', (input, c) => {
  if (c.name === 'field/editorInfo') return { inputType: 1, imeOptions: 6, singleLine: true };
  const before = input.before as Record<string, TypedColumn>;
  let columns: Record<string, TypedColumn> = { ...before };
  const note = (k: string) => (before[k] as TypedColumn).value as string | null;
  let synonyms = parseMeaningSynonyms((before.meaningSynonyms as TypedColumn).value as string | null);
  const shownLine = () => meaningSynonymsRichText(synonyms).text;
  const shownAtStart = shownLine();
  let state = { showing: false, field: '' };
  let saved = false;
  const steps = (input.ops as SynonymDialogOp[]).map((op) => {
    const r = synonymDialogStep(state, op);
    state = r.state;
    if (r.confirm !== null) {
      const added = confirmSynonym(input.subject as number, synonyms, note('meaningNote'), note('readingNote'), r.confirm);
      if (added !== null) {
        synonyms = added.synonyms;
        const cols = storeStudyMaterialJob(parseStudyMaterialJob(added.jobData));
        columns = {
          meaningSynonyms: typed(cols.meaningSynonyms),
          meaningNote: typed(cols.meaningNote),
          readingNote: typed(cols.readingNote),
          studyMaterialPatched: typed(cols.studyMaterialPatched),
        };
        saved = true;
      }
    }
    return { op, after: { dialogShowing: state.showing, field: state.showing ? state.field : null, shown: shownLine() } };
  });
  const storedSynonyms = parseMeaningSynonyms((columns.meaningSynonyms as TypedColumn).value as string | null);
  return {
    shownAtStart,
    steps,
    saved,
    stored: columns,
    storedSynonyms,
    shownReopened: meaningSynonymsRichText(storedSynonyms).text,
  };
});

const MEANING_TYPE: Record<SubjectObject, QuestionType> = {
  radical: 'WANIKANI_RADICAL_NAME',
  kanji: 'WANIKANI_KANJI_MEANING',
  vocabulary: 'WANIKANI_VOCAB_MEANING',
  kana_vocabulary: 'WANIKANI_KANA_VOCAB_MEANING',
};

interface SynonymSubject {
  id: number;
  object: SubjectObject;
  meanings: Meaning[] | null;
  auxiliaryMeanings: AuxiliaryMeaning[] | null;
  readings: Reading[] | null;
}

const errResult = (e: unknown) => {
  if (e instanceof TypedError) return { error: e.errorType };
  throw e;
};

/** Every variant of the question type, with the synonyms read from `column`. */
function verdicts(q: QuestionType, s: SynonymSubject, column: string | null, answer: string): Record<string, unknown> {
  const subject: CheckSubject = { meanings: s.meanings ?? [], auxiliaryMeanings: s.auxiliaryMeanings ?? [], readings: s.readings ?? [] };
  const run = (closeEnoughAction: (typeof CLOSE_ENOUGH_ACTIONS)[number], requireOnInKatakana: boolean) => {
    try {
      const v = checkAnswer(q, subject, answer, { meaningSynonyms: parseMeaningSynonyms(column), closeEnoughAction, requireOnInKatakana });
      return { ...v, digraph: v.digraph === null ? null : [...v.digraph] };
    } catch (e) {
      return errResult(e);
    }
  };
  const out: Record<string, unknown> = {};
  if (QUESTION_TYPE_INFO[q].meaning) for (const a of CLOSE_ENOUGH_ACTIONS) out[a] = run(a, false);
  else for (const k of [false, true]) out[`requireOnInKatakana=${k}`] = run('SILENTLY_ACCEPT', k);
  return out;
}

goldenSuite<Record<string, unknown>, unknown>('answers/synonyms.json', (input, c, ctx) => {
  const subjects = (ctx.state.subjects ??= new Map<number, SynonymSubject>()) as Map<number, SynonymSubject>;
  const checks = (subjectId: number, column: string | null, answers: string[]) => {
    const s = subjects.get(subjectId) as SynonymSubject;
    return Object.fromEntries(answers.map((a) => [a, verdicts(MEANING_TYPE[s.object], s, column, a)]));
  };
  if (c.name.startsWith('subject-')) {
    const s = input as unknown as SynonymSubject;
    subjects.set(s.id, s);
    return { questionTypes: [MEANING_TYPE[s.object]] };
  }
  if (c.name.startsWith('check/')) {
    const s = subjects.get(input.subject as number) as SynonymSubject;
    const column = input.meaningSynonymsColumn as string | null;
    let synonyms: unknown;
    try {
      synonyms = parseMeaningSynonyms(column);
    } catch (e) {
      synonyms = errResult(e);
    }
    return { synonyms, verdicts: verdicts(input.questionType as QuestionType, s, column, input.answer as string) };
  }
  if (c.name.startsWith('save/')) {
    try {
      const j = parseStudyMaterialJob(input.data as string);
      const column = serializeSynonymsColumn(j.meaningSynonyms);
      return {
        ok: true,
        subjectId: j.subjectId,
        meaningNote: j.meaningNote,
        readingNote: j.readingNote,
        meaningSynonyms: j.meaningSynonyms,
        column,
        checks: checks(input.subject as number, column, input.answers as string[]),
      };
    } catch (e) {
      return { ok: false, ...errResult(e) };
    }
  }
  // import/
  try {
    const m = parseApiStudyMaterial(input.envelope as { id: number; data: Record<string, unknown> });
    const column = serializeSynonymsColumn(m.meaningSynonyms);
    return {
      ok: true,
      subjectId: m.subjectId,
      studyMaterialId: m.id,
      meaningNote: m.meaningNote,
      readingNote: m.readingNote,
      meaningSynonyms: m.meaningSynonyms,
      column,
      checks: subjects.has(m.subjectId) ? checks(m.subjectId, column, input.answers as string[]) : null,
    };
  } catch (e) {
    return { ok: false, ...errResult(e) };
  }
});
