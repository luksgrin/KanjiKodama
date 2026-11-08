/**
 * The available sessions: "Lessons: N    Reviews: N" centred, the labels 20 px, the counts 34 px (30 px
 * at 1000+ on screens under 480 px). The session buttons: one centred row with "Start lessons" / "Start reviews"
 * for what is available while no session runs, else the "Resume session" button.
 */
import { paths, sessionRoutePath as sessionPath } from '../../routes';
import { useNavigate } from '../../hooks/useRoute';
import { useActiveSession } from '../../components/session/useSession';

export function AvailableSessions({ lessons, reviews }: { lessons: number; reviews: number }) {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 480;
  const size = (n: number) => (narrow && n >= 1000 ? 'small' : undefined);
  return (
    <div className="kk-available" data-testid="available-sessions">
      <span className="kk-available-item">
        <span className="kk-available-label">Lessons:</span>
        <span className={`kk-available-count ${size(lessons) ?? ''}`} data-testid="lessons-count">{lessons}</span>
      </span>
      <span className="kk-available-item">
        <span className="kk-available-label">Reviews:</span>
        <span className={`kk-available-count ${size(reviews) ?? ''}`} data-testid="reviews-count">{reviews}</span>
      </span>
    </div>
  );
}

export function SessionButtons({ lessons, reviews }: { lessons: number; reviews: number }) {
  const navigate = useNavigate();
  const session = useActiveSession();
  if (session.active) {
    return (
      <div className="kk-session-buttons">
        <button type="button" className="kk-btn" data-testid="resume-session" onClick={() => navigate(sessionPath(session.type))}>
          Resume session
        </button>
      </div>
    );
  }
  if (lessons === 0 && reviews === 0) return null;
  return (
    <div className="kk-session-buttons">
      {lessons > 0 && (
        <button type="button" className="kk-btn" data-testid="start-lessons" onClick={() => navigate(paths.lessons())}>
          Start lessons
        </button>
      )}
      {reviews > 0 && (
        <button type="button" className="kk-btn" data-testid="start-reviews" onClick={() => navigate(paths.reviews())}>
          Start reviews
        </button>
      )}
    </div>
  );
}
