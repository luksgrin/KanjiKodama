import { describe, expect, it } from 'vitest';
import { HOUR, MINUTE } from '../time';
import {
  addDays,
  civilFromDays,
  countReport,
  dayKeyOfNumber,
  dayNumber,
  daysFromCivil,
  emptyDay,
  isDayKey,
  mergeActivity,
  studyDay,
  studyDayStartHour,
  gardenWeekStart,
  showStudyGarden,
  weekday,
  type ActivityDay,
} from './activity';

const utc = (iso: string): number => Date.parse(iso);

describe('dates', () => {
  it('day numbers round-trip, leap years included', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(daysFromCivil(2000, 3, 1) - daysFromCivil(2000, 2, 28)).toBe(2); // 2000 is a leap year
    expect(daysFromCivil(2100, 3, 1) - daysFromCivil(2100, 2, 28)).toBe(1); // 2100 isn't
    for (const n of [-1000, -1, 0, 1, 11_000, 20_400, 40_000]) {
      const { y, m, d } = civilFromDays(n);
      expect(daysFromCivil(y, m, d)).toBe(n);
    }
    expect(dayKeyOfNumber(daysFromCivil(2026, 11, 9))).toBe('2026-11-09');
  });

  it('day keys: only real dates', () => {
    expect(isDayKey('2024-02-29')).toBe(true);
    expect(isDayKey('2025-02-29')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('2026-1-01')).toBe(false);
    expect(isDayKey('')).toBe(false);
    expect(Number.isNaN(dayNumber('nope'))).toBe(true);
  });

  it('adds days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-11-09', -365)).toBe('2025-11-09');
  });

  it('weekdays, Sunday = 0', () => {
    expect(weekday('2026-11-08')).toBe(0); // a Sunday
    expect(weekday('2026-11-09')).toBe(1);
    expect(weekday('1970-01-01')).toBe(4); // a Thursday
    expect(weekday('1969-12-28')).toBe(0);
  });
});

describe('studyDay', () => {
  it('a new study day starts at the start hour, local time', () => {
    const tokyo = 9 * 60;
    // 2026-11-09 03:59 in Tokyo is still the 8th's study day; 04:00 starts the 9th.
    expect(studyDay(utc('2026-11-08T18:59:00Z'), tokyo, 4)).toBe('2026-11-08');
    expect(studyDay(utc('2026-11-08T19:00:00Z'), tokyo, 4)).toBe('2026-11-09');
    // With midnight as the start, 00:30 is already the 9th.
    expect(studyDay(utc('2026-11-08T15:30:00Z'), tokyo, 0)).toBe('2026-11-09');
    expect(studyDay(utc('2026-11-08T15:30:00Z'), tokyo, 4)).toBe('2026-11-08');
  });

  it('time zones west of UTC', () => {
    const newYork = -5 * 60;
    expect(studyDay(utc('2026-11-10T02:00:00Z'), newYork, 4)).toBe('2026-11-09'); // 21:00 on the 9th
    expect(studyDay(utc('2026-11-10T08:00:00Z'), newYork, 4)).toBe('2026-11-09'); // 03:00 on the 10th
    expect(studyDay(utc('2026-11-10T09:00:00Z'), newYork, 4)).toBe('2026-11-10'); // 04:00 on the 10th
  });

  it('daylight saving: the offset at the moment decides', () => {
    // Berlin, 2026-03-29: clocks jump from 02:00 (+1) to 03:00 (+2). 04:30 local after the change is
    // 02:30Z; the day starts at 04:00 local.
    expect(studyDay(utc('2026-03-29T02:30:00Z'), 120, 4)).toBe('2026-03-29');
    expect(studyDay(utc('2026-03-29T01:30:00Z'), 120, 4)).toBe('2026-03-28'); // 03:30 local
    // 2026-10-25: back from +2 to +1 at 03:00. 03:30 local (+1) is 02:30Z: still the 24th's day.
    expect(studyDay(utc('2026-10-25T02:30:00Z'), 60, 4)).toBe('2026-10-24');
    expect(studyDay(utc('2026-10-25T03:00:00Z'), 60, 4)).toBe('2026-10-25'); // 04:00 local
  });

  it('half-hour zones', () => {
    const india = 5 * 60 + 30;
    const t = utc('2026-11-08T22:30:00Z'); // 04:00 on the 9th in India
    expect(studyDay(t, india, 4)).toBe('2026-11-09');
    expect(studyDay(t - MINUTE, india, 4)).toBe('2026-11-08');
    expect(studyDay(t + 20 * HOUR, india, 4)).toBe('2026-11-09');
  });
});

describe('settings', () => {
  it('study_day_start_hour: 0–23, default 4', () => {
    expect(studyDayStartHour({})).toBe(4);
    expect(studyDayStartHour({ study_day_start_hour: '0' })).toBe(0);
    expect(studyDayStartHour({ study_day_start_hour: '6' })).toBe(6);
    expect(studyDayStartHour({ study_day_start_hour: 23 })).toBe(23);
    expect(studyDayStartHour({ study_day_start_hour: '24' })).toBe(4);
    expect(studyDayStartHour({ study_day_start_hour: 'x' })).toBe(4);
    expect(studyDayStartHour({ study_day_start_hour: -1 })).toBe(4);
  });

  it('garden_week_start: Sunday unless Monday', () => {
    expect(gardenWeekStart({})).toBe(0);
    expect(gardenWeekStart({ garden_week_start: 'MONDAY' })).toBe(1);
    expect(gardenWeekStart({ garden_week_start: 'SUNDAY' })).toBe(0);
    expect(gardenWeekStart({ garden_week_start: 'x' })).toBe(0);
  });

  it('show_study_garden: default on', () => {
    expect(showStudyGarden({})).toBe(true);
    expect(showStudyGarden({ show_study_garden: false })).toBe(false);
  });
});

describe('recording', () => {
  it('counts lessons, right and wrong reviews and self-study', () => {
    let d = emptyDay('2026-11-09');
    d = countReport(d, 'LESSON', 2);
    d = countReport(d, 'REVIEW', 0);
    d = countReport(d, 'REVIEW', 1);
    d = countReport(d, 'REVIEW', 0);
    d = countReport(d, 'SELF_STUDY', 3);
    expect(d).toEqual({ day: '2026-11-09', lessons: 1, reviews: 3, correct: 2, incorrect: 1, selfStudy: 1 });
  });

  it('merging takes the larger counts; reviews stay consistent', () => {
    const a: ActivityDay = { day: '2026-11-09', lessons: 5, reviews: 10, correct: 9, incorrect: 1, selfStudy: 0 };
    const b: ActivityDay = { day: '2026-11-09', lessons: 3, reviews: 12, correct: 6, incorrect: 6, selfStudy: 2 };
    const other: ActivityDay = { day: '2026-11-01', lessons: 1, reviews: 0, correct: 0, incorrect: 0, selfStudy: 0 };
    const m = mergeActivity(new Map([[a.day, a]]), [b, other]);
    expect(m.get('2026-11-09')).toEqual({ day: '2026-11-09', lessons: 5, reviews: 12, correct: 6, incorrect: 6, selfStudy: 2 });
    expect(m.get('2026-11-01')).toEqual(other);
    // Merging the same file again changes nothing.
    expect(mergeActivity(m, [b, other])).toEqual(m);
  });
});
