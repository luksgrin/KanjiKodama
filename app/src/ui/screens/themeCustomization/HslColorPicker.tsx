/**
 * An HSL colour picker (300 px high, arcs 14 px wide, indicators 12 px with a 4 px stroke): the hue ring
 * outside (red at the right, clockwise), inside it the saturation arc on the left (grey at the
 * bottom → full colour at the top) and the lightness arc on the right (black at the top → white at
 * the bottom), each with a round indicator filled with the current colour. Dragging an indicator
 * changes that component (`onChange`); letting go reports the end (`onChangeEnd`, where the screen
 * saves). The preview circle
 * (`colorPickerPreview`, 100 dp) sits in the middle.
 */
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

export interface Hsl { h: number; s: number; l: number }

export function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s: Math.min(1, s), l };
}

/** androidx ColorUtils.HSLToColor. */
export function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const m = l - 0.5 * c;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const hi = Math.floor(h / 60) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][hi]!;
  const to = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).toUpperCase().padStart(2, '0');
  return `#${to(r!)}${to(g!)}${to(b!)}`;
}

const SIZE = 300;
const C = SIZE / 2;
const HUE_R = 132;
const INNER_R = 108.5;
const ARC_W = 14;
const IND_R = 12;
/** Arc ranges in degrees, clockwise from the right (screen coordinates). */
const SAT_FROM = 100;
const LIGHT_FROM = 280;
const SWEEP = 155;

type Part = 'hue' | 'sat' | 'light';

function point(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arcPath(r: number, from: number, sweep: number): string {
  const [x1, y1] = point(r, from);
  const [x2, y2] = point(r, from + sweep);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

/** Short arc segments, each in its own colour (an SVG stand-in for the sweep gradients). */
function GradientArc({ r, from, colors }: { r: number; from: number; colors: (t: number) => string }) {
  const n = 40;
  const step = SWEEP / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={arcPath(r, from + i * step, step + 0.6)} stroke={colors((i + 0.5) / n)} strokeWidth={ARC_W} fill="none"
          strokeLinecap={i === 0 || i === n - 1 ? 'round' : 'butt'} />
      ))}
    </g>
  );
}

function angleOf(x: number, y: number): number {
  return ((Math.atan2(y - C, x - C) * 180) / Math.PI + 360) % 360;
}

/** Position on an arc (0..1) for an angle, clamped to its ends. */
function arcValue(angle: number, from: number): number {
  let d = (angle - from + 360) % 360;
  if (d > SWEEP) d = d - SWEEP > (360 - SWEEP) / 2 ? 0 : SWEEP;
  return d / SWEEP;
}

export function HslColorPicker({ color, onChange, onChangeEnd, label }: {
  color: string; onChange(hex: string): void; onChangeEnd(): void; label: string;
}) {
  const hsl = useRef<Hsl>(hexToHsl(color));
  const drag = useRef<Part | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // Follow outside changes (another sample selected, Reset) unless dragging.
  if (drag.current === null && hslToHex(hsl.current) !== color.toUpperCase()) hsl.current = hexToHsl(color);
  const { h, s, l } = hsl.current;

  const local = (e: ReactPointerEvent): [number, number] => {
    const box = svg.current!.getBoundingClientRect();
    const scale = SIZE / box.height;
    return [(e.clientX - box.left - (box.width - box.height) / 2) * scale, (e.clientY - box.top) * scale];
  };
  const update = (part: Part, x: number, y: number) => {
    const a = angleOf(x, y);
    const next = { ...hsl.current };
    if (part === 'hue') next.h = a;
    else if (part === 'sat') next.s = arcValue(a, SAT_FROM);
    else next.l = arcValue(a, LIGHT_FROM);
    hsl.current = next;
    onChange(hslToHex(next));
  };
  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    const [x, y] = local(e);
    const r = Math.hypot(x - C, y - C);
    let part: Part | null = null;
    if (Math.abs(r - HUE_R) <= ARC_W / 2 + IND_R) part = 'hue';
    else if (Math.abs(r - INNER_R) <= ARC_W / 2 + IND_R) {
      const a = angleOf(x, y);
      part = a > 90 && a < 270 ? 'sat' : 'light';
    }
    if (part === null) return;
    drag.current = part;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    update(part, x, y);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current === null) return;
    const [x, y] = local(e);
    update(drag.current, x, y);
  };
  const up = () => {
    if (drag.current === null) return;
    drag.current = null;
    onChangeEnd();
  };

  const indicator = (r: number, deg: number, testId: string) => {
    const [x, y] = point(r, deg);
    return <circle cx={x} cy={y} r={IND_R} fill={color} stroke="#0A335C" strokeWidth={4} data-testid={testId} />;
  };
  const hueStops = [0, 60, 120, 180, 240, 300, 360];

  return (
    <svg ref={svg} className="kk-hsl-picker" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label} data-testid="color-picker"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {/* Hue ring: 6 × 60° gradient segments. */}
      {hueStops.slice(0, -1).map((from, i) => (
        <GradientArcSegment key={from} from={from} to={hueStops[i + 1]!} />
      ))}
      <GradientArc r={INNER_R} from={SAT_FROM} colors={(t) => hslToHex({ h, s: t, l })} />
      <GradientArc r={INNER_R} from={LIGHT_FROM} colors={(t) => hslToHex({ h, s, l: t })} />
      {/* colorPickerPreview: a 100 dp circle in the chosen colour. */}
      <circle cx={C} cy={C} r={50} fill={color} data-testid="picker-preview" />
      {indicator(HUE_R, h, 'picker-hue')}
      {indicator(INNER_R, SAT_FROM + s * SWEEP, 'picker-saturation')}
      {indicator(INNER_R, LIGHT_FROM + l * SWEEP, 'picker-lightness')}
    </svg>
  );
}

function GradientArcSegment({ from, to }: { from: number; to: number }) {
  const n = 12;
  const step = (to - from) / n;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <path key={i} d={arcPath(HUE_R, from + i * step, step + 0.6)} fill="none" strokeWidth={ARC_W}
          stroke={hslToHex({ h: (from + (i + 0.5) * step) % 360, s: 1, l: 0.5 })} />
      ))}
    </g>
  );
}
