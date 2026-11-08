/**
 * Node-side view of the built content DB, so tests can answer quiz questions and pick subject ids
 * without hard-coding WaniKani text in tracked files. Read from the e2e build (the same file the
 * browser loads). Never print what comes out of here: it is WaniKani content.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { DIST_DIR } from './paths';

export type SubjectObject = 'radical' | 'kanji' | 'vocabulary' | 'kana_vocabulary';

export interface Subject {
  id: number;
  object: SubjectObject;
  level: number;
  lessonPosition: number;
  characters: string | null;
  slug: string | null;
  meanings: { meaning: string; primary: boolean; accepted_answer: boolean }[];
  readings: { reading: string; primary: boolean; accepted_answer: boolean; type?: string }[];
  hiddenAt: number;
}

let db: Promise<Subject[]> | null = null;

function parse<T>(v: unknown): T[] {
  if (typeof v !== 'string' || v === '') return [];
  const p: unknown = JSON.parse(v);
  return Array.isArray(p) ? (p as T[]) : [];
}

async function load(): Promise<Subject[]> {
  const manifest = JSON.parse(readFileSync(join(DIST_DIR, 'content', 'content-manifest.json'), 'utf8')) as { file: string };
  const require = createRequire(import.meta.url);
  const SQL = await initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) });
  const d: Database = new SQL.Database(readFileSync(join(DIST_DIR, 'content', manifest.file)));
  try {
    const res = d.exec('SELECT id, object, level, lessonPosition, characters, slug, meanings, readings, hiddenAt FROM subject ORDER BY level, lessonPosition, id');
    const rows = res[0]?.values ?? [];
    return rows.map((r) => ({
      id: Number(r[0]),
      object: String(r[1]) as SubjectObject,
      level: Number(r[2]),
      lessonPosition: Number(r[3]),
      characters: r[4] === null ? null : String(r[4]),
      slug: r[5] === null ? null : String(r[5]),
      meanings: parse(r[6]),
      readings: parse(r[7]),
      hiddenAt: Number(r[8] ?? 0),
    }));
  } finally {
    d.close();
  }
}

export function subjects(): Promise<Subject[]> {
  db ??= load();
  return db;
}

/** Visible WaniKani subjects of a level and type, in lesson order. */
export async function subjectsAt(level: number, object: SubjectObject): Promise<Subject[]> {
  return (await subjects()).filter((s) => s.level === level && s.object === object && s.hiddenAt === 0 && s.id < 100000);
}

const TYPE_FOR_TITLE: Record<string, { objects: SubjectObject[]; reading: boolean }> = {
  'Radical Name': { objects: ['radical'], reading: false },
  'Kanji Meaning': { objects: ['kanji'], reading: false },
  'Vocabulary Meaning': { objects: ['vocabulary'], reading: false },
  'Kana Vocabulary Meaning': { objects: ['kana_vocabulary'], reading: false },
  'Kanji Reading': { objects: ['kanji'], reading: true },
  "Kanji On'yomi": { objects: ['kanji'], reading: true },
  "Kanji Kun'yomi": { objects: ['kanji'], reading: true },
  'Vocabulary Reading': { objects: ['vocabulary'], reading: true },
};

export interface QuestionInfo {
  /** The question view's text (characters, or the slug for image radicals). */
  text: string;
  /** The question type banner text (`questionTitle`). */
  title: string;
  /** The `kk-type--<object>` class of the question view. */
  object: SubjectObject;
}

/** The subject a question shows. */
export async function subjectFor(q: QuestionInfo): Promise<Subject> {
  const all = await subjects();
  const match = all.filter((s) => s.object === q.object && (s.characters ?? s.slug ?? '') === q.text);
  if (match.length === 0) throw new Error(`no ${q.object} subject for the question (type ${q.title})`);
  return match[0]!;
}

/** A correct answer for the question: the primary meaning, or the primary accepted reading (kana). */
export async function correctAnswer(q: QuestionInfo): Promise<{ answer: string; reading: boolean }> {
  const t = TYPE_FOR_TITLE[q.title];
  if (t === undefined) throw new Error(`unknown question type ${q.title}`);
  const s = await subjectFor(q);
  if (!t.reading) {
    const m = s.meanings.find((x) => x.primary) ?? s.meanings.find((x) => x.accepted_answer) ?? s.meanings[0];
    if (!m) throw new Error(`subject ${s.id} has no meaning`);
    return { answer: m.meaning, reading: false };
  }
  const r = s.readings.find((x) => x.primary && x.accepted_answer) ?? s.readings.find((x) => x.accepted_answer) ?? s.readings[0];
  if (!r) throw new Error(`subject ${s.id} has no reading`);
  return { answer: r.reading, reading: true };
}
