/**
 * Plane geometry for writing practice: polylines in KanjiVG's 109×109 box, resampled to evenly spaced
 * points so two strokes can be compared point by point. Pure.
 */

export type Point = readonly [number, number];

/** Total length of a polyline. */
export function polylineLength(points: readonly Point[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

/**
 * `n` points (n ≥ 2) evenly spaced along the polyline, first and last included. An empty polyline gives
 * []; a single point (or a polyline of zero length) gives n copies of its first point.
 */
export function resample(points: readonly Point[], n: number): Point[] {
  if (points.length === 0) return [];
  const total = polylineLength(points);
  const first = points[0]!;
  if (total === 0 || points.length === 1) return Array.from({ length: n }, () => first);
  const step = total / (n - 1);
  const out: Point[] = [first];
  let seg = 1;
  let segStart = 0; // distance along the polyline where segment `seg` starts
  for (let k = 1; k < n - 1; k++) {
    const target = k * step;
    for (;;) {
      const a = points[seg - 1]!;
      const b = points[seg]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (segStart + len >= target || seg === points.length - 1) {
        const t = len === 0 ? 0 : Math.min(1, (target - segStart) / len);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        break;
      }
      segStart += len;
      seg++;
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** The mean of the points. */
export function centroid(points: readonly Point[]): Point {
  if (points.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

/** Width and height of the bounding box. */
export function extent(points: readonly Point[]): Point {
  if (points.length === 0) return [0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [maxX - minX, maxY - minY];
}

/** Mean distance between corresponding points of two lists of the same length. */
export function meanDistance(a: readonly Point[], b: readonly Point[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.hypot(a[i]![0] - b[i]![0], a[i]![1] - b[i]![1]);
  return sum / n;
}
