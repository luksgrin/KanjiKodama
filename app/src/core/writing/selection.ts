/**
 * Which kanji a writing practice round uses. Pure: the screen passes every kanji with what it needs
 * from the learner's progress.
 */
import { shuffleInPlace, type SeededRandom } from '../rng';

export interface WritingCandidate {
  readonly id: number;
  /** The kanji's level in the current curriculum. */
  readonly level: number;
  /** In curriculum order within the level. */
  readonly position: number;
  /** Its lesson is done. */
  readonly started: boolean;
  readonly strokeCount: number;
}

export type WritingScope =
  /** Kanji whose lesson is done. */
  | { readonly kind: 'learned' }
  /** Every kanji of one level, learned or not. */
  | { readonly kind: 'level'; readonly level: number };

export const WRITING_ROUND_SIZES = [5, 10, 20, 50] as const;

/**
 * The kanji of a scope that have stroke data: shuffled (`rnd`), or in curriculum order without it; at
 * most `limit`.
 */
export function selectWritingKanji(
  candidates: readonly WritingCandidate[],
  scope: WritingScope,
  limit: number,
  rnd: Pick<SeededRandom, 'nextInt'> | null,
): number[] {
  const matching = candidates.filter((c) => c.strokeCount > 0
    && (scope.kind === 'learned' ? c.started : c.level === scope.level));
  matching.sort((a, b) => a.level - b.level || a.position - b.position || a.id - b.id);
  if (rnd !== null) shuffleInPlace(matching, rnd);
  return matching.slice(0, Math.max(0, limit)).map((c) => c.id);
}
