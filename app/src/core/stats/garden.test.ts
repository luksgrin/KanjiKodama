import { describe, expect, it } from 'vitest';
import { emptyDay, type ActivityDay } from './activity';
import { activityTotals, busiestDay, gardenLevel, gardenMonth, gardenYear, recentDays, streaks } from './garden';

function log(...days: [string, number][]): Map<string, ActivityDay> {
  return new Map(days.map(([day, reviews]) => [day, { ...emptyDay(day), reviews, correct: reviews }]));
}

describe('gardenLevel', () => {
  it('grows with the day total', () => {
    expect([0, 1, 19, 20, 59, 60, 149, 150, 1000].map(gardenLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('streaks', () => {
  it('none', () => {
    expect(streaks(new Map(), '2026-11-09')).toEqual({ current: 0, best: 0, studiedToday: false });
  });

  it('a run up to today', () => {
    const l = log(['2026-11-07', 5], ['2026-11-08', 1], ['2026-11-09', 3]);
    expect(streaks(l, '2026-11-09')).toEqual({ current: 3, best: 3, studiedToday: true });
  });

  it('nothing yet today: the run up to yesterday still counts', () => {
    const l = log(['2026-11-07', 5], ['2026-11-08', 1]);
    expect(streaks(l, '2026-11-09')).toEqual({ current: 2, best: 2, studiedToday: false });
  });

  it('a missed day breaks it; the best stays', () => {
    const l = log(['2026-10-01', 1], ['2026-10-02', 1], ['2026-10-03', 1], ['2026-10-04', 1], ['2026-11-08', 1]);
    expect(streaks(l, '2026-11-10')).toEqual({ current: 0, best: 4, studiedToday: false });
    expect(streaks(l, '2026-11-09')).toEqual({ current: 1, best: 4, studiedToday: false });
  });

  it('runs across month and year ends', () => {
    const l = log(['2025-12-30', 1], ['2025-12-31', 1], ['2026-01-01', 1]);
    expect(streaks(l, '2026-01-01').current).toBe(3);
    const leap = log(['2024-02-28', 1], ['2024-02-29', 1], ['2024-03-01', 1]);
    expect(streaks(leap, '2024-03-01').current).toBe(3);
  });

  it('empty days and days after today count for nothing', () => {
    const l = log(['2026-11-08', 0], ['2026-11-09', 2], ['2026-11-10', 9], ['2026-11-11', 9]);
    expect(streaks(l, '2026-11-09')).toEqual({ current: 1, best: 1, studiedToday: true });
  });
});

describe('calendar', () => {
  it('a month in weeks, Sunday first', () => {
    // November 2026 starts on a Sunday and has 30 days: five weeks.
    const m = gardenMonth(log(['2026-11-02', 25], ['2026-11-09', 1]), 2026, 11, '2026-11-09');
    expect(m.weeks).toHaveLength(5);
    expect(m.weeks[0]![0]!.day).toBe('2026-11-01');
    expect(m.weeks[1]![1]).toMatchObject({ day: '2026-11-09', total: 1, level: 1, isToday: true, isFuture: false });
    expect(m.weeks[0]![1]).toMatchObject({ day: '2026-11-02', level: 2 });
    expect(m.weeks[1]![2]).toMatchObject({ day: '2026-11-10', isFuture: true, level: 0 });
    expect(m.weeks[4]!.map((c) => c?.day ?? null)).toEqual(['2026-11-29', '2026-11-30', null, null, null, null, null]);
  });

  it('leading blanks before the first', () => {
    // October 2026 starts on a Thursday.
    const m = gardenMonth(new Map(), 2026, 10, '2026-11-09');
    expect(m.weeks[0]!.slice(0, 4)).toEqual([null, null, null, null]);
    expect(m.weeks[0]![4]!.day).toBe('2026-10-01');
    expect(m.weeks.flat().filter((c) => c !== null)).toHaveLength(31);
  });

  it('a year: twelve months, February of a leap year included', () => {
    const y = gardenYear(new Map(), 2024, '2024-06-01');
    expect(y.map((m) => m.weeks.flat().filter((c) => c !== null).length)).toEqual([31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  it('the recent days, oldest first', () => {
    const r = recentDays(log(['2026-11-09', 2]), '2026-11-09', 7);
    expect(r.map((c) => c.day)).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09']);
    expect(r[6]).toMatchObject({ isToday: true, level: 1 });
  });
});

describe('totals', () => {
  const l = new Map<string, ActivityDay>([
    ['2026-11-01', { day: '2026-11-01', lessons: 5, reviews: 10, correct: 8, incorrect: 2, selfStudy: 0 }],
    ['2026-11-05', { day: '2026-11-05', lessons: 0, reviews: 30, correct: 30, incorrect: 0, selfStudy: 4 }],
    ['2026-10-31', { day: '2026-10-31', lessons: 0, reviews: 0, correct: 0, incorrect: 0, selfStudy: 0 }],
  ]);

  it('everything', () => {
    expect(activityTotals(l)).toEqual({ studyDays: 2, lessons: 5, reviews: 40, correct: 38, incorrect: 2, selfStudy: 4, accuracy: 95 });
  });

  it('a range', () => {
    expect(activityTotals(l, '2026-11-02', '2026-11-30')).toMatchObject({ studyDays: 1, reviews: 30, accuracy: 100 });
    expect(activityTotals(l, '2026-12-01', '2026-12-31').accuracy).toBeNull();
  });

  it('the busiest day', () => {
    expect(busiestDay(l)?.day).toBe('2026-11-05');
    expect(busiestDay(new Map())).toBeNull();
  });
});
