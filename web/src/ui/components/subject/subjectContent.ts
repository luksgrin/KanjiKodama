/**
 * The per-subject content the item page reads on demand from the open content file (sql.js): the
 * mnemonics, hints and context sentences that `Content` leaves out to keep start-up small, plus the
 * parsed stroke data and pitch info.
 */
import type { Database } from 'sql.js';
import { pitchInfo, strokeData } from '../../../content/contentFile';
import { parsePitchInfo, type PitchInfo } from './pitchInfo';

/** `api/model/ContextSentence`. */
export interface ContextSentence {
  en: string | null;
  ja: string | null;
}

export interface SubjectTexts {
  meaningMnemonic: string | null;
  meaningHint: string | null;
  readingMnemonic: string | null;
  readingHint: string | null;
  contextSentences: ContextSentence[];
}

const EMPTY_TEXTS: SubjectTexts = {
  meaningMnemonic: null,
  meaningHint: null,
  readingMnemonic: null,
  readingHint: null,
  contextSentences: [],
};

function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/** `Subject.getContextSentences`: the JSON column; NULL, empty or unreadable text gives []. */
export function parseContextSentences(json: string | null): ContextSentence[] {
  if (json === null || json === '') return [];
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({ en: strOrNull(x.en), ja: strOrNull(x.ja) }));
  } catch {
    return [];
  }
}

/** Mnemonics, hints and context sentences of a subject (all empty for an unknown id). */
export function readSubjectTexts(db: Database, id: number): SubjectTexts {
  const stmt = db.prepare(
    'SELECT meaningMnemonic, meaningHint, readingMnemonic, readingHint, contextSentences FROM subject WHERE id = ?',
  );
  try {
    stmt.bind([id]);
    if (!stmt.step()) return EMPTY_TEXTS;
    const [mm, mh, rm, rh, cs] = stmt.get();
    return {
      meaningMnemonic: strOrNull(mm),
      meaningHint: strOrNull(mh),
      readingMnemonic: strOrNull(rm),
      readingHint: strOrNull(rh),
      contextSentences: parseContextSentences(strOrNull(cs)),
    };
  } finally {
    stmt.free();
  }
}

/** `Subject.getParsedStrokeData`: the stroke paths, [] when absent or unreadable. */
export function parseStrokeData(json: string | null): string[] {
  if (json === null || json === '') return [];
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function readStrokeData(db: Database, id: number): string[] {
  return parseStrokeData(strokeData(db, id));
}

export function readPitchInfo(db: Database, id: number): PitchInfo[] {
  return parsePitchInfo(pitchInfo(db, id));
}
