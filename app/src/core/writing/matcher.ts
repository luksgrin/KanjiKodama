/**
 * Checks one drawn stroke against a kanji's reference strokes (KanjiVG, flattened to polylines in the
 * 109×109 box). Pure.
 *
 * Both strokes are resampled to {@link SAMPLES} evenly spaced points and compared four ways:
 * - position: the mean distance between corresponding points, in box units;
 * - shape: the same after moving both to their centroid and scaling them to the same size, so a stroke
 *   drawn a little off still counts as the right shape (unitless, 0 = identical);
 * - direction: the cosine between the start → end vectors (strokes have a writing direction);
 * - length: drawn length / reference length.
 *
 * A stroke that fails its expected reference is classified: drawn backwards, one of the strokes still to
 * come (wrong order), the right shape in the wrong place, too short, or simply a different shape.
 */
import { centroid, extent, meanDistance, polylineLength, resample, type Point } from './geometry';

/** Points each stroke is resampled to. */
export const SAMPLES = 32;

/** How lenient the check is. Distances are in box units (the box is 109 wide). */
export interface StrokeTolerance {
  /** Largest mean point distance. */
  readonly position: number;
  /** Largest normalised shape distance. */
  readonly shape: number;
  /** Smallest cosine between the start → end directions. */
  readonly direction: number;
  /** Allowed drawn / reference length ratio. */
  readonly minLength: number;
  readonly maxLength: number;
}

export const DEFAULT_TOLERANCE: StrokeTolerance = {
  position: 14,
  shape: 0.32,
  direction: 0.35,
  minLength: 0.4,
  maxLength: 2.4,
};

/** Reference strokes shorter than this are dots (、 in 犬): only position and size count. */
export const DOT_LENGTH = 14;
/** How much closer (box units) a later stroke must be than the expected one to count as drawn instead. */
export const CLEARLY_BETTER = 3;
/** A drawn stroke shorter than this is a tap, never a stroke. */
export const MIN_DRAWN_LENGTH = 3;

/** How a drawn stroke compares to one reference stroke. */
export interface StrokeComparison {
  readonly position: number;
  readonly shape: number;
  /** Cosine between the start → end vectors; 1 when either stroke is too short to have a direction. */
  readonly direction: number;
  readonly lengthRatio: number;
}

/** Why a stroke was not accepted. */
export type StrokeMiss = 'too-short' | 'reversed' | 'wrong-order' | 'misplaced' | 'wrong-shape';

export interface StrokeVerdict {
  readonly ok: boolean;
  readonly miss: StrokeMiss | null;
  /** For `wrong-order`: the index of the (later) stroke that was drawn instead. */
  readonly resembles: number | null;
  /** The comparison with the expected stroke. */
  readonly comparison: StrokeComparison;
}

/** The shape normalised: centroid at the origin, the larger side of the bounding box 1 long. */
function normalise(points: readonly Point[], size: number): Point[] {
  const [cx, cy] = centroid(points);
  const s = size > 0 ? size : 1;
  return points.map(([x, y]) => [(x - cx) / s, (y - cy) / s] as Point);
}

function directionCosine(a: readonly Point[], b: readonly Point[]): number {
  const ax = a[a.length - 1]![0] - a[0]![0];
  const ay = a[a.length - 1]![1] - a[0]![1];
  const bx = b[b.length - 1]![0] - b[0]![0];
  const by = b[b.length - 1]![1] - b[0]![1];
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  // Hooks and short strokes can nearly close on themselves; their direction says little.
  if (la < 5 || lb < 5) return 1;
  return (ax * bx + ay * by) / (la * lb);
}

/** Compares a drawn stroke with one reference stroke. */
export function compareStroke(drawn: readonly Point[], reference: readonly Point[]): StrokeComparison {
  const d = resample(drawn, SAMPLES);
  const r = resample(reference, SAMPLES);
  if (d.length === 0 || r.length === 0) {
    return { position: Infinity, shape: Infinity, direction: -1, lengthRatio: 0 };
  }
  // Each scaled by its own size (the length ratio checks the size); tiny strokes no smaller than half a dot.
  const dn = normalise(d, Math.max(...extent(d), DOT_LENGTH / 2));
  const rn = normalise(r, Math.max(...extent(r), DOT_LENGTH / 2));
  return {
    position: meanDistance(d, r),
    shape: meanDistance(dn, rn),
    direction: directionCosine(d, r),
    // Measured on the resampled points, so the jitter of a finger or mouse doesn't add length.
    lengthRatio: lengthRatio(d, r),
  };
}

function lengthRatio(drawn: readonly Point[], reference: readonly Point[]): number {
  const ref = polylineLength(reference);
  return ref > 0 ? polylineLength(drawn) / ref : Infinity;
}

function isDot(reference: readonly Point[]): boolean {
  return polylineLength(reference) < DOT_LENGTH;
}

/** Whether a comparison passes, and if not, whether the shape alone would. */
function passes(c: StrokeComparison, dot: boolean, tol: StrokeTolerance, positionScale: number): { ok: boolean; shapeOk: boolean } {
  const shapeOk = dot
    ? c.lengthRatio <= tol.maxLength * 1.5
    : c.shape <= tol.shape && c.direction >= tol.direction && c.lengthRatio >= tol.minLength && c.lengthRatio <= tol.maxLength;
  return { ok: shapeOk && c.position <= tol.position * positionScale, shapeOk };
}

export interface JudgeOptions {
  readonly tolerance?: StrokeTolerance;
  /**
   * Multiplies the position tolerance (1 = default). Writing from memory, the first stroke has nothing
   * on the page to line up with, so it gets more room.
   */
  readonly positionScale?: number;
}

/**
 * Judges a drawn stroke as stroke `expected` of `strokes` (every reference stroke of the kanji, in
 * order). Strokes before `expected` are already written.
 */
export function judgeStroke(
  drawn: readonly Point[],
  strokes: readonly (readonly Point[])[],
  expected: number,
  options: JudgeOptions = {},
): StrokeVerdict {
  const tol = options.tolerance ?? DEFAULT_TOLERANCE;
  const scale = options.positionScale ?? 1;
  const reference = strokes[expected] ?? [];
  const comparison = compareStroke(drawn, reference);
  const verdict = (ok: boolean, miss: StrokeMiss | null, resembles: number | null = null): StrokeVerdict =>
    ({ ok, miss, resembles, comparison });
  const drawnLength = polylineLength(drawn);
  const dot = isDot(reference);

  if (drawnLength < MIN_DRAWN_LENGTH && !dot) return verdict(false, 'too-short');
  const { ok, shapeOk } = passes(comparison, dot, tol, scale);
  if (ok) {
    // In dense kanji a later stroke can be close enough to pass too: the one that fits clearly better wins.
    for (let j = expected + 1; j < strokes.length; j++) {
      const other = compareStroke(drawn, strokes[j]!);
      if (other.position + CLEARLY_BETTER < comparison.position && passes(other, isDot(strokes[j]!), tol, 1).ok) {
        return verdict(false, 'wrong-order', j);
      }
    }
    return verdict(true, null);
  }

  // Backwards: the reversed stroke lines up, the forward one doesn't.
  if (!dot && passes(compareStroke([...drawn].reverse(), reference), dot, tol, scale).ok) return verdict(false, 'reversed');
  // A later stroke drawn first.
  for (let j = expected + 1; j < strokes.length; j++) {
    const other = compareStroke(drawn, strokes[j]!);
    if (passes(other, isDot(strokes[j]!), tol, 1).ok) return verdict(false, 'wrong-order', j);
  }
  if (!dot && comparison.lengthRatio < tol.minLength) return verdict(false, 'too-short');
  if (shapeOk) return verdict(false, 'misplaced');
  return verdict(false, 'wrong-shape');
}

/** A short message for a missed stroke. */
export function missMessage(miss: StrokeMiss): string {
  switch (miss) {
    case 'too-short':
      return 'Too short: draw the whole stroke';
    case 'reversed':
      return 'Right stroke, wrong direction';
    case 'wrong-order':
      return 'That stroke comes later';
    case 'misplaced':
      return 'Right shape, wrong place';
    case 'wrong-shape':
      return 'Not quite: try again';
  }
}
