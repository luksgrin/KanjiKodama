import type { Database } from 'sql.js';
import { makeContent, type Content, type ContentSubject, type SubjectObject } from '../core/content';

/** The level the extra subjects get in WaniKani order. */
export const EXTRA_WK_LEVEL = 61;

interface ExtraRow {
  id: number;
  object: SubjectObject;
  characters: string;
  position: number;
  meanings: string;
  auxiliaryMeanings: string;
  readings: string;
  components: string[];
  partsOfSpeech: string;
  jlpt: number;
}

function jsonArray<T>(text: string | null): T[] {
  if (!text) return [];
  const v: unknown = JSON.parse(text);
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Characters → id; visible subjects win over hidden ones, then the higher id. */
function idsByCharacters(subjects: Iterable<ContentSubject>, object: SubjectObject): Map<string, number> {
  const matching = [...subjects].filter((s) => s.object === object && s.characters !== null);
  // ORDER BY hiddenAt != 0 DESC, id: hidden first, then visible; later puts win.
  matching.sort((a, b) => Number(b.hiddenAt !== 0) - Number(a.hiddenAt !== 0) || a.id - b.id);
  const out = new Map<string, number>();
  for (const s of matching) out.set(s.characters as string, s.id);
  return out;
}

/**
 * The extra kanji (ids from 100000) and words (from 200000) of `extra-kanji.db`, merged into the
 * WaniKani content (level 61, SRS system 1, visible, kanji components resolved to radicals by character, word components
 * to kanji, extra kanji's amalgamations set to their words).
 */
export function mergeExtraContent(base: Content, extraDb: Database): Content {
  const stmt = extraDb.prepare(
    'SELECT id, object, characters, position, meanings, auxiliary_meanings, readings, component_chars,' +
      " parts_of_speech, jlpt FROM extra_subject ORDER BY object = 'kanji' DESC, id",
  );
  const rows: ExtraRow[] = [];
  try {
    while (stmt.step()) {
      const r = stmt.getAsObject();
      rows.push({
        id: Number(r.id),
        object: String(r.object) as SubjectObject,
        characters: String(r.characters),
        position: Number(r.position),
        meanings: String(r.meanings),
        auxiliaryMeanings: String(r.auxiliary_meanings),
        readings: String(r.readings),
        components: jsonArray<string>(String(r.component_chars)),
        partsOfSpeech: String(r.parts_of_speech),
        jlpt: Number(r.jlpt),
      });
    }
  } finally {
    stmt.free();
  }

  const byId = new Map<number, ContentSubject>(base.subjects.map((s) => [s.id, s]));
  const radicals = idsByCharacters(byId.values(), 'radical');
  const amalgamations = new Map<number, number[]>();
  let vocabOffset = 0;
  for (const r of rows) if (r.object === 'kanji') vocabOffset = Math.max(vocabOffset, r.position);
  let kanji: Map<string, number> | null = null;
  for (const r of rows) {
    const isKanji = r.object === 'kanji';
    const comps: number[] = [];
    if (isKanji) {
      for (const ch of r.components) {
        const id = radicals.get(ch);
        if (id !== undefined && !comps.includes(id)) comps.push(id);
      }
    } else {
      kanji ??= idsByCharacters(byId.values(), 'kanji');
      for (const ch of r.components) {
        const id = kanji.get(ch);
        if (id !== undefined && !comps.includes(id)) {
          comps.push(id);
          if (id >= 100000) {
            const list = amalgamations.get(id) ?? [];
            list.push(r.id);
            amalgamations.set(id, list);
          }
        }
      }
    }
    byId.set(r.id, {
      id: r.id,
      object: r.object,
      hiddenAt: 0,
      lessonPosition: isKanji ? r.position : vocabOffset + r.position,
      srsSystemId: 1,
      level: EXTRA_WK_LEVEL,
      characters: r.characters,
      slug: r.characters,
      meanings: jsonArray(r.meanings),
      auxiliaryMeanings: jsonArray(r.auxiliaryMeanings),
      readings: jsonArray(r.readings),
      componentSubjectIds: comps,
      amalgamationSubjectIds: [],
      visuallySimilarSubjectIds: [],
      partsOfSpeech: jsonArray(r.partsOfSpeech),
      frequency: 0,
      joyoGrade: 0,
      jlptLevel: isKanji ? r.jlpt : 0,
    });
  }
  for (const [id, words] of amalgamations) {
    const s = byId.get(id);
    if (s) byId.set(id, { ...s, amalgamationSubjectIds: words });
  }
  return makeContent([...byId.values()], base.srsSystems);
}
