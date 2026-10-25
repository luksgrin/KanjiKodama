/** The upcoming-reviews line (`UpcomingReviewsView`) and the next review time (the PWA's stand-in for notifications). */
import { shortTime, waitTimeInformal } from '../../../app/format';
import { DAY } from '../../../core/time';

export function UpcomingReviews({ text, nextReviewAt, now }: { text: string | null; nextReviewAt: number; now: number }) {
  return (
    <div className="kk-upcoming">
      {text !== null && <p data-testid="upcoming-text">{text}</p>}
      <p className="kk-small kk-muted" data-testid="next-review">
        {nextReviewAt === 0
          ? 'No reviews scheduled yet.'
          : `Next review: ${shortTime(nextReviewAt, nextReviewAt - now >= DAY / 2)} (${waitTimeInformal(nextReviewAt - now)})`}
      </p>
    </div>
  );
}
