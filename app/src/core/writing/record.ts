/**
 * Writing progress: per kanji or radical, a small spaced-repetition record of its own, separate from
 * the review SRS (never synced, never imported from WaniKani or a server). Pure.
 *
 * Levels 0–5. After writing an item from memory (recall mode):
 * - clean (no miss, no hint, nothing filled in): one level up (at most 5);
 * - with misses only: one level down;
 * - with a hint or a stroke filled in for you: two levels down (at least 0).
 * The first recall of a new item starts from level 0, so a clean first write reaches level 1.
 * Tracing (study mode) counts as practice (attempts, clean, last practised) but never moves the
 * level: copying a shown kanji says little about remembering it. Its first trace creates the record
 * at level 0.
 *
 * Due: `lastPracticed` + the interval of the new level ({@link WRITING_INTERVALS_MS}). Plain epoch
 * milliseconds throughout, so time zones and daylight saving never shift a due time.
 */
import type { WritingMode, WritingResult } from './practice';
import { isClean } from './practice';

export const MAX_WRITING_LEVEL = 5;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Interval after reaching each level: 4 h, 1 d, 3 d, 1 week, 2 weeks, 1 month (30 d). */
export const WRITING_INTERVALS_MS: readonly number[] = [4 * HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];

export interface WritingRecord {
  /** Subject id. */
  readonly id: number;
  readonly attempts: number;
  /** Writes without a miss, hint or filled-in stroke. */
  readonly clean: number;
  /** 0–5. */
  readonly level: number;
  /** Epoch ms of the last write. */
  readonly lastPracticed: number;
  /** Epoch ms when it is due again. */
  readonly nextDue: number;
}

function clampLevel(n: number): number {
  return Math.max(0, Math.min(MAX_WRITING_LEVEL, n));
}

/** The level after a write in recall mode. */
export function nextWritingLevel(level: number, result: WritingResult): number {
  if (isClean(result)) return clampLevel(level + 1);
  if (result.hints > 0 || result.revealed > 0) return clampLevel(level - 2);
  return clampLevel(level - 1);
}

/** The record after writing the item once (`prev` null: never practised). */
export function recordWrite(prev: WritingRecord | null, result: WritingResult, mode: WritingMode, now: number): WritingRecord {
  const from = prev?.level ?? 0;
  const level = mode === 'recall' ? nextWritingLevel(from, result) : from;
  return {
    id: result.id,
    attempts: (prev?.attempts ?? 0) + 1,
    clean: (prev?.clean ?? 0) + (isClean(result) ? 1 : 0),
    level,
    lastPracticed: now,
    nextDue: now + WRITING_INTERVALS_MS[level]!,
  };
}

export function isWritingDue(record: WritingRecord, now: number): boolean {
  return record.nextDue <= now;
}

/** Due items, most overdue first. */
export function dueForWriting(records: Iterable<WritingRecord>, now: number): WritingRecord[] {
  return [...records].filter((r) => isWritingDue(r, now)).sort((a, b) => a.nextDue - b.nextDue || a.id - b.id);
}

/** Practised items, weakest first: lowest level, then lowest clean share, then longest unpractised. */
export function weakestForWriting(records: Iterable<WritingRecord>): WritingRecord[] {
  const share = (r: WritingRecord): number => (r.attempts > 0 ? r.clean / r.attempts : 0);
  return [...records].sort((a, b) => a.level - b.level || share(a) - share(b) || a.lastPracticed - b.lastPracticed || a.id - b.id);
}

/**
 * "due now", "due in 4 hours", "due in 1 day", "due in 2 weeks": rounded to the nearest unit, from the
 * difference only (no calendar dates, so no time zone).
 */
export function dueInText(record: WritingRecord, now: number): string {
  const ms = record.nextDue - now;
  if (ms <= 0) return 'due now';
  const unit = (n: number, word: string): string => `due in ${n} ${word}${n === 1 ? '' : 's'}`;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return unit(Math.max(1, minutes), 'minute');
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return unit(hours, 'hour');
  const days = Math.round(ms / DAY);
  if (days < 14) return unit(days, 'day');
  return unit(Math.round(ms / (7 * DAY)), 'week');
}

/** "✍ Writing: level 3 · 8 clean of 10 · due in 2 days" (the item page line). */
export function writingLine(record: WritingRecord, now: number): string {
  return `✍ Writing: level ${record.level} · ${record.clean} clean of ${record.attempts} · ${dueInText(record, now)}`;
}

/** Of two records of one item, the one practised later (a restore keeps it). Ties keep `current`. */
export function laterRecord(current: WritingRecord | undefined, incoming: WritingRecord): WritingRecord {
  return current !== undefined && current.lastPracticed >= incoming.lastPracticed ? current : incoming;
}

const FIELDS = ['id', 'attempts', 'clean', 'level', 'lastPracticed', 'nextDue'] as const;

/** A stored or file value as a record, or null when it isn't a valid one. */
export function parseWritingRecord(value: unknown): WritingRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const o = value as Record<string, unknown>;
  for (const f of FIELDS) {
    const v = o[f];
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) return null;
  }
  const r = o as unknown as WritingRecord;
  if (r.id === 0 || r.level > MAX_WRITING_LEVEL || r.clean > r.attempts) return null;
  return { id: r.id, attempts: r.attempts, clean: r.clean, level: r.level, lastPracticed: r.lastPracticed, nextDue: r.nextDue };
}

/**
 * The `writing` array of a progress file's text: valid records of known subjects (others are
 * skipped, as a restore skips unknown subjects). A file without it gives [].
 */
export function writingFromProgressFile(json: string, knownIds: ReadonlySet<number>): WritingRecord[] {
  let root: unknown;
  try {
    root = JSON.parse(json);
  } catch {
    return [];
  }
  const list = typeof root === 'object' && root !== null ? (root as Record<string, unknown>).writing : undefined;
  if (!Array.isArray(list)) return [];
  const out = new Map<number, WritingRecord>();
  for (const v of list) {
    const r = parseWritingRecord(v);
    if (r !== null && knownIds.has(r.id)) out.set(r.id, laterRecord(out.get(r.id), r));
  }
  return [...out.values()].sort((a, b) => a.id - b.id);
}
