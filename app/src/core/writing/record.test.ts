import { describe, expect, it } from 'vitest';
import { emptyProgress, exportProgress } from '../progressFile';
import {
  dueForWriting, dueInText, isWritingDue, laterRecord, nextWritingLevel, parseWritingRecord, recordWrite, weakestForWriting,
  WRITING_INTERVALS_MS, writingFromProgressFile, writingLine, type WritingRecord, type WritingResult,
} from './index';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 10, 9, 12, 0, 0);

const clean = (id = 1): WritingResult => ({ id, misses: 0, hints: 0, revealed: 0 });
const missed = (id = 1): WritingResult => ({ id, misses: 2, hints: 0, revealed: 0 });
const hinted = (id = 1): WritingResult => ({ id, misses: 0, hints: 1, revealed: 0 });
const filled = (id = 1): WritingResult => ({ id, misses: 3, hints: 0, revealed: 1 });

const rec = (over: Partial<WritingRecord>): WritingRecord =>
  ({ id: 1, attempts: 1, clean: 1, level: 1, lastPracticed: T0, nextDue: T0 + DAY, ...over });

describe('writing levels', () => {
  it('clean: up one, at most 5; misses: down one; hints or filled-in strokes: down two; never below 0', () => {
    expect(nextWritingLevel(0, clean())).toBe(1);
    expect(nextWritingLevel(5, clean())).toBe(5);
    expect(nextWritingLevel(3, missed())).toBe(2);
    expect(nextWritingLevel(3, hinted())).toBe(1);
    expect(nextWritingLevel(3, filled())).toBe(1);
    expect(nextWritingLevel(1, hinted())).toBe(0);
    expect(nextWritingLevel(0, missed())).toBe(0);
  });

  it('the intervals: 4 h, 1 d, 3 d, 1 week, 2 weeks, 30 days', () => {
    expect(WRITING_INTERVALS_MS).toEqual([4 * HOUR, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY]);
  });
});

describe('recordWrite', () => {
  it('a first clean recall: level 1, due a day later', () => {
    expect(recordWrite(null, clean(7), 'recall', T0)).toEqual({ id: 7, attempts: 1, clean: 1, level: 1, lastPracticed: T0, nextDue: T0 + DAY });
  });

  it('a first recall with misses: level 0, due in 4 hours', () => {
    expect(recordWrite(null, missed(7), 'recall', T0)).toMatchObject({ attempts: 1, clean: 0, level: 0, nextDue: T0 + 4 * HOUR });
  });

  it('climbs and falls', () => {
    let r = recordWrite(null, clean(), 'recall', T0);
    r = recordWrite(r, clean(), 'recall', T0 + DAY);
    r = recordWrite(r, clean(), 'recall', T0 + 4 * DAY);
    expect(r).toMatchObject({ attempts: 3, clean: 3, level: 3, nextDue: T0 + 4 * DAY + 7 * DAY });
    r = recordWrite(r, hinted(), 'recall', T0 + 11 * DAY);
    expect(r).toMatchObject({ attempts: 4, clean: 3, level: 1, nextDue: T0 + 12 * DAY });
  });

  it('tracing counts as practice but never moves the level', () => {
    let r = recordWrite(null, clean(), 'study', T0);
    expect(r).toMatchObject({ attempts: 1, clean: 1, level: 0, nextDue: T0 + 4 * HOUR });
    r = recordWrite(rec({ level: 3 }), missed(), 'study', T0 + DAY);
    expect(r).toMatchObject({ attempts: 2, clean: 1, level: 3, nextDue: T0 + DAY + 7 * DAY });
  });

  it('due times are plain milliseconds: the same instant in any time zone, across a DST change', () => {
    // 2026-03-29 01:00 UTC is when Europe switches to summer time; the interval stays exactly 24 h.
    const beforeDst = Date.UTC(2026, 2, 28, 12, 0, 0);
    expect(recordWrite(null, clean(), 'recall', beforeDst).nextDue - beforeDst).toBe(DAY);
  });
});

describe('due and weakest', () => {
  const a = rec({ id: 1, level: 2, nextDue: T0 - HOUR, attempts: 4, clean: 2 });
  const b = rec({ id: 2, level: 0, nextDue: T0 - DAY, attempts: 3, clean: 0 });
  const c = rec({ id: 3, level: 0, nextDue: T0 + DAY, attempts: 2, clean: 1, lastPracticed: T0 - 2 * DAY });
  const d = rec({ id: 4, level: 5, nextDue: T0, attempts: 9, clean: 9 });

  it('due: nextDue reached, most overdue first', () => {
    expect(isWritingDue(d, T0)).toBe(true);
    expect(isWritingDue(c, T0)).toBe(false);
    expect(dueForWriting([a, b, c, d], T0).map((r) => r.id)).toEqual([2, 1, 4]);
  });

  it('weakest: lowest level, then lowest clean share, then practised longest ago', () => {
    expect(weakestForWriting([d, a, c, b]).map((r) => r.id)).toEqual([2, 3, 1, 4]);
  });

  it('the item page line and its due text', () => {
    expect(writingLine(rec({ level: 3, clean: 8, attempts: 10, nextDue: T0 + 2 * DAY }), T0)).toBe('✍ Writing: level 3 · 8 clean of 10 · due in 2 days');
    expect(dueInText(rec({ nextDue: T0 }), T0)).toBe('due now');
    expect(dueInText(rec({ nextDue: T0 + 20 * 60_000 }), T0)).toBe('due in 20 minutes');
    expect(dueInText(rec({ nextDue: T0 + 4 * HOUR }), T0)).toBe('due in 4 hours');
    expect(dueInText(rec({ nextDue: T0 + DAY - 5000 }), T0)).toBe('due in 1 day');
    expect(dueInText(rec({ nextDue: T0 + 30 * DAY }), T0)).toBe('due in 4 weeks');
  });
});

describe('records in the progress file', () => {
  it('a file without writing practice is unchanged; with it, `writing` comes last (after `activity`), sorted by id', () => {
    const state = emptyProgress();
    const plain = exportProgress(state, T0);
    expect(exportProgress(state, T0, undefined, [])).toBe(plain);
    const text = exportProgress(state, T0, undefined, [rec({ id: 9 }), rec({ id: 3, level: 0 })]);
    expect(text.startsWith(plain.slice(0, plain.lastIndexOf('\n}')))).toBe(true);
    const file = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(file).at(-1)).toBe('writing');
    expect((file.writing as WritingRecord[]).map((r) => r.id)).toEqual([3, 9]);
    expect(writingFromProgressFile(text, new Set([3, 9]))).toEqual([rec({ id: 3, level: 0 }), rec({ id: 9 })]);
    const day = { day: '2026-11-09', lessons: 1, reviews: 2, correct: 2, incorrect: 0, selfStudy: 0 };
    const both = JSON.parse(exportProgress(state, T0, new Map([[day.day, day]]), [rec({ id: 3 })])) as Record<string, unknown>;
    expect(Object.keys(both).slice(-2)).toEqual(['activity', 'writing']);
  });

  it('reading a file: unknown subjects and malformed records are skipped; no `writing` gives []', () => {
    const json = JSON.stringify({ writing: [rec({ id: 3 }), rec({ id: 4 }), { id: 5 }, rec({ id: 6, level: 9 }), 'x', rec({ id: 7, clean: 5, attempts: 2 })] });
    expect(writingFromProgressFile(json, new Set([3, 5, 6, 7])).map((r) => r.id)).toEqual([3]);
    expect(writingFromProgressFile('{}', new Set([3]))).toEqual([]);
    expect(writingFromProgressFile('not json', new Set([3]))).toEqual([]);
    expect(parseWritingRecord({ ...rec({}), extra: 1 })).toEqual(rec({}));
  });

  it('a merge keeps the record practised later', () => {
    const old = rec({ lastPracticed: T0, level: 4 });
    const newer = rec({ lastPracticed: T0 + 1, level: 1 });
    expect(laterRecord(old, newer)).toBe(newer);
    expect(laterRecord(newer, old)).toBe(newer);
    expect(laterRecord(undefined, old)).toBe(old);
    expect(laterRecord(old, rec({ lastPracticed: T0, level: 0 }))).toBe(old);
  });
});
