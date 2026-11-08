/**
 * Five stars for one subject: ★ up to the rating,
 * ☆ after; tapping star n sets n, tapping the current rating clears it. Shown when
 * `enable_star_ratings` is on.
 */
import { nextStarRating } from './starRatings';

export interface StarRatingProps {
  value: number;
  onChange: (stars: number) => void;
  disabled?: boolean;
}

export function StarRating({ value, onChange, disabled }: StarRatingProps) {
  return (
    <div className="kk-star-rating" role="group" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className="kk-star"
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={value >= n}
          disabled={disabled}
          onClick={() => onChange(nextStarRating(value, n))}
        >
          {value >= n ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}
