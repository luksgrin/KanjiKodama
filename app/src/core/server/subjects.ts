/**
 * Server mode's content: the subjects and SRS systems the server sent (`GetSubjectsTask`,
 * `GetSrsSystemsTask`), as the core `Content` the session, dashboard and item pages work on. Java
 * stores the API subject in its `subject` table (`SubjectSyncDao.insertOrUpdate`); here the raw
 * envelopes stay in the Dexie `serverSubjects` table and are mapped on load.
 *
 * Reference data (frequency, Joyo grade, JLPT level) is not in the API: Java fills it from its own
 * tables by character (`LoadReferenceDataTask`); here it comes from the bundled subject with the same
 * id, when there is one. Parts and sound, stroke order and pitch are looked up by id in the bundled
 * content too.
 */
import {
  makeContent,
  type AuxiliaryMeaning,
  type Content,
  type ContentSubject,
  type Meaning,
  type Reading,
  type SrsStageData,
  type SrsSystemData,
  type SubjectObject,
} from '../content';
import { parseTimestampFromApi } from '../importer/api';

/** A downloaded subject as stored (`{id, object, data}`; readings "None" already dropped). */
export interface ServerSubjectEnvelope {
  id: number;
  object: string;
  data: Record<string, unknown>;
}

const OBJECTS: readonly SubjectObject[] = ['radical', 'kanji', 'vocabulary', 'kana_vocabulary'];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function meanings(v: unknown): Meaning[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObject).map((m) => ({
    meaning: strOrNull(m.meaning),
    primary: m.primary === true,
    accepted_answer: m.accepted_answer === true,
  }));
}

function auxiliaryMeanings(v: unknown): AuxiliaryMeaning[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObject).map((m) => ({ meaning: strOrNull(m.meaning), type: strOrNull(m.type) }));
}

function readings(v: unknown): Reading[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isObject).map((r) => {
    const out: Reading = { reading: strOrNull(r.reading), primary: r.primary === true, accepted_answer: r.accepted_answer === true };
    if (r.type !== undefined) out.type = strOrNull(r.type);
    return out;
  });
}

/**
 * One API subject as a `ContentSubject`, or null when it is not a subject this app knows (an unknown
 * `object`, or no level). `reference` is the bundled subject with the same id (reference data).
 */
export function serverSubjectToContent(e: ServerSubjectEnvelope, reference?: ContentSubject): ContentSubject | null {
  const object = OBJECTS.find((o) => o === e.object);
  const d = isObject(e.data) ? e.data : {};
  const level = int(d.level);
  if (object === undefined || level <= 0) return null;
  return {
    id: e.id,
    object,
    hiddenAt: parseTimestampFromApi(strOrNull(d.hidden_at)),
    lessonPosition: int(d.lesson_position),
    srsSystemId: int(d.spaced_repetition_system_id),
    level,
    characters: strOrNull(d.characters),
    slug: strOrNull(d.slug),
    meanings: meanings(d.meanings),
    auxiliaryMeanings: auxiliaryMeanings(d.auxiliary_meanings),
    readings: readings(d.readings),
    componentSubjectIds: ids(d.component_subject_ids),
    amalgamationSubjectIds: ids(d.amalgamation_subject_ids),
    visuallySimilarSubjectIds: ids(d.visually_similar_subject_ids),
    partsOfSpeech: strings(d.parts_of_speech),
    frequency: reference?.frequency ?? 0,
    joyoGrade: reference?.joyoGrade ?? 0,
    jlptLevel: reference?.jlptLevel ?? 0,
  };
}

/** The stored `server.srsSystems` list (`{id, ...data}` per system) as `SrsSystemData`; bad entries dropped. */
export function serverSrsSystems(raw: unknown): SrsSystemData[] {
  if (!Array.isArray(raw)) return [];
  const out: SrsSystemData[] = [];
  for (const s of raw) {
    if (!isObject(s) || typeof s.id !== 'number' || !Array.isArray(s.stages)) continue;
    const stages: SrsStageData[] = s.stages.filter(isObject).map((st) => ({
      position: int(st.position),
      interval: typeof st.interval === 'number' ? st.interval : null,
      interval_unit: typeof st.interval_unit === 'string' ? st.interval_unit : 'seconds',
    }));
    out.push({
      id: s.id,
      name: typeof s.name === 'string' ? s.name : '',
      description: typeof s.description === 'string' ? s.description : '',
      stages,
      unlockingStagePosition: int(s.unlocking_stage_position),
      startingStagePosition: int(s.starting_stage_position),
      passingStagePosition: int(s.passing_stage_position),
      burningStagePosition: int(s.burning_stage_position),
    });
  }
  return out;
}

/** Ids from here on are the bundled extra kanji and words (local mode only). */
export const EXTRA_CONTENT_FIRST_ID = 100000;

/**
 * The content for server mode. With downloaded subjects: exactly those (reference data from the
 * bundled subject of the same id). Before the first subject sync: the bundled WaniKani subjects
 * (never the extra kanji), so item pages and the dashboard have something until the download is
 * in. SRS systems: the server's, else the bundled ones.
 */
export function buildServerContent(rows: readonly ServerSubjectEnvelope[], srsRaw: unknown, bundled: Content): Content {
  const srs = serverSrsSystems(srsRaw);
  const systems = srs.length > 0 ? srs : bundled.srsSystems;
  if (rows.length === 0) {
    return makeContent(bundled.subjects.filter((s) => s.id < EXTRA_CONTENT_FIRST_ID), systems);
  }
  const subjects: ContentSubject[] = [];
  for (const r of rows) {
    const s = serverSubjectToContent(r, bundled.byId.get(r.id));
    if (s !== null) subjects.push(s);
  }
  return makeContent(subjects, systems);
}
