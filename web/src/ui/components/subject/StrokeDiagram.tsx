/**
 * Stroke order diagram as SVG, like the Java `StrokeDiagramView`: a square of `size` px over KanjiVG's
 * 109×109 box, stroke width size/50, 12 px stroke numbers at the KanjiVG label positions.
 * - Static: every stroke and number in the primary color.
 * - Animated (the `stroke_order_animated` setting, default on): strokes not drawn yet are "ghosts";
 *   each stroke draws in after 200 ms over `length × 5` ms with a pen dot at its tip; the number of
 *   the stroke being drawn is already in the primary color; when all are drawn it lingers 1.5 s and
 *   starts over.
 * - A tap toggles between the two (`onClick` → `setAnimated(!animated)`).
 *
 * Java: `views/StrokeDiagramView`.
 */
import './subject.css';
import { useEffect, useMemo, useState } from 'react';
import {
  parseStrokes,
  pointAt,
  STROKE_BOX,
  STROKE_LINGER_MS,
  STROKE_START_DELAY_MS,
  strokeDurationMs,
} from './strokePaths';

export interface StrokeDiagramProps {
  /** `subject.strokeData` parsed: one path per stroke. */
  strokes: readonly string[];
  /** Width and height in CSS px (`stroke_order_size`, default 250). */
  size?: number;
  /** Start animated (`stroke_order_animated`, default true); a tap toggles it. */
  animated?: boolean;
  className?: string;
}

interface Frame {
  /** Strokes fully drawn. */
  finished: number;
  /** Index of the stroke being drawn, or -1. */
  animating: number;
  /** Drawn fraction of that stroke. */
  fraction: number;
}

/** Stroke order diagram (SVG). */
export function StrokeDiagram({ strokes: strokeData, size = 250, animated: initiallyAnimated = true, className }: StrokeDiagramProps) {
  const strokes = useMemo(() => parseStrokes(strokeData), [strokeData]);
  const n = strokes.length;
  const [animated, setAnimated] = useState(initiallyAnimated);
  const [frame, setFrame] = useState<Frame>({ finished: 0, animating: -1, fraction: 0 });

  useEffect(() => setAnimated(initiallyAnimated), [initiallyAnimated]);

  useEffect(() => {
    if (!animated || n === 0) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;
    let stopped = false;
    const raf$ = (cb: (now: number) => void): number =>
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(() => cb(Date.now()), 16) as unknown as number);
    const now$ = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const step = (i: number): void => {
      if (stopped) return;
      if (i >= n) {
        setFrame({ finished: n, animating: -1, fraction: 0 });
        timer = setTimeout(() => step(0), STROKE_LINGER_MS);
        return;
      }
      setFrame({ finished: i, animating: i, fraction: 0 });
      timer = setTimeout(() => {
        const duration = strokeDurationMs(strokes[i]!);
        const start = now$();
        const tick = (): void => {
          if (stopped) return;
          const f = duration <= 0 ? 1 : Math.min(1, (now$() - start) / duration);
          setFrame({ finished: i, animating: i, fraction: f });
          if (f < 1) raf = raf$(tick);
          else step(i + 1);
        };
        raf = raf$(tick);
      }, STROKE_START_DELAY_MS);
    };
    step(0);
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    };
  }, [animated, n, strokes]);

  if (n === 0) return null;
  const finished = animated ? frame.finished : n;
  const strokeWidth = STROKE_BOX / 50;
  const fontSize = (12 * STROKE_BOX) / size;
  const current = animated && frame.animating >= 0 && frame.animating < n ? strokes[frame.animating]! : null;
  const tip = current === null ? null : pointAt(current, current.length * frame.fraction);

  return (
    <button
      type="button"
      className={`kk-stroke-diagram${className ? ` ${className}` : ''}`}
      onClick={() => setAnimated((a) => !a)}
      aria-pressed={animated}
      aria-label={`Stroke order, ${n} strokes${animated ? ' (animated, tap to stop)' : ' (tap to animate)'}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${STROKE_BOX} ${STROKE_BOX}`} width={size} height={size} aria-hidden="true" focusable="false">
        <g fill="none" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
          {strokes.map((s, i) => (
            <path key={i} d={s.d} className={i < finished ? 'kk-stroke-done' : 'kk-stroke-ghost'} />
          ))}
          {current !== null && (
            <path
              d={current.d}
              className="kk-stroke-done kk-stroke-drawing"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - frame.fraction}
            />
          )}
        </g>
        {tip !== null && <circle className="kk-stroke-tip" cx={tip[0]} cy={tip[1]} r={strokeWidth} />}
        <g fontSize={fontSize} className="kk-stroke-labels">
          {strokes.map((s, i) => (
            <text key={i} x={s.labelX} y={s.labelY} className={i < finished + 1 ? 'kk-stroke-label-done' : 'kk-stroke-label-ghost'}>
              {s.strokeNumber}
            </text>
          ))}
        </g>
      </svg>
    </button>
  );
}
