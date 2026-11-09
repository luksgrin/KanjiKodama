/**
 * Which kanji and radicals a writing practice round uses. Pure: the screen passes every candidate with
 * what it needs from the learner's progress.
 */
import { shuffleInPlace, type SeededRandom } from '../rng';

/** What can be written: subjects with KanjiVG strokes. */
export type WritingKind = 'kanji' | 'radical';

export interface WritingCandidate {
  readonly id: number;
  readonly kind: WritingKind;
  /** Its level in the current curriculum. */
  readonly level: number;
  /** In curriculum order within the level. */
  readonly position: number;
  /** Its lesson is done. */
  readonly started: boolean;
  /** 0 without stroke data (image-only radicals): never selected. */
  readonly strokeCount: number;
}

export type WritingScope =
  /** Items whose lesson is done. */
  | { readonly kind: 'learned' }
  /** Every item of one level, learned or not. */
  | { readonly kind: 'level'; readonly level: number };

export const WRITING_ROUND_SIZES = [5, 10, 20, 50] as const;

/**
 * "Due for writing" and "Weakest first": `ordered` (from `dueForWriting` / `weakestForWriting`, in that
 * order) narrowed to the candidates of the given kinds that still have stroke data; at most `limit`.
 */
export function selectFromRecords(
  ordered: readonly { readonly id: number }[],
  candidates: readonly WritingCandidate[],
  limit: number,
  kinds: readonly WritingKind[],
): number[] {
  const usable = new Set(candidates.filter((c) => c.strokeCount > 0 && kinds.includes(c.kind)).map((c) => c.id));
  return ordered.map((r) => r.id).filter((id) => usable.has(id)).slice(0, Math.max(0, limit));
}

/**
 * The candidates of the given kinds in a scope that have stroke data: shuffled (`rnd`), or in
 * curriculum order without it (radicals before kanji within a level, as in lessons); at most `limit`.
 */
export function selectWritingKanji(
  candidates: readonly WritingCandidate[],
  scope: WritingScope,
  limit: number,
  rnd: Pick<SeededRandom, 'nextInt'> | null,
  kinds: readonly WritingKind[] = ['kanji'],
): number[] {
  const matching = candidates.filter((c) => c.strokeCount > 0 && kinds.includes(c.kind)
    && (scope.kind === 'learned' ? c.started : c.level === scope.level));
  const kindOrder = (k: WritingKind): number => (k === 'radical' ? 0 : 1);
  matching.sort((a, b) => a.level - b.level || kindOrder(a.kind) - kindOrder(b.kind) || a.position - b.position || a.id - b.id);
  if (rnd !== null) shuffleInPlace(matching, rnd);
  return matching.slice(0, Math.max(0, limit)).map((c) => c.id);
}
