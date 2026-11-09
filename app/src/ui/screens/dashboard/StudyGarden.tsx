/**
 * The dashboard's study garden panel (`show_study_garden`, on): the streak and the last seven study
 * days as pixel plants. A tap opens the Study garden screen (calendar, totals).
 */
import { useMemo } from 'react';
import { recentDays, streaks, weekday } from '../../../core/stats';
import { localStudyDay } from '../../../app/studyDay';
import { GardenSprite, gardenLevelName } from '../../components/garden/GardenSprite';
import { WEEKDAY_LETTERS, dayDetail, longDay, streakLine } from '../../components/garden/gardenText';
import { useReady } from '../../hooks/useApp';
import { useNavigate } from '../../hooks/useRoute';
import { paths } from '../../routes';

export function StudyGarden() {
  const { state } = useReady();
  const navigate = useNavigate();
  const { activity, now, prefs } = state;
  const today = localStudyDay(now, prefs);
  const { s, week } = useMemo(() => ({ s: streaks(activity, today), week: recentDays(activity, today, 7) }), [activity, today]);
  return (
    <button type="button" className="kk-dash-panel kk-garden-panel" data-testid="study-garden" onClick={() => navigate(paths.stats())}
      aria-label={`Study garden. ${streakLine(s.current, s.best, s.studiedToday)}. Open the calendar.`}>
      <span className="kk-garden-head">
        <span className="kk-garden-title">Study garden</span>
        <span className="kk-garden-streak" data-testid="garden-streak">{streakLine(s.current, s.best, s.studiedToday)}</span>
      </span>
      <span className="kk-garden-week" aria-hidden="true">
        {week.map((c) => (
          <span key={c.day} className={`kk-garden-week-day${c.isToday ? ' today' : ''}`} title={`${longDay(c.day)}: ${dayDetail(activity.get(c.day))}`}
            data-testid={`garden-day-${c.day}`} data-level={c.level}>
            <GardenSprite level={c.level} label={gardenLevelName(c.level)} />
            {WEEKDAY_LETTERS[weekday(c.day)]}
          </span>
        ))}
      </span>
    </button>
  );
}
