/**
 * Stroke order data (`subject.strokeData`: one KanjiVG path per stroke, in a 109×109 box, with a
 * custom `T<number>,<x>,<y>` instruction for the stroke number label) turned into plain SVG paths,
 * their lengths and points along them for the animation. Pure.
 *
 * Java: `views/StrokeDiagramView.buildStrokeDataHelper` (path commands M m L l H h V v C c S s Z z
 * and T; others are ignored), `splitCoordinates`, the `PathMeasure` lengths and `getPosTan`.
 */

/** KanjiVG's coordinate box (`StrokeDiagramView.inputRect`). */
export const STROKE_BOX = 109;

export interface Stroke {
  /** Absolute SVG path data (M, L, C, Z only). */
  d: string;
  /** From the `T` instruction (0 when absent). */
  strokeNumber: number;
  labelX: number;
  labelY: number;
  /** Path length in box units (`PathMeasure.getLength`, approximated by flattening curves). */
  length: number;
  /** The flattened path: polylines per contour, for {@link pointAt}. */
  contours: [number, number][][];
}

/** `splitCoordinates`: Java's `-?\d*\.?\d*` matches, empty ones skipped, as floats. */
export function splitCoordinates(s: string): number[] {
  const out: number[] = [];
  for (const m of s.matchAll(/-?\d*\.?\d*/g)) {
    if (m[0] !== '') out.push(Number.parseFloat(m[0]));
  }
  return out.filter((v) => !Number.isNaN(v));
}

const CURVE_STEPS = 24;
const fmt = (v: number): string => String(Math.round(v * 1000) / 1000);

/**
 * Parses one stroke. Like the Java view (which wraps the parse in `safe()`), a malformed instruction
 * stops the parse and keeps what was built so far.
 */
export function parseStroke(pathData: string): Stroke {
  const parts: string[] = [];
  const contours: [number, number][][] = [];
  let strokeNumber = 0;
  let labelX = 0;
  let labelY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastX1 = 0;
  let lastY1 = 0;
  let startX = 0;
  let startY = 0;
  let curve = false;

  const at = (list: number[], i: number): number => {
    const v = list[i];
    if (v === undefined) throw new RangeError('missing coordinate');
    return v;
  };
  const moveTo = (x: number, y: number): void => {
    parts.push(`M${fmt(x)} ${fmt(y)}`);
    contours.push([[x, y]]);
  };
  const contour = (x0: number, y0: number): [number, number][] => {
    if (contours.length === 0) moveTo(x0, y0);
    return contours[contours.length - 1] as [number, number][];
  };
  const lineTo = (x: number, y: number): void => {
    const poly = contour(lastX, lastY);
    parts.push(`L${fmt(x)} ${fmt(y)}`);
    poly.push([x, y]);
  };
  const cubicTo = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x: number, y: number): void => {
    const poly = contour(x0, y0);
    parts.push(`C${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x)} ${fmt(y)}`);
    for (let k = 1; k <= CURVE_STEPS; k++) {
      const t = k / CURVE_STEPS;
      const u = 1 - t;
      poly.push([
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
      ]);
    }
  };

  try {
    for (const m of pathData.matchAll(/([a-zA-Z])([^a-zA-Z]+)/g)) {
      const command = m[1] as string;
      const c = splitCoordinates(m[2] as string);
      switch (command) {
        case 'T':
          strokeNumber = Math.trunc(at(c, 0));
          labelX = at(c, 1);
          labelY = at(c, 2);
          break;
        case 'M':
        case 'm': {
          const x = at(c, 0);
          const y = at(c, 1);
          if (command === 'M') {
            startX = x;
            startY = y;
            lastX = x;
            lastY = y;
          } else {
            startX += x;
            startY += y;
            lastX += x;
            lastY += y;
          }
          moveTo(lastX, lastY);
          break;
        }
        case 'L':
        case 'l': {
          const x = at(c, 0);
          const y = at(c, 1);
          lastX = command === 'L' ? x : lastX + x;
          lastY = command === 'L' ? y : lastY + y;
          lineTo(lastX, lastY);
          break;
        }
        case 'V':
        case 'v':
          for (const y of c) {
            lastY = command === 'V' ? y : lastY + y;
            lineTo(lastX, lastY);
          }
          break;
        case 'H':
        case 'h':
          for (const x of c) {
            lastX = command === 'H' ? x : lastX + x;
            lineTo(lastX, lastY);
          }
          break;
        case 'C':
        case 'c': {
          curve = true;
          for (let i = 0; i + 6 <= c.length; i += 6) {
            const dx = command === 'c' ? lastX : 0;
            const dy = command === 'c' ? lastY : 0;
            const x1 = at(c, i) + dx;
            const y1 = at(c, i + 1) + dy;
            const x2 = at(c, i + 2) + dx;
            const y2 = at(c, i + 3) + dy;
            const x = at(c, i + 4) + dx;
            const y = at(c, i + 5) + dy;
            cubicTo(lastX, lastY, x1, y1, x2, y2, x, y);
            lastX1 = x2;
            lastY1 = y2;
            lastX = x;
            lastY = y;
          }
          break;
        }
        case 'S':
        case 's': {
          curve = true;
          for (let i = 0; i + 4 <= c.length; i += 4) {
            const dx = command === 's' ? lastX : 0;
            const dy = command === 's' ? lastY : 0;
            const x2 = at(c, i) + dx;
            const y2 = at(c, i + 1) + dy;
            const x = at(c, i + 2) + dx;
            const y = at(c, i + 3) + dy;
            const x1 = 2 * lastX - lastX1;
            const y1 = 2 * lastY - lastY1;
            cubicTo(lastX, lastY, x1, y1, x2, y2, x, y);
            lastX1 = x2;
            lastY1 = y2;
            lastX = x;
            lastY = y;
          }
          break;
        }
        case 'Z':
        case 'z': {
          parts.push('Z');
          const open = contours[contours.length - 1];
          if (open !== undefined && open.length > 0) open.push(open[0] as [number, number]);
          moveTo(startX, startY);
          lastX = startX;
          lastY = startY;
          lastX1 = startX;
          lastY1 = startY;
          curve = true;
          break;
        }
        default:
          break;
      }
      if (!curve) {
        lastX1 = lastX;
        lastY1 = lastY;
      }
    }
  } catch {
    // keep what was built (Java: safe())
  }

  let length = 0;
  for (const poly of contours) {
    for (let k = 1; k < poly.length; k++) {
      const [ax, ay] = poly[k - 1] as [number, number];
      const [bx, by] = poly[k] as [number, number];
      length += Math.hypot(bx - ax, by - ay);
    }
  }
  return { d: parts.join(''), strokeNumber, labelX, labelY, length, contours };
}

/** All strokes of a kanji or radical. */
export function parseStrokes(strokeData: readonly string[]): Stroke[] {
  return strokeData.map(parseStroke);
}

/** `PathMeasure.getPosTan(distance)`: the point at that distance along the path (clamped to its ends). */
export function pointAt(stroke: Stroke, distance: number): [number, number] {
  let left = Math.max(0, distance);
  let lastPoint: [number, number] = [0, 0];
  for (const poly of stroke.contours) {
    if (poly.length === 0) continue;
    lastPoint = poly[0] as [number, number];
    for (let k = 1; k < poly.length; k++) {
      const a = poly[k - 1] as [number, number];
      const b = poly[k] as [number, number];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (seg > 0 && left <= seg) {
        const t = left / seg;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      left -= seg;
      lastPoint = b;
    }
  }
  return lastPoint;
}

/** `StrokeDiagramView` animation timing: 200 ms before each stroke, `length × 5` ms to draw it, 1.5 s linger. */
export const STROKE_START_DELAY_MS = 200;
export const STROKE_LINGER_MS = 1500;
export function strokeDurationMs(stroke: Stroke): number {
  return Math.trunc(stroke.length * 5);
}
