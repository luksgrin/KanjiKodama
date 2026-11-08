/**
 * The upcoming reviews: the one centred line ("1034 reviews available now, 12 in next 24h", …),
 * hidden when there is nothing to say. Builds without review notifications (the PWA) add the next
 * review time below ("Next review:", medium date and short time); only when a review is scheduled.
 */
import { formatTimestamp } from '../../../app/format';

export function UpcomingReviews({ text, nextReviewAt, showNextReview }: { text: string | null; nextReviewAt: number; showNextReview: boolean }) {
  const next = showNextReview && nextReviewAt !== 0;
  if (text === null && !next) return null;
  return (
    <div className="kk-upcoming">
      {text !== null && <p data-testid="upcoming-text">{text}</p>}
      {next && <p data-testid="next-review">Next review: {formatTimestamp(nextReviewAt)}</p>}
    </div>
  );
}
