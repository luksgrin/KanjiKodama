/**
 * Progress file in the format of durtles/.../local/ProgressStore.java:
 * {"format":"kanjikodama-progress","version":1,"exportedAt":ms,"userLevel":n,"curriculum":"WANIKANI"|"JLPT",
 *  "levelProgression":[…],"subjects":[{"id":…, <subject columns>}],"probation":[[id,ms]…],"jumps":[[…]…]}
 */
import type { KkDb, SubjectProgress } from '../storage/db';

export const FORMAT = 'kanjikodama-progress';
const LEGACY_FORMAT = 'mojimori-progress';
export const VERSION = 1;

/** Subject columns this build stores; other columns in a file are ignored. */
const SUBJECT_FIELDS = ['srsStage', 'meaningCorrect', 'meaningIncorrect', 'readingCorrect', 'readingIncorrect'] as const;

export interface ProgressFile {
  format: string;
  version: number;
  exportedAt: number;
  userLevel: number;
  curriculum: 'WANIKANI' | 'JLPT';
  levelProgression: unknown[];
  subjects: Array<{ id: number } & Record<string, unknown>>;
  probation: unknown[];
  jumps: unknown[];
}

export function buildProgressFile(rows: SubjectProgress[], userLevel: number, now = Date.now()): ProgressFile {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: now,
    userLevel,
    curriculum: 'WANIKANI',
    levelProgression: [],
    subjects: rows.map((r) => {
      const o: { id: number } & Record<string, unknown> = { id: r.id };
      for (const f of SUBJECT_FIELDS) o[f] = r[f];
      return o;
    }),
    probation: [],
    jumps: [],
  };
}

export class ProgressFileError extends Error {}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Parse and fully validate a file before anything is written. Throws ProgressFileError. */
export function parseProgressFile(text: string): ProgressFile {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new ProgressFileError('This is not a KanjiKodama progress file (not JSON).');
  }
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    throw new ProgressFileError('This is not a KanjiKodama progress file.');
  }
  const r = root as Record<string, unknown>;
  if (r.format !== FORMAT && r.format !== LEGACY_FORMAT) throw new ProgressFileError('This is not a KanjiKodama progress file.');
  if (!isInt(r.version) || r.version < 1) throw new ProgressFileError('The progress file has no valid version.');
  if (r.version > VERSION) throw new ProgressFileError('This progress file was made by a newer KanjiKodama.');
  if (!Array.isArray(r.subjects)) throw new ProgressFileError('The progress file has no subject list.');
  for (const key of ['levelProgression', 'probation', 'jumps'] as const) {
    if (r[key] !== undefined && !Array.isArray(r[key])) throw new ProgressFileError(`"${key}" must be a list.`);
  }
  const subjects = r.subjects.map((s, i) => {
    if (typeof s !== 'object' || s === null || !isInt((s as Record<string, unknown>).id)) {
      throw new ProgressFileError(`Subject entry ${i + 1} has no valid id.`);
    }
    const o = s as { id: number } & Record<string, unknown>;
    for (const f of SUBJECT_FIELDS) {
      if (o[f] !== undefined && o[f] !== null && typeof o[f] !== 'number') {
        throw new ProgressFileError(`Subject ${o.id}: "${f}" must be a number.`);
      }
    }
    if (o.srsStage !== undefined && o.srsStage !== null && (!isInt(o.srsStage) || o.srsStage < 0 || o.srsStage > 9)) {
      throw new ProgressFileError(`Subject ${o.id}: srsStage out of range.`);
    }
    return o;
  });
  return {
    format: FORMAT,
    version: r.version,
    exportedAt: typeof r.exportedAt === 'number' ? r.exportedAt : 0,
    userLevel: isInt(r.userLevel) && r.userLevel >= 1 ? r.userLevel : 1,
    curriculum: r.curriculum === 'JLPT' ? 'JLPT' : 'WANIKANI',
    levelProgression: (r.levelProgression as unknown[] | undefined) ?? [],
    subjects,
    probation: (r.probation as unknown[] | undefined) ?? [],
    jumps: (r.jumps as unknown[] | undefined) ?? [],
  };
}

export function describeProgressFile(f: ProgressFile): string {
  return `Saved ${new Date(f.exportedAt).toLocaleString()}, ${f.curriculum === 'JLPT' ? 'JLPT' : 'WaniKani'} order, level ${f.userLevel}, ${f.subjects.length} items with progress.`;
}

/** Replace all local progress with the file's snapshot, atomically. */
export async function restoreProgress(d: KkDb, f: ProgressFile): Promise<void> {
  const rows: SubjectProgress[] = f.subjects.map((s) => {
    const num = (k: (typeof SUBJECT_FIELDS)[number]) => (typeof s[k] === 'number' ? (s[k] as number) : 0);
    return {
      id: s.id,
      srsStage: num('srsStage'),
      meaningCorrect: num('meaningCorrect'),
      meaningIncorrect: num('meaningIncorrect'),
      readingCorrect: num('readingCorrect'),
      readingIncorrect: num('readingIncorrect'),
    };
  });
  await d.transaction('rw', d.progress, d.meta, async () => {
    await d.progress.clear();
    await d.progress.bulkPut(rows);
    await d.meta.put({ key: 'userLevel', value: f.userLevel });
  });
}

export async function exportProgress(d: KkDb, now = Date.now()): Promise<string> {
  const rows = await d.progress.toArray();
  const level = ((await d.meta.get('userLevel'))?.value as number | undefined) ?? 1;
  return JSON.stringify(buildProgressFile(rows, level, now));
}
