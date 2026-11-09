/**
 * The square you write a kanji in: KanjiVG's 109×109 box as an SVG with pointer events, so a finger,
 * a stylus and a mouse all draw (touch-action none: drawing never scrolls the page).
 *
 * - Written strokes (accepted or revealed) are drawn as the reference stroke: an accepted stroke snaps
 *   to its clean shape.
 * - `ghost` (study mode): the strokes still to write, faint.
 * - `hint`: the next stroke highlighted, drawing itself over and over, with a dot where it starts.
 * - A missed stroke flashes in the error colour and fades.
 * The parent judges each stroke (`onStroke` gets its points in box units) and passes back `written`.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point } from '../../../core/writing';
import { STROKE_BOX, type Stroke } from '../subject/strokePaths';
import './writing.css';

export interface WritingPadProps {
  strokes: readonly Stroke[];
  /** Strokes written so far. */
  written: number;
  ghost: boolean;
  hint: boolean;
  /** Bumped on every missed stroke, with the points of the miss. */
  miss: { key: number; points: readonly Point[] } | null;
  /** All strokes written: the kanji shown whole, no drawing. */
  done: boolean;
  onStroke: (points: Point[]) => void;
  /** Accessible name, e.g. "Writing square, stroke 2 of 5". */
  label: string;
}

const STROKE_WIDTH = 3.2;

function polylinePath(points: readonly Point[]): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
}

export function WritingPad({ strokes, written, ghost, hint, miss, done, onStroke, label }: WritingPadProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef<{ pointerId: number; points: Point[] } | null>(null);
  const [live, setLive] = useState<readonly Point[]>([]);
  const [fading, setFading] = useState<{ key: number; points: readonly Point[] } | null>(null);

  useEffect(() => {
    if (miss === null) return undefined;
    setFading(miss);
    const t = setTimeout(() => setFading((f) => (f?.key === miss.key ? null : f)), 700);
    return () => clearTimeout(t);
  }, [miss]);

  const toBox = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * STROKE_BOX, ((e.clientY - r.top) / r.height) * STROKE_BOX];
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (done || drawing.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture?.(e.pointerId);
    const p = toBox(e);
    drawing.current = { pointerId: e.pointerId, points: [p] };
    setLive([p]);
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drawing.current;
    if (d === null || d.pointerId !== e.pointerId) return;
    e.preventDefault();
    const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [];
    for (const ev of events.length > 0 ? events : [e]) d.points.push(toBox(ev));
    setLive([...d.points]);
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const d = drawing.current;
    if (d === null || d.pointerId !== e.pointerId) return;
    drawing.current = null;
    setLive([]);
    if (e.type === 'pointerup') onStroke(d.points);
  };

  const next = !done && written < strokes.length ? strokes[written] : undefined;
  const start = useMemo(() => next?.contours[0]?.[0] ?? null, [next]);

  // The frame carries the border, so the SVG's box is exactly the writing box (pointer → box units).
  return (
    <div className={`kk-writing-pad${done ? ' kk-writing-pad--done' : ''}`}>
      <svg
        ref={svgRef}
        className="kk-writing-surface"
        viewBox={`0 0 ${STROKE_BOX} ${STROKE_BOX}`}
        role="img"
        aria-label={label}
        data-testid="writing-pad"
        data-written={written}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <g className="kk-writing-guides" aria-hidden="true">
          <line x1={STROKE_BOX / 2} y1={0} x2={STROKE_BOX / 2} y2={STROKE_BOX} />
          <line x1={0} y1={STROKE_BOX / 2} x2={STROKE_BOX} y2={STROKE_BOX / 2} />
        </g>
        <g fill="none" strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
          {ghost && !done && strokes.slice(written).map((s, i) => <path key={`g${written + i}`} d={s.d} className="kk-writing-ghost" />)}
          {strokes.slice(0, done ? strokes.length : written).map((s, i) => (
            <path key={`w${i}`} d={s.d} className={`kk-writing-written${i === written - 1 && !done ? ' kk-writing-snap' : ''}`} pathLength={1} />
          ))}
          {hint && next !== undefined && (
            <path key={`h${written}`} d={next.d} className="kk-writing-hint" pathLength={1} data-testid="writing-hint-stroke" />
          )}
          {fading !== null && <path key={`m${fading.key}`} d={polylinePath(fading.points)} className="kk-writing-miss" />}
          {live.length > 0 && <path d={polylinePath(live)} className="kk-writing-live" />}
        </g>
        {hint && start !== null && <circle className="kk-writing-start" cx={start[0]} cy={start[1]} r={STROKE_WIDTH * 0.9} />}
      </svg>
    </div>
  );
}
