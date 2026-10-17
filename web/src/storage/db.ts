import Dexie, { type EntityTable } from 'dexie';

/** Per-subject progress. Field names follow the subject table columns used in progress files. */
export interface SubjectProgress {
  id: number;
  srsStage: number;
  meaningCorrect: number;
  meaningIncorrect: number;
  readingCorrect: number;
  readingIncorrect: number;
  /** Spike-only extras (not exported). */
  lastAnswer?: string;
  lastAnsweredAt?: number;
  timesAnswered?: number;
}

export interface MetaRow { key: string; value: unknown }

export class KkDb extends Dexie {
  progress!: EntityTable<SubjectProgress, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  constructor(name = 'kanjikodama') {
    super(name);
    this.version(1).stores({ progress: 'id', meta: 'key' });
  }
}

export const db = new KkDb();

export function emptyProgress(id: number): SubjectProgress {
  return { id, srsStage: 0, meaningCorrect: 0, meaningIncorrect: 0, readingCorrect: 0, readingIncorrect: 0, timesAnswered: 0 };
}

/** Spike SRS: correct moves up one stage (max 9), wrong moves down one (min 1 once started). */
export function applyAnswer(p: SubjectProgress, kind: 'meaning' | 'reading', correct: boolean, answer: string, now = Date.now()): SubjectProgress {
  const next: SubjectProgress = { ...p, lastAnswer: answer, lastAnsweredAt: now, timesAnswered: (p.timesAnswered ?? 0) + 1 };
  if (kind === 'meaning') next[correct ? 'meaningCorrect' : 'meaningIncorrect'] += 1;
  else next[correct ? 'readingCorrect' : 'readingIncorrect'] += 1;
  next.srsStage = correct ? Math.min(9, p.srsStage + 1) : Math.max(1, p.srsStage - 1);
  return next;
}

export async function getMeta<T>(key: string, d: KkDb = db): Promise<T | undefined> {
  return (await d.meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown, d: KkDb = db): Promise<void> {
  await d.meta.put({ key, value });
}
