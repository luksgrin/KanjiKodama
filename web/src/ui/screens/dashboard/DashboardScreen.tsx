/** The dashboard: core panels only (upstream panel selection pending the owner's answer). */
import { useMemo } from 'react';
import { computeDashboard } from '../../../app/dashboardData';
import { useReady } from '../../hooks/useApp';
import { Panel } from '../../components/Panel';
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
  const data = useMemo(() => computeDashboard(learner, prefs, now), [learner, prefs, now, revision]);
  return (
    <div className="kk-dashboard">
      <BackupReminderBanner />
      <AvailableSessions lessons={data.lessons} reviews={data.reviews} />
      <UpcomingReviews text={data.upcomingText} nextReviewAt={data.nextReviewAt} now={now} />
      <Panel title="Review timeline">
        <TimeLineChart slots={data.slots} />
      </Panel>
      <Panel title={`Level ${data.userLevel} progress`}>
        <LevelProgress groups={data.levelProgress} targetLevel={data.targetLevel} />
      </Panel>
      <Panel title="SRS breakdown">
        <SrsBreakdown counts={data.srs} />
      </Panel>
    </div>
  );
}
