/**
 * The review timeline (`TimeLineBarChart`, item-type segments): one bar per hour slot, stacked by
 * radicals / kanji / vocabulary, the level-up count above, hour labels below.
 */
import { shortTime } from '../../../app/format';
import { TIMELINE_BUCKETS, type TimeLineSlot } from '../../../app/dashboardData';

const BUCKET_LABEL = ['Radicals', 'Kanji', 'Vocabulary'] as const;

export function TimeLineChart({ slots }: { slots: TimeLineSlot[] }) {
  const totals = slots.map((s) => s.counts.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const sum = totals.reduce((a, b) => a + b, 0);
  const labelEvery = slots.length <= 24 ? 3 : slots.length <= 48 ? 6 : 12;
  return (
    <div className="kk-timeline">
      <div className="kk-timeline-scroll">
        <div className="kk-timeline-bars" role="img" style={{ minWidth: `${slots.length * 12}px` }}
          aria-label={`${sum} reviews in the next ${slots.length} hours, most in one hour: ${Math.max(0, ...totals)}`}>
          {slots.map((s, i) => (
            <div className="kk-timeline-col" key={s.at} title={`${shortTime(s.at, i >= 24)}: ${totals[i]}`}>
              <span className="kk-timeline-levelup">{s.levelUp > 0 ? s.levelUp : ''}</span>
              <div className="kk-timeline-bar" style={{ height: `${(totals[i]! / max) * 100}%` }}>
                {TIMELINE_BUCKETS.map((b, j) => (s.counts[j]! > 0
                  ? <span key={b} className={`seg ${b}`} style={{ flexGrow: s.counts[j] }} />
                  : null))}
              </div>
              <span className="kk-timeline-label">{i % labelEvery === 0 ? shortTime(s.at, i >= 24) : ''}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="kk-legend kk-xsmall">
        {TIMELINE_BUCKETS.map((b, j) => <span key={b}><i className={`swatch ${b}`} />{BUCKET_LABEL[j]}</span>)}
        <span className="kk-muted">max {max}/h</span>
      </div>
    </div>
  );
}
