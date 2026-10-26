/**
 * User meaning synonyms and the study-material (notes) save path, as the Java app stores them.
 *
 * Java: `util/StudyMaterialsSupport` (the "Add synonym" dialog and the notes form),
 * `db/model/Subject.getMeaningSynonyms` (column parsing), `jobs/SaveStudyMaterialJob` (job data),
 * `db/dao/SubjectSyncDao.serializeToJsonString` (the stored column).
 * Fixtures: `answers/synonyms*.json`.
 */
import { JavaException } from '../kana';
import { JacksonError, readStringList, writeStringList } from './jackson';

/** `StudyMaterialsSupport.FORM_SYNONYM_ROWS`: the notes form's synonym rows. */
export const FORM_SYNONYM_ROWS = 10;

/**
 * Java `Character.isWhitespace(c) || Character.isSpaceChar(c)` for one UTF-16 unit: tab..CR, the
 * file/group/record/unit separators U+001C..U+001F, and the space, line and paragraph separators
 * (Zs, Zl, Zp: NBSP, U+2007 and U+202F included).
 */
export function isJavaWhitespaceOrSpaceChar(c: number): boolean {
  return (
    (c >= 0x09 && c <= 0x0d) ||
    (c >= 0x1c && c <= 0x20) ||
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000
  );
}

/** `StudyMaterialsSupport.isBlank`: null, empty, or only whitespace/space chars (NBSP and U+3000 included). */
export function isBlank(s: string | null | undefined): boolean {
  if (s === null || s === undefined) return true;
  for (let i = 0; i < s.length; i++) if (!isJavaWhitespaceOrSpaceChar(s.charCodeAt(i))) return false;
  return true;
}

/** `StudyMaterialsSupport.isTrimmable`: `String.trim`'s chars (<= U+0020) plus the ones `isBlank` counts. */
function isTrimmable(c: number): boolean {
  return c <= 0x20 || isJavaWhitespaceOrSpaceChar(c);
}

/**
 * `StudyMaterialsSupport.synonymInput`: the "Add synonym" dialog's text as it is saved: each run of
 * CR/LF becomes one space, then trimmable chars are stripped at both ends.
 */
export function synonymInput(text: string): string {
  const s = text.replace(/[\r\n]+/g, ' ');
  let start = 0;
  let end = s.length;
  while (start < end && isTrimmable(s.charCodeAt(start))) start++;
  while (end > start && isTrimmable(s.charCodeAt(end - 1))) end--;
  return s.substring(start, end);
}

/**
 * `StudyMaterialsSupport.addSynonym`: the new list, or null when nothing happens (a blank value, or one
 * the list already contains exactly, case-sensitive).
 */
export function addSynonym(current: readonly string[], value: string | null): string[] | null {
  if (isBlank(value) || current.includes(value as string)) return null;
  return [...current, value as string];
}

/** `StudyMaterialsSupport.addSynonymJobData`: `[id, meaningNote ?? "", readingNote ?? "", ...synonyms]` as JSON. */
export function addSynonymJobData(
  subjectId: number,
  meaningNote: string | null,
  readingNote: string | null,
  synonyms: readonly string[],
): string {
  return writeStringList([String(subjectId), meaningNote ?? '', readingNote ?? '', ...synonyms]);
}

/** `StudyMaterialsSupport.formSynonymFields`: exactly 10 row texts, `""` for unused rows. */
export function formSynonymFields(synonyms: readonly string[]): string[] {
  const padded = [...synonyms];
  while (padded.length < FORM_SYNONYM_ROWS) padded.push('');
  return padded.slice(0, FORM_SYNONYM_ROWS);
}

/** `StudyMaterialsSupport.formExtraSynonyms`: the synonyms beyond the form's rows (kept unchanged on save). */
export function formExtraSynonyms(synonyms: readonly string[]): string[] {
  return synonyms.length <= FORM_SYNONYM_ROWS ? [] : synonyms.slice(FORM_SYNONYM_ROWS);
}

/** `StudyMaterialsSupport.formJobData`: the form's texts as typed, nothing trimmed. */
export function formJobData(
  subjectId: number,
  meaningNote: string,
  readingNote: string,
  synonymFields: readonly string[],
): string {
  return writeStringList([String(subjectId), meaningNote, readingNote, ...synonymFields]);
}

/**
 * `Subject.getMeaningSynonyms`: the `meaningSynonyms` column parsed like Jackson does, without null and
 * blank entries. NULL or empty text, or text Jackson can't read, gives []. The text `null` makes Java
 * throw a NullPointerException (a `JavaException`).
 */
export function parseMeaningSynonyms(column: string | null): string[] {
  if (column === null || column === '') return [];
  let parsed: (string | null)[] | null;
  try {
    parsed = readStringList(column);
  } catch (e) {
    if (e instanceof JacksonError) return [];
    throw e;
  }
  if (parsed === null) throw new JavaException('NullPointerException', 'meaningSynonyms column is "null"');
  return parsed.filter((s): s is string => !isBlank(s));
}

/** `SubjectSyncDao.serializeToJsonString`: `[]` for an empty list, otherwise Jackson's JSON. */
export function serializeSynonymsColumn(list: readonly (string | null)[] | null): string {
  return list === null || list.length === 0 ? '[]' : writeStringList(list);
}

/** What `new SaveStudyMaterialJob(data)` holds. */
export interface StudyMaterialJob {
  subjectId: number;
  meaningNote: string | null;
  readingNote: string | null;
  /** The synonyms without empty and blank values (`removeEmpty`, then `isBlank`). */
  meaningSynonyms: string[];
}

/**
 * `new SaveStudyMaterialJob(data)`: `[id, meaningNote, readingNote, ...synonyms]`; empty and blank
 * synonyms are dropped. Throws like Java on malformed data (JacksonError, or a JavaException).
 */
export function parseStudyMaterialJob(data: string): StudyMaterialJob {
  let values: (string | null)[] | null;
  try {
    values = readStringList(data);
  } catch (e) {
    // The constructor wraps Jackson's IOException.
    if (e instanceof JacksonError) throw new JavaException('IllegalArgumentException', e.message);
    throw e;
  }
  if (values === null) throw new JavaException('NullPointerException', 'job data is "null"');
  if (values.length < 3) throw new JavaException('IndexOutOfBoundsException', `Index 0 out of bounds for length ${values.length}`);
  const [id, meaningNote, readingNote, ...rest] = values as [string | null, string | null, string | null, ...(string | null)[]];
  // Long.parseLong: an optional sign and decimal digits (null throws NumberFormatException too).
  if (id === null || !/^[+-]?[0-9]+$/.test(id)) throw new JavaException('NumberFormatException', String(id));
  return {
    subjectId: Number(id),
    meaningNote,
    readingNote,
    meaningSynonyms: rest.filter((s): s is string => s !== null && s !== '' && !isBlank(s)),
  };
}

/** `api/model/ApiStudyMaterial` as `ApiTask.parseEntity` reads a WaniKani `study_material` envelope. */
export interface ApiStudyMaterial {
  id: number;
  subjectId: number;
  meaningNote: string | null;
  readingNote: string | null;
  /** Missing gives []; an explicit null stays null. */
  meaningSynonyms: (string | null)[] | null;
}

/**
 * `ApiTask.parseEntity` for a study material: the `data` fields by their JSON names (unknown ones
 * ignored), the id from the envelope. Synonyms must be an array (numbers and booleans become their text);
 * anything else throws like Jackson's `MismatchedInputException`.
 */
export function parseApiStudyMaterial(envelope: { id: number; data: Record<string, unknown> }): ApiStudyMaterial {
  const d = envelope.data;
  const text = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
  let meaningSynonyms: (string | null)[] | null = [];
  if ('meaning_synonyms' in d) {
    const v = d.meaning_synonyms;
    if (v === null) meaningSynonyms = null;
    else if (Array.isArray(v)) {
      meaningSynonyms = v.map((x) => {
        if (x === null) return null;
        if (typeof x === 'object') throw new JavaException('MismatchedInputException', 'synonym is not a scalar');
        return String(x);
      });
    } else throw new JavaException('MismatchedInputException', 'meaning_synonyms is not an array');
  }
  return {
    id: envelope.id,
    subjectId: typeof d.subject_id === 'number' ? d.subject_id : 0,
    meaningNote: text(d.meaning_note),
    readingNote: text(d.reading_note),
    meaningSynonyms,
  };
}
