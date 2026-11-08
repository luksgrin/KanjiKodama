/**
 * Data of the dashboard panels that `app/dashboardData.ts` doesn't compute, read from the learner:
 * - the level duration (level and the date it was reached: the level progression's, else the
 *   subjects', else now);
 * - recent unlocks, critical condition, burned items;
 * - JLPT and Jōyō progress;
 * - the lesson/review breakdown counts;
 * - the timeline's data sets (by SRS stage, next SRS stage, item type).
 */
import { SUBJECT_TYPE_BY_OBJECT, type ContentSubject } from '../../../core/content';
import { num, progressRow, srsSystemOf, type LearnerDb } from '../../../core/progression';
import type { TimeLine } from '../../../core/dashboard';
import type { Preferences } from '../../../core/settings';
import { DAY, HOUR } from '../../../core/time';

/** A month, in ms. */
export const MONTH = 30 * DAY;

function visible(learner: LearnerDb, s: ContentSubject): boolean {
  return (learner.table.get(s.id)?.hiddenAt ?? s.hiddenAt) === 0;
}

function levelOf(learner: LearnerDb, s: ContentSubject): number {
  return learner.table.get(s.id)?.level ?? s.level;
}

function positionOf(learner: LearnerDb, s: ContentSubject): number {
  return learner.table.get(s.id)?.lessonPosition ?? s.lessonPosition;
}

// --- Level duration ---

export interface LevelDuration {
  level: number;
  since: number;
}

/** The level and the date it was reached. */
export function levelDuration(learner: LearnerDb, now: number): LevelDuration {
  const level = learner.progress.userLevel;
  let since = 0;
  for (const lp of learner.progress.levelProgression.values()) {
    if (Number(lp.level) !== level) continue;
    const unlocked = typeof lp.unlockedAt === 'number' ? lp.unlockedAt : 0;
    const started = typeof lp.startedAt === 'number' ? lp.startedAt : 0;
    const date = unlocked !== 0 ? unlocked : started;
    if (date === 0) continue;
    if (since === 0 || date > since) since = date;
  }
  if (since === 0) {
    let min = 0;
    for (const s of learner.content.subjects) {
      if (!visible(learner, s) || levelOf(learner, s) !== level) continue;
      const u = num(progressRow(learner, s.id), 'unlockedAt');
      if (u !== 0 && (min === 0 || u < min)) min = u;
    }
    since = min;
  }
  if (since === 0) since = now;
  return { level, since };
}

/** `LevelDuration.getDaysAtCurrentLevel`. */
export function daysAtLevel(d: LevelDuration, now: number): number {
  return Math.max(0, now - d.since) / DAY;
}

// --- Subject tables ---

export interface TableSubject {
  subject: ContentSubject;
  /** The right-hand text ("Oct 17", "62%"). */
  extra: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `new SimpleDateFormat("MMM d", Locale.ENGLISH)`. */
export function monthDay(ts: number): string {
  const d = new Date(ts);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

type Cmp = (a: ContentSubject, b: ContentSubject) => number;

function desc(f: (s: ContentSubject) => number): Cmp {
  return (a, b) => f(b) - f(a);
}

function chain(...cmps: Cmp[]): Cmp {
  return (a, b) => {
    for (const c of cmps) {
      const r = c(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}

/** `getRecentUnlocks(now - MONTH)`: newest first, at most 10. */
export function recentUnlocks(learner: LearnerDb, now: number): TableSubject[] {
  const cutoff = now - MONTH;
  const at = (s: ContentSubject) => num(progressRow(learner, s.id), 'unlockedAt');
  return learner.content.subjects
    .filter((s) => visible(learner, s) && at(s) !== 0 && at(s) >= cutoff)
    .sort(chain(desc(at), desc((s) => levelOf(learner, s)), desc((s) => positionOf(learner, s)), desc((s) => s.id)))
    .slice(0, 10)
    .map((s) => ({ subject: s, extra: monthDay(at(s)) }));
}

/** Critical condition items: worst first, at most 10. */
export function criticalCondition(learner: LearnerDb): TableSubject[] {
  const pct = (s: ContentSubject) => num(progressRow(learner, s.id), 'percentageCorrect');
  return learner.content.subjects
    .filter((s) => {
      if (!visible(learner, s)) return false;
      const row = progressRow(learner, s.id);
      const sys = srsSystemOf(learner, s.id);
      const stage = num(row, 'srsStage');
      return stage >= sys.startingStageId && stage < sys.passedStageId && num(row, 'percentageCorrect') < 75
        && num(row, 'unlockedAt') !== 0 && num(row, 'reviewStatisticId') !== 0;
    })
    .sort(chain((a, b) => pct(a) - pct(b), desc((s) => positionOf(learner, s)), desc((s) => s.id)))
    .slice(0, 10)
    .map((s) => ({ subject: s, extra: `${pct(s)}%` }));
}

/** Items burned in the last month: newest first, at most 10. */
export function burnedItems(learner: LearnerDb, now: number): TableSubject[] {
  const cutoff = now - MONTH;
  const at = (s: ContentSubject) => num(progressRow(learner, s.id), 'burnedAt');
  return learner.content.subjects
    .filter((s) => visible(learner, s)
      && num(progressRow(learner, s.id), 'srsStage') === srsSystemOf(learner, s.id).completedStageId
      && at(s) !== 0 && at(s) >= cutoff)
    .sort(chain(desc(at), desc((s) => levelOf(learner, s)), desc((s) => positionOf(learner, s)), desc((s) => s.id)))
    .slice(0, 10)
    .map((s) => ({ subject: s, extra: monthDay(at(s)) }));
}

// --- JLPT / Joyo ---

/** Locked, in progress, passed, burned counts per JLPT level (index level-1) or Joyo grade (index grade-1). */
export interface StageCounts {
  locked: number[];
  prePassed: number[];
  passed: number[];
  burned: number[];
}

function stageCounts(learner: LearnerDb, size: number, key: (s: ContentSubject) => number): StageCounts {
  const out: StageCounts = { locked: Array(size).fill(0), prePassed: Array(size).fill(0), passed: Array(size).fill(0), burned: Array(size).fill(0) };
  for (const s of learner.content.subjects) {
    if (s.object !== 'kanji') continue;
    const k = key(s);
    if (k <= 0 || k > size) continue;
    const stage = srsSystemOf(learner, s.id).getStage(num(progressRow(learner, s.id), 'srsStage'));
    const bucket = stage.isLocked ? out.locked : stage.isCompleted ? out.burned : stage.isPassed ? out.passed : out.prePassed;
    bucket[k - 1] = (bucket[k - 1] ?? 0) + 1;
  }
  return out;
}

export function jlptProgress(learner: LearnerDb): StageCounts {
  return stageCounts(learner, 5, (s) => s.jlptLevel);
}

export function joyoProgress(learner: LearnerDb): StageCounts {
  return stageCounts(learner, 7, (s) => s.joyoGrade);
}

// --- Lesson/review breakdown ---

/** [radical, kanji, vocabulary] counts of current-level and earlier-level lessons and reviews. */
export interface LessonReviewBreakdown {
  lessonCurrent: number[];
  lessonPast: number[];
  reviewCurrent: number[];
  reviewPast: number[];
}

export function lessonReviewBreakdown(learner: LearnerDb, t: TimeLine): LessonReviewBreakdown {
  const userLevel = learner.progress.userLevel;
  const count = (ids: readonly number[], current: boolean): number[] => {
    const out = [0, 0, 0];
    for (const id of ids) {
      const s = learner.content.byId.get(id);
      if (!s) continue;
      const level = levelOf(learner, s);
      if (current ? level !== userLevel : level >= userLevel) continue;
      out[s.object === 'radical' ? 0 : s.object === 'kanji' ? 1 : 2]! += 1;
    }
    return out;
  };
  return {
    lessonCurrent: count(t.availableLessons, true),
    lessonPast: count(t.availableLessons, false),
    reviewCurrent: count(t.availableReviews, true),
    reviewPast: count(t.availableReviews, false),
  };
}

// --- Timeline chart ---

export type TimeLineChartStyle = 'SRS_STAGE' | 'NEXT_SRS_STAGE' | 'ITEM_TYPE';
export type TimeLineChartGridStyle = 'OFF' | 'FOR_BARS' | 'FOR_WATERFALL';

/** `timeline_chart_style`, default SRS_STAGE. */
export function timeLineChartStyle(prefs: Preferences): TimeLineChartStyle {
  const v = prefs.timeline_chart_style;
  return v === 'NEXT_SRS_STAGE' || v === 'ITEM_TYPE' ? v : 'SRS_STAGE';
}

/** `getTimeLineChartGridStyle`: `timeline_chart_grid_style`, default FOR_BARS. */
export function timeLineChartGridStyle(prefs: Preferences): TimeLineChartGridStyle {
  const v = prefs.timeline_chart_grid_style;
  return v === 'OFF' || v === 'FOR_WATERFALL' ? v : 'FOR_BARS';
}

/** `getTimeLineChartSizeShown`: `timeline_chart_size_shown` (a string), default 24. */
export function timeLineChartSizeShown(prefs: Preferences): number {
  const v = prefs.timeline_chart_size_shown;
  const n = typeof v === 'string' && /^[0-9]+$/.test(v) ? Number(v) : typeof v === 'number' ? v : 24;
  return n > 0 ? n : 24;
}

/** `getShowWaterfallLine`: `show_waterfall_line`, default false. */
export function showWaterfallLine(prefs: Preferences): boolean {
  return prefs.show_waterfall_line === true;
}

export interface BarEntry {
  at: number;
  /** Per segment (bottom first). */
  values: number[];
  levelUp: number;
  count: number;
  cumulative: number;
}

export interface TimeLineDataSet {
  entries: BarEntry[];
  /** CSS colours of the segments. */
  colors: string[];
  labels: string[];
  maxBarCount: number;
  totalCount: number;
}

const STAGE_COLORS = ['var(--color-stage-apprentice)', 'var(--color-stage-guru)', 'var(--color-stage-master)', 'var(--color-stage-enlightened)', 'var(--color-stage-burned)'];
const TYPE_COLORS = ['var(--color-radical-strong)', 'var(--color-kanji-strong)', 'var(--color-vocab-strong)'];

export function timeLineDataSet(learner: LearnerDb, t: TimeLine, style: TimeLineChartStyle): TimeLineDataSet {
  const n = style === 'SRS_STAGE' ? 4 : style === 'NEXT_SRS_STAGE' ? 5 : 3;
  const entries: BarEntry[] = [];
  let maxBarCount = 0;
  let totalCount = 0;
  t.slots.forEach((ids, i) => {
    const values = Array<number>(n).fill(0);
    let count = 0;
    for (const id of ids) {
      const s = learner.content.byId.get(id);
      if (!s) continue;
      let bucket: number;
      if (style === 'ITEM_TYPE') {
        const type = SUBJECT_TYPE_BY_OBJECT[s.object];
        bucket = type === 'WANIKANI_RADICAL' ? 0 : type === 'WANIKANI_KANJI' ? 1 : 2;
      } else {
        const stage = srsSystemOf(learner, id).getStage(num(progressRow(learner, id), 'srsStage'));
        bucket = style === 'SRS_STAGE' ? stage.timeLineBarChartBucket : stage.getNewStage(0).timeLineBarChartBucket;
        if (style === 'SRS_STAGE' && bucket === 4) bucket = 3;
      }
      values[Math.max(0, Math.min(n - 1, bucket))]! += 1;
      count++;
    }
    if (count > maxBarCount) maxBarCount = count;
    totalCount += count;
    entries.push({ at: t.firstSlot + i * HOUR, values, levelUp: t.numRequiredForLevelUp[i] ?? 0, count, cumulative: totalCount });
  });
  if (style === 'ITEM_TYPE') return { entries, colors: TYPE_COLORS, labels: ['Radical', 'Kanji', 'Vocabulary'], maxBarCount, totalCount };
  if (style === 'NEXT_SRS_STAGE') {
    return { entries, colors: STAGE_COLORS, labels: ['Apprentice', 'Guru', 'Master', 'Enlightened', 'Burned'], maxBarCount, totalCount };
  }
  return { entries, colors: STAGE_COLORS.slice(0, 4), labels: ['Apprentice', 'Guru', 'Master', 'Enlightened'], maxBarCount, totalCount };
}

/** Rounds a chart maximum up to a tidy interval. */
export function roundUpInterval(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  if (value < 5) return value;
  if (value < 10) return 5;
  return roundUpInterval(Math.trunc((value + 9) / 10)) * 10;
}
