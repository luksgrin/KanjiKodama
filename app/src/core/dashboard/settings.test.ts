import { describe, expect, it } from 'vitest';
import {
  limitPreviousLevelProgression,
  previousLevelProgressionLimitedAmount,
  showLevelProgression,
  showOverLevelProgression,
  showSrsBreakdown,
  showTimeLine,
  timeLineChartSize,
} from './settings';

// No golden scenario changes the dashboard settings (real-progress uses the defaults); these pin the
// GlobalSettings.Dashboard getters' parsing.
describe('dashboard settings', () => {
  it('uses the Java defaults', () => {
    expect(timeLineChartSize({})).toBe(24);
    expect(showOverLevelProgression({})).toBe(false);
    expect(limitPreviousLevelProgression({})).toBe(false);
    expect(previousLevelProgressionLimitedAmount({})).toBe(1);
  });

  it('parses the string settings like Integer.parseInt, falling back on bad values', () => {
    expect(timeLineChartSize({ timeline_chart_size: '48' })).toBe(48);
    expect(timeLineChartSize({ timeline_chart_size: '+12' })).toBe(12);
    expect(timeLineChartSize({ timeline_chart_size: '1.5' })).toBe(24);
    expect(timeLineChartSize({ timeline_chart_size: '99999999999' })).toBe(24);
    expect(previousLevelProgressionLimitedAmount({ previous_level_progression_limit_amount: '3' })).toBe(3);
    expect(previousLevelProgressionLimitedAmount({ previous_level_progression_limit_amount: 'x' })).toBe(1);
  });

  it('reads the boolean settings', () => {
    expect(showOverLevelProgression({ show_over_level_progression: true })).toBe(true);
    expect(limitPreviousLevelProgression({ previous_level_progression_limit: true })).toBe(true);
  });

  it('reads the panel switches, default on', () => {
    expect([showTimeLine({}), showSrsBreakdown({}), showLevelProgression({})]).toEqual([true, true, true]);
    const off = { show_timeline: false, show_srs_breakdown: false, show_level_progression: false };
    expect([showTimeLine(off), showSrsBreakdown(off), showLevelProgression(off)]).toEqual([false, false, false]);
  });
});
