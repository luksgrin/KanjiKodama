/**
 * Reviews (`MainActivity` "Start reviews" → `Session.startNewReviewSession(availableReviews)`): the review
 * quiz with the quick-action row; wrap-up and abandon from the session menu; the summary at the end.
 */
import { SessionScreen } from '../../components/session/SessionScreen';

export function ReviewsScreen() {
  return <SessionScreen kind="REVIEW" start={(rt) => rt.startReviews()} emptyText="No reviews available." />;
}
