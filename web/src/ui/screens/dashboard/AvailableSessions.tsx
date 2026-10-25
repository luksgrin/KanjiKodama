/** Lessons and reviews available now, as the two big session buttons (`AvailableSessionsView`). */
import { paths } from '../../routes';
import { useNavigate } from '../../hooks/useRoute';

/** `disabled`: a session runs (Java's `SessionButtonsView` hides the start buttons then; Resume shows instead). */
export function AvailableSessions({ lessons, reviews, disabled = false }: { lessons: number; reviews: number; disabled?: boolean }) {
  const navigate = useNavigate();
  return (
    <div className="kk-sessions">
      <button type="button" className="kk-session lessons" disabled={disabled || lessons === 0} onClick={() => navigate(paths.lessons())}
        aria-label={`Lessons: ${lessons} available`}>
        <span className="kk-session-count" data-testid="lessons-count">{lessons}</span>
        <span className="kk-session-label">Lessons</span>
      </button>
      <button type="button" className="kk-session reviews" disabled={disabled || reviews === 0} onClick={() => navigate(paths.reviews())}
        aria-label={`Reviews: ${reviews} available`}>
        <span className="kk-session-count" data-testid="reviews-count">{reviews}</span>
        <span className="kk-session-label">Reviews</span>
      </button>
    </div>
  );
}
