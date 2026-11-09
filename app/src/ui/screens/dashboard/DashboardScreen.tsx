/**
 * The dashboard, top to bottom: the level line, "Lessons: N  Reviews: N", the upcoming line (the
 * PWA adds the next review time), the start / resume buttons, then the panels the dashboard settings switch on: lesson/review breakdown
 * (`show_lesson_review_breakdown`, off), timeline (`show_timeline`), SRS breakdown
 * (`show_srs_breakdown`), level progression (`show_level_progression`), Jōyō and JLPT progress (off),
 * recent unlocks, critical condition and recently burned items (on).
 *
 * The study garden (`show_study_garden`, on: streak and the last week, a tap opens the calendar)
 * follows the banners, before the other panels.
 *
 * The PWA's own banners (install hint, backup reminder) sit right after the session buttons, so they
 * never push START below the fold on small phones. Not shown: the post-60 progression bar (local
 * mode never gets past level 60), the server error banners (server mode screens), the keyboard help
 * banner (no keyboard help screen in this app).
 */
import { useMemo } from 'react';
import { computeDashboard } from '../../../app/dashboardData';
import { computePost60Breakdown, showLevelProgression, showSrsBreakdown, showTimeLine } from '../../../core/dashboard';
import { currentLevelDescription } from '../../../core/progression';
import { prefBoolean } from '../../../core/settings';
import { showStudyGarden } from '../../../core/stats';
import { useReady } from '../../hooks/useApp';
import { InstallHint } from '../about/InstallHint';
import { AvailableSessions, SessionButtons } from './AvailableSessions';
import { BackupReminderBanner } from './BackupReminderBanner';
import { KeyboardHelpBanner } from './KeyboardHelpBanner';
import { LevelProgress } from './LevelProgress';
import {
  burnedItems,
  criticalCondition,
  daysAtLevel,
  jlptProgress,
  joyoProgress,
  lessonReviewBreakdown,
  levelDuration,
  recentUnlocks,
  showWaterfallLine,
  timeLineChartGridStyle,
  timeLineChartSizeShown,
  timeLineChartStyle,
  timeLineDataSet,
} from './panelData';
import { JlptProgressTable, JoyoProgressTable, LessonReviewBreakdownTable } from './ProgressTables';
import { Post60Progress } from './Post60Progress';
import { SrsBreakdown } from './SrsBreakdown';
import { StudyGarden } from './StudyGarden';
import { SubjectTable } from './SubjectTable';
import { TimeLineChart } from './TimeLineChart';
import { UpcomingReviews } from './UpcomingReviews';
import './dashboard.css';

export function DashboardScreen() {
  const { learner, state, platform } = useReady();
  const { revision, now, prefs } = state;
  const data = useMemo(() => computeDashboard(learner, prefs, now), [learner, prefs, now, revision]);
  const panels = useMemo(() => {
    const style = timeLineChartStyle(prefs);
    return {
      duration: levelDuration(learner, now),
      timeline: timeLineDataSet(learner, data.timeLine, style),
      breakdown: lessonReviewBreakdown(learner, data.timeLine),
      recent: prefBoolean(prefs, 'show_recent_unlocks', true) ? recentUnlocks(learner, now) : [],
      critical: prefBoolean(prefs, 'show_critical_condition', true) ? criticalCondition(learner) : [],
      burned: prefBoolean(prefs, 'show_burned_items', true) ? burnedItems(learner, now) : [],
      jlpt: prefBoolean(prefs, 'show_jlpt_progress', false) ? jlptProgress(learner) : null,
      joyo: prefBoolean(prefs, 'show_joyo_progress', false) ? joyoProgress(learner) : null,
      post60: prefBoolean(prefs, 'show_post60_progression', false)
        ? computePost60Breakdown(learner, prefBoolean(prefs, 'show_post60_subsections', false)) : null,
    };
  }, [learner, prefs, now, revision, data]);

  const level = panels.duration.level;
  const block = state.mode !== 'server' ? currentLevelDescription(learner, level) : null;
  const days = daysAtLevel(panels.duration, now).toFixed(1);
  const tableFont = typeof prefs.font_size_live_subject_table === 'number' ? prefs.font_size_live_subject_table : 16;
  const showBreakdown = prefBoolean(prefs, 'show_lesson_review_breakdown', false) && (data.lessons > 0 || data.reviews > 0);

  return (
    <div className="kk-dashboard">
      <KeyboardHelpBanner />
      <p className="kk-level-duration" data-testid="level-duration">
        You are level {level}{block === null ? '' : ` (${block})`}. Your time on this level is {days} days.
      </p>
      <AvailableSessions lessons={data.lessons} reviews={data.reviews} />
      <UpcomingReviews text={data.upcomingText} nextReviewAt={data.nextReviewAt} showNextReview={!platform.capabilities.notifications} />
      <SessionButtons lessons={data.lessons} reviews={data.reviews} />
      <InstallHint />
      <BackupReminderBanner />
      {showStudyGarden(prefs) && <StudyGarden />}
      {showBreakdown && <LessonReviewBreakdownTable data={panels.breakdown} />}
      {showTimeLine(prefs) && (
        <TimeLineChart data={panels.timeline} shown={timeLineChartSizeShown(prefs)} grid={timeLineChartGridStyle(prefs)} waterfall={showWaterfallLine(prefs)} />
      )}
      {showSrsBreakdown(prefs) && <SrsBreakdown counts={data.srs} systems={learner.srsSystems} />}
      {showLevelProgression(prefs) && data.levelProgress.length > 0 && (
        <LevelProgress bars={data.levelProgress.flatMap((g) => g.bars)} userLevel={data.userLevel} />
      )}
      {panels.post60 !== null && <Post60Progress counts={panels.post60} prefs={prefs} />}
      {panels.joyo !== null && <JoyoProgressTable counts={panels.joyo} />}
      {panels.jlpt !== null && <JlptProgressTable counts={panels.jlpt} />}
      <SubjectTable title="Recent unlocks in the last 30 days" rows={panels.recent} fontSize={tableFont} testId="recent-unlocks" />
      <SubjectTable title="Critical condition items" rows={panels.critical} fontSize={tableFont} testId="critical-condition" />
      <SubjectTable title="Burned items in the last 30 days" rows={panels.burned} fontSize={tableFont} testId="burned-items" />
    </div>
  );
}
