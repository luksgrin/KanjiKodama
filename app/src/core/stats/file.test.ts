import { describe, expect, it } from 'vitest';
import { emptyProgress, exportProgress, restoreProgress } from '../progressFile';
import type { ActivityDay } from './activity';
import { readActivity } from './file';

const NOW = 1762646400000;
const day = (d: string, reviews: number, extra: Partial<ActivityDay> = {}): ActivityDay => ({
  day: d, lessons: 0, reviews, correct: reviews, incorrect: 0, selfStudy: 0, ...extra,
});

describe('activity in the progress file', () => {
  it('no log, or an empty one: the file is unchanged', () => {
    const plain = exportProgress(emptyProgress(), NOW);
    expect(exportProgress(emptyProgress(), NOW, new Map())).toBe(plain);
    expect(exportProgress(emptyProgress(), NOW, new Map([['2026-11-09', day('2026-11-09', 0)]]))).toBe(plain);
    expect(plain).not.toContain('activity');
  });

  it('written after jumps, oldest first, and read back', () => {
    const log = new Map([
      ['2026-11-09', day('2026-11-09', 4, { correct: 3, incorrect: 1, lessons: 5 })],
      ['2026-11-01', day('2026-11-01', 0, { selfStudy: 2 })],
    ]);
    const text = exportProgress(emptyProgress(), NOW, log);
    const keys = Object.keys(JSON.parse(text) as object);
    expect(keys.slice(-2)).toEqual(['jumps', 'activity']);
    expect(text).toContain('"activity": [\n  {\n   "day": "2026-11-01",');
    expect(readActivity(text)).toEqual([log.get('2026-11-01'), log.get('2026-11-09')]);
    // The restore of the progress itself ignores it.
    expect(restoreProgress(text, new Set(), { locale: 'en-US', timeZone: 'UTC' })).toEqual(restoreProgress(exportProgress(emptyProgress(), NOW), new Set(), { locale: 'en-US', timeZone: 'UTC' }));
  });

  it('older files and bad entries: lenient', () => {
    expect(readActivity(exportProgress(emptyProgress(), NOW))).toEqual([]);
    expect(readActivity('not json')).toEqual([]);
    const file = JSON.stringify({
      format: 'kanjikodama-progress', version: 1, subjects: [],
      activity: [
        { day: '2026-11-09', reviews: 2, correct: 2 }, // missing counts are 0
        { day: '2026-02-30', reviews: 1, correct: 1 },
        { day: '2026-11-08', correct: -1 },
        { day: '2026-11-07', correct: 1.5 },
        { day: '2026-11-06', correct: '3' },
        'x',
        { day: '2026-11-05', reviews: 99, correct: 1, incorrect: 2 }, // reviews follow right + wrong
      ],
    });
    expect(readActivity(file)).toEqual([
      day('2026-11-09', 2),
      { day: '2026-11-05', lessons: 0, reviews: 3, correct: 1, incorrect: 2, selfStudy: 0 },
    ]);
    expect(readActivity(JSON.stringify({ activity: {} }))).toEqual([]);
  });
});
