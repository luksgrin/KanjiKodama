/**
 * `/stats` (the dashboard's study garden panel): the study calendar as a pixel garden, a month or a
 * year at a time, the current and best streak, the totals of the period shown and of all time, and a
 * legend. A tap on a day shows what was done that day; on the year view a month opens it.
 *
 * Study days start at `study_day_start_hour` (Dashboard settings). The log is local (core
 * `stats/activity.ts`) and travels in the progress file.
 */
import { useMemo, useState } from 'react';
import {
  GARDEN_THRESHOLDS,
  activityTotals,
  dayKeyOfNumber,
  dayTotal,
  daysFromCivil,
  gardenMonth,
  gardenWeekStart,
  gardenYear,
  streaks,
  studyDayStartHour,
  type ActivityLog,
  type ActivityTotals,
  type GardenLevel,
  type GardenMonth,
  type WeekStart,
} from '../../../core/stats';
import { localStudyDay } from '../../../app/studyDay';
import { GardenSprite, gardenLevelName } from '../../components/garden/GardenSprite';
import { MONTH_NAMES, dayDetail, days, longDay, weekdayHeadings } from '../../components/garden/gardenText';
import { useReady } from '../../hooks/useApp';

type View = 'month' | 'year';

function lastDayOf(year: number, month: number): string {
  return dayKeyOfNumber((month === 12 ? daysFromCivil(year + 1, 1, 1) : daysFromCivil(year, month + 1, 1)) - 1);
}

const firstDayOf = (year: number, month: number): string => dayKeyOfNumber(daysFromCivil(year, month, 1));

function Totals({ title, totals, testId }: { title: string; totals: ActivityTotals; testId: string }) {
  return (
    <section className="kk-dash-panel" data-testid={testId}>
      <h2 className="kk-garden-section-title">{title}</h2>
      <dl className="kk-garden-totals">
        <dt>Study days</dt><dd>{totals.studyDays}</dd>
        <dt>Lessons</dt><dd>{totals.lessons}</dd>
        <dt>Reviews</dt><dd>{totals.reviews}</dd>
        <dt>Answered right</dt><dd>{totals.accuracy === null ? '–' : `${totals.accuracy} %`}</dd>
        <dt>Self-study</dt><dd>{totals.selfStudy}</dd>
      </dl>
    </section>
  );
}

function MonthView({ month, log, selected, onSelect, weekStart }: {
  month: GardenMonth; log: ActivityLog; selected: string | null; onSelect: (day: string) => void; weekStart: WeekStart;
}) {
  return (
    <div className="kk-garden-month" role="group" aria-label={`${MONTH_NAMES[month.month - 1]} ${month.year}`} data-testid="garden-month">
      {weekdayHeadings(weekStart).map((l, i) => <span key={i} className="kk-garden-wd" aria-hidden="true" data-testid={`garden-wd-${i}`}>{l}</span>)}
      {month.weeks.flat().map((c, i) => (c === null
        ? <span key={`b${i}`} aria-hidden="true" />
        : (
          <button key={c.day} type="button" className={`kk-garden-cell${c.isToday ? ' today' : ''}`} disabled={c.isFuture}
            aria-pressed={selected === c.day} onClick={() => onSelect(c.day)} data-testid={`garden-cell-${c.day}`} data-level={c.isFuture ? 'future' : c.level}
            aria-label={`${longDay(c.day)}: ${c.isFuture ? 'still to come' : `${gardenLevelName(c.level)}, ${dayDetail(log.get(c.day))}`}`}>
            <GardenSprite level={c.level} future={c.isFuture} />
            <span>{Number(c.day.slice(8))}</span>
          </button>
        )))}
    </div>
  );
}

function YearView({ months, onOpen }: { months: GardenMonth[]; onOpen: (month: number) => void }) {
  return (
    <div className="kk-garden-year" data-testid="garden-year">
      {months.map((m) => (
        <button key={m.month} type="button" className="kk-garden-mini" onClick={() => onOpen(m.month)}
          aria-label={`${MONTH_NAMES[m.month - 1]} ${m.year}: ${m.weeks.flat().filter((c) => c !== null && c.total > 0).length} study days`}>
          <div className="kk-garden-mini-name">{MONTH_NAMES[m.month - 1]!.slice(0, 3)}</div>
          <div className="kk-garden-mini-grid" aria-hidden="true">
            {m.weeks.flat().map((c, i) => (
              <span key={i} className={`kk-garden-dot${c === null ? ' blank' : c.isFuture ? ' future' : ` l${c.level}`}${c?.isToday ? ' today' : ''}`} />
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

const LEVELS: readonly GardenLevel[] = [0, 1, 2, 3, 4];

function legendText(level: GardenLevel): string {
  if (level === 0) return 'Soil: nothing yet';
  const t: readonly number[] = GARDEN_THRESHOLDS;
  const lo = t[level - 1]!;
  const hi = level < t.length ? t[level]! - 1 : null;
  return `${gardenLevelName(level)}: ${hi === null ? `${lo}+` : lo === hi ? `${lo}` : `${lo}–${hi}`}`;
}

export function StatsScreen() {
  const { state } = useReady();
  const { activity, now, prefs } = state;
  const today = localStudyDay(now, prefs);
  const weekStart = gardenWeekStart(prefs);
  const [ty, tm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const [view, setView] = useState<View>('month');
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm);
  const [selected, setSelected] = useState<string | null>(today);

  const s = useMemo(() => streaks(activity, today), [activity, today]);
  const all = useMemo(() => activityTotals(activity), [activity]);
  const first = useMemo(() => firstStudyDay(activity), [activity]);
  const shownMonth = useMemo(() => gardenMonth(activity, year, month, today, weekStart), [activity, year, month, today, weekStart]);
  const shownYear = useMemo(() => gardenYear(activity, year, today, weekStart), [activity, year, today, weekStart]);
  const periodTotals = useMemo(() => (view === 'month'
    ? activityTotals(activity, firstDayOf(year, month), lastDayOf(year, month))
    : activityTotals(activity, `${String(year).padStart(4, '0')}-01-01`, `${String(year).padStart(4, '0')}-12-31`)), [activity, view, year, month]);

  // Nothing to show after today's month / year; before the first study day there is still the past.
  const atEnd = view === 'month' ? year > ty || (year === ty && month >= tm) : year >= ty;
  const step = (dir: -1 | 1) => {
    if (view === 'year') {
      setYear(year + dir);
      return;
    }
    const m = month + dir;
    if (m < 1) {
      setMonth(12);
      setYear(year - 1);
    } else if (m > 12) {
      setMonth(1);
      setYear(year + 1);
    } else setMonth(m);
  };
  const title = view === 'month' ? `${MONTH_NAMES[month - 1]} ${year}` : String(year);
  const prevLabel = view === 'month' ? 'Previous month' : 'Previous year';
  const nextLabel = view === 'month' ? 'Next month' : 'Next year';

  return (
    <div className="kk-garden-screen" data-testid="stats-screen">
      <div className="kk-garden-streaks">
        <div className="kk-dash-panel kk-garden-stat">
          <GardenSprite level={s.current > 0 ? (s.studiedToday ? 4 : 3) : 0} size={40} />
          <span className="kk-garden-stat-value" data-testid="streak-current">{s.current}</span>
          <span className="kk-garden-stat-label">{s.current === 1 ? 'day in a row' : 'days in a row'}{s.current > 0 && !s.studiedToday ? ' (study today to keep it)' : ''}</span>
        </div>
        <div className="kk-dash-panel kk-garden-stat">
          <GardenSprite level={s.best > 0 ? 4 : 0} size={40} />
          <span className="kk-garden-stat-value" data-testid="streak-best">{s.best}</span>
          <span className="kk-garden-stat-label">best streak</span>
        </div>
      </div>

      <div className="kk-garden-tabs" role="group" aria-label="Calendar view">
        <button type="button" className="kk-btn small" aria-pressed={view === 'month'} onClick={() => setView('month')} data-testid="garden-view-month">Month</button>
        <button type="button" className="kk-btn small" aria-pressed={view === 'year'} onClick={() => setView('year')} data-testid="garden-view-year">Year</button>
      </div>

      <section className="kk-dash-panel kk-garden-calendar">
        <div className="kk-garden-nav">
          <button type="button" onClick={() => step(-1)} aria-label={prevLabel} data-testid="garden-prev">‹</button>
          <h2 data-testid="garden-title">{title}</h2>
          <button type="button" onClick={() => step(1)} aria-label={nextLabel} disabled={atEnd} data-testid="garden-next">›</button>
        </div>
        {view === 'month'
          ? <MonthView month={shownMonth} log={activity} selected={selected} onSelect={setSelected} weekStart={weekStart} />
          : <YearView months={shownYear} onOpen={(m) => { setMonth(m); setView('month'); }} />}
        {view === 'month' && (
          <p className="kk-garden-detail" aria-live="polite" data-testid="garden-detail">
            {selected === null ? 'Tap a day to see what you studied.' : `${longDay(selected)}: ${dayDetail(activity.get(selected))}`}
          </p>
        )}
      </section>

      <Totals title={view === 'month' ? `${MONTH_NAMES[month - 1]} ${year}` : String(year)} totals={periodTotals} testId="garden-period-totals" />
      <Totals title="All time" totals={all} testId="garden-all-totals" />

      <section className="kk-dash-panel">
        <h2 className="kk-garden-section-title">How the garden grows</h2>
        <p className="kk-garden-note">Each day grows with what you finish: lessons, reviews and self-study items. A study day starts at {hourText(studyDayStartHour(prefs))}.</p>
        <ul className="kk-garden-legend">
          {LEVELS.map((l) => <li key={l}><GardenSprite level={l} size={24} />{legendText(l)}</li>)}
        </ul>
        {first !== null && <p className="kk-garden-note after">Studied on {days(all.studyDays)} so far, since {longDay(first)}.</p>}
      </section>
    </div>
  );
}

function firstStudyDay(log: ActivityLog): string | null {
  let first: string | null = null;
  for (const d of log.values()) if (dayTotal(d) > 0 && (first === null || d.day < first)) first = d.day;
  return first;
}

/** "midnight", "4 AM". */
export function hourText(h: number): string {
  if (h === 0) return 'midnight';
  return h < 12 ? `${h} AM` : h === 12 ? 'noon' : `${h - 12} PM`;
}
