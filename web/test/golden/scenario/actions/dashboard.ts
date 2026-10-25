/**
 * `dashboard` (`ScenarioRunner.dashboard`): the timeline, level progress bars and SRS breakdown as the
 * app computes them (`LiveTimeLine`, `LiveLevelProgress`, `LiveSrsBreakDown`).
 *
 * The settings come from `rs.ext.prefs` (the scenario's SharedPreferences, by key, shared with the session
 * actions); without it the Java defaults apply. The step's `settings` are applied there first
 * (`SessionDriver.applyPreferences`: only those keys, null removes one; `resolved.settings` lists them).
 */

import {
  LOCAL_MAX_LEVEL_GRANTED,
  computeLevelProgress,
  computeSrsBreakdown,
  computeTimeLine,
  limitPreviousLevelProgression,
  numUpcomingReviews,
  previousLevelProgressionLimitedAmount,
  showOverLevelProgression,
  timeLineChartSize,
  upcomingReviewDate,
} from '../../../../src/core/dashboard';
import type { PreferenceValue, Preferences } from '../../../../src/core/settings';
import type { ActionHandler } from '../runner';

export const dashboardActions: Record<string, ActionHandler> = {
  dashboard: ({ rs, step, resolved }) => {
    if (step.settings !== undefined && step.settings !== null) {
      const store = (rs.ext.prefs ??= {}) as Record<string, PreferenceValue>;
      const applied: Record<string, PreferenceValue> = {};
      for (const [k, v] of Object.entries(step.settings as Record<string, PreferenceValue>)) {
        applied[k] = v;
        if (v === null || v === undefined) delete store[k];
        else store[k] = v;
      }
      resolved.settings = applied;
    }
    const prefs = (rs.ext.prefs ?? {}) as Preferences;
    const size = timeLineChartSize(prefs);
    const t = computeTimeLine(rs.db, rs.now, { size, maxLevel: LOCAL_MAX_LEVEL_GRANTED });
    const slots: unknown[] = [];
    t.slots.forEach((ids, i) => {
      if (ids.length > 0) slots.push({ slot: i, ids, requiredForLevelUp: t.numRequiredForLevelUp[i] });
    });
    const showOver = showOverLevelProgression(prefs);
    const limit = limitPreviousLevelProgression(prefs);
    return {
      settings: { timeLineChartSize: size, showOverLevelProgression: showOver, limitPreviousLevelProgression: limit },
      userLevel: rs.db.progress.userLevel,
      maxLevelGranted: LOCAL_MAX_LEVEL_GRANTED,
      timeLine: {
        firstSlot: t.firstSlot,
        availableLessons: t.availableLessons,
        availableReviews: t.availableReviews,
        upcomingReviewDate: upcomingReviewDate(rs.db, t),
        numUpcomingReviews: numUpcomingReviews(t),
        slots,
        longTermUpcomingReviewDate: t.longTermUpcomingReviewDate,
        numLongTermUpcomingReviews: t.numLongTermUpcomingReviews,
      },
      levelProgress: computeLevelProgress(rs.db, {
        showOverLevelProgression: showOver,
        limitPreviousLevelProgression: limit,
        limitAmount: previousLevelProgressionLimitedAmount(prefs),
        maxLevelGranted: LOCAL_MAX_LEVEL_GRANTED,
      }),
      srsBreakdown: computeSrsBreakdown(rs.db),
    };
  },
};
