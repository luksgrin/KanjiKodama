/**
 * What the dashboard shows, computed from the learner with the core's dashboard functions
 * (`core/dashboard`), at `now`. Pure: screens call it (memoized on the state's `revision` and `now`).
 */
import { SUBJECT_TYPE_BY_OBJECT, type SubjectTypeName } from '../core/content';
import { currentLevelDescription, num, progressRow, type LearnerDb } from '../core/progression';
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
  type LevelProgressBar,
  type TimeLine,
} from '../core/dashboard';
import type { Preferences } from '../core/settings';
import { DAY, HOUR } from '../core/time';
import { waitTimeInformal } from './format';

/** Timeline bar segments (`SubjectType.timeLineBarChartBucket`): radicals, kanji, vocabulary (kana-only included). */
export const TIMELINE_BUCKETS = ['radical', 'kanji', 'vocabulary'] as const;

const BUCKET_OF: Readonly<Record<SubjectTypeName, number>> = {
  WANIKANI_RADICAL: 0,
  WANIKANI_KANJI: 1,
  WANIKANI_VOCAB: 2,
  WANIKANI_KANA_VOCAB: 2,
};

export interface TimeLineSlot {
  /** Start of the hour (epoch ms). */
  at: number;
  /** Reviews per `TIMELINE_BUCKETS` entry. */
  counts: number[];
  /** Of these, how many are needed for the next level-up. */
  levelUp: number;
}

export interface LevelProgressGroup {
  level: number;
  /** JLPT order: "N4, level 2 of 5" (`Curriculum.describeLevel`); null in WaniKani order. */
  block: string | null;
  bars: LevelProgressBar[];
}

export interface DashboardData {
  lessons: number;
  reviews: number;
  /** The `UpcomingReviewsView` line; null when there is nothing to say. */
  upcomingText: string | null;
  /** When the next review that isn't available yet becomes available (0: none scheduled). */
  nextReviewAt: number;
  timeLine: TimeLine;
  /** Hours shown (`timeline_chart_size`). */
  timeLineSize: number;
  slots: TimeLineSlot[];
  levelProgress: LevelProgressGroup[];
  /** Apprentice, Guru, Master, Enlightened, Burned. */
  srs: number[];
  userLevel: number;
  /** The level the level-up target marker belongs to (the user's level). */
  targetLevel: number;
}

/** `UpcomingReviewsView.update` (first-time-setup and vacation-mode branches left out). */
export function upcomingReviewsText(learner: LearnerDb, t: TimeLine, now: number): string | null {
  const size = t.slots.length;
  const sizeDesc = size <= 48 ? `${size}h` : `${Math.trunc(size / 24)}d`;
  const available = t.availableReviews.length;
  const upcoming = numUpcomingReviews(t);
  const longTerm = t.longTermUpcomingReviewDate !== 0;
  const days = (): string => ((t.longTermUpcomingReviewDate - now) / DAY).toFixed(1);
  if (available > 0) {
    if (upcoming > 0) return `${available} reviews available now, ${upcoming} in next ${sizeDesc}`;
    if (longTerm) return `${available} reviews available now, ${t.numLongTermUpcomingReviews} in ${days()} days`;
    return `${available} reviews available now`;
  }
  if (upcoming > 0) {
    const firstSlot = t.slots.slice(1).find((s) => s.length > 0)?.length ?? 0;
    return `${firstSlot} reviews ${waitTimeInformal(upcomingReviewDate(learner, t) - now)}, ${upcoming} upcoming in next ${sizeDesc}`;
  }
  if (longTerm) return `${t.numLongTermUpcomingReviews} reviews available in ${days()} days`;
  return null;
}

export function computeDashboard(learner: LearnerDb, prefs: Preferences, now: number): DashboardData {
  const size = timeLineChartSize(prefs);
  const t = computeTimeLine(learner, now, { size, maxLevel: LOCAL_MAX_LEVEL_GRANTED });
  const slots: TimeLineSlot[] = t.slots.map((ids, i) => {
    const counts = [0, 0, 0];
    for (const id of ids) {
      const s = learner.content.byId.get(id);
      if (s) counts[BUCKET_OF[SUBJECT_TYPE_BY_OBJECT[s.object]]]! += 1;
    }
    return { at: t.firstSlot + i * HOUR, counts, levelUp: t.numRequiredForLevelUp[i] ?? 0 };
  });

  let nextReviewAt = upcomingReviewDate(learner, t);
  if (nextReviewAt === 0 && t.slots[0]) {
    // Slot 0 may still hold reviews later this hour.
    for (const id of t.slots[0]) {
      const at = num(progressRow(learner, id), 'availableAt');
      if (at > now) { nextReviewAt = at; break; }
    }
  }
  if (nextReviewAt === 0) nextReviewAt = t.longTermUpcomingReviewDate;

  const bars = computeLevelProgress(learner, {
    showOverLevelProgression: showOverLevelProgression(prefs),
    limitPreviousLevelProgression: limitPreviousLevelProgression(prefs),
    limitAmount: previousLevelProgressionLimitedAmount(prefs),
    maxLevelGranted: LOCAL_MAX_LEVEL_GRANTED,
  });
  const groups: LevelProgressGroup[] = [];
  for (const bar of bars) {
    let g = groups[groups.length - 1];
    if (!g || g.level !== bar.level) {
      g = { level: bar.level, block: currentLevelDescription(learner, bar.level), bars: [] };
      groups.push(g);
    }
    g.bars.push(bar);
  }

  return {
    lessons: t.availableLessons.length,
    reviews: t.availableReviews.length,
    upcomingText: upcomingReviewsText(learner, t, now),
    nextReviewAt,
    timeLine: t,
    timeLineSize: size,
    slots,
    levelProgress: groups,
    srs: computeSrsBreakdown(learner),
    userLevel: learner.progress.userLevel,
    targetLevel: learner.progress.userLevel,
  };
}
