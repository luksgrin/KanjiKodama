/**
 * The dashboard (`MainActivity`, `activity_main.xml`) in Java's order: available sessions, upcoming
 * reviews, the session buttons (`SessionButtonsView`: here only "Resume session" while a session runs,
 * since the lesson/review tiles are the start buttons; they are disabled meanwhile, as Java hides its
 * start buttons), the 24h timeline (`show_timeline`), the SRS breakdown (`show_srs_breakdown`) and
 * the level progression (`show_level_progression`). Web build only: the install hint above the panels.
 */
import { useMemo } from 'react';
import { computeDashboard } from '../../../app/dashboardData';
import { showLevelProgression, showSrsBreakdown, showTimeLine } from '../../../core/dashboard';
import { useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { Panel } from '../../components/Panel';
import { sessionPath, useActiveSession } from '../../components/session';
import { InstallHint } from '../about/InstallHint';
import { AvailableSessions } from './AvailableSessions';
import { BackupReminderBanner } from './BackupReminderBanner';
import { LevelProgress } from './LevelProgress';
import { SrsBreakdown } from './SrsBreakdown';
import { TimeLineChart } from './TimeLineChart';
import { UpcomingReviews } from './UpcomingReviews';
import './dashboard.css';

export function DashboardScreen() {
  const { learner, state } = useReady();
  const { revision, now, prefs } = state;
  const navigate = useNavigate();
  const session = useActiveSession();
  const data = useMemo(() => computeDashboard(learner, prefs, now), [learner, prefs, now, revision]);
  return (
    <div className="kk-dashboard">
      <InstallHint />
      <BackupReminderBanner />
      <AvailableSessions lessons={data.lessons} reviews={data.reviews} disabled={session.active} />
      <UpcomingReviews text={data.upcomingText} nextReviewAt={data.nextReviewAt} now={now} />
      {session.active && (
        <div className="kk-resume-row">
          <button type="button" className="kk-btn" data-testid="resume-session" onClick={() => navigate(sessionPath(session.type))}>
            Resume session
          </button>
        </div>
      )}
      {showTimeLine(prefs) && (
        <Panel title="Review timeline">
          <TimeLineChart slots={data.slots} />
        </Panel>
      )}
      {showSrsBreakdown(prefs) && (
        <Panel title="SRS breakdown">
          <SrsBreakdown counts={data.srs} />
        </Panel>
      )}
      {showLevelProgression(prefs) && (
        <Panel title={`Level ${data.userLevel} progress`}>
          <LevelProgress groups={data.levelProgress} targetLevel={data.targetLevel} />
        </Panel>
      )}
    </div>
  );
}
