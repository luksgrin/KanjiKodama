/**
 * The review timeline (`views/TimeLineBarChart`), drawn as SVG with the Java geometry (density 1:
 * dp = CSS px): 250 px high, 4 px vertical padding, the y axis and grid lines (`timeline_chart_grid_style`:
 * for the bars, for the waterfall line, or none), one bar per hour stacked by SRS stage, next SRS
 * stage or item type (`timeline_chart_style`), the count above each bar (labels that would overlap are
 * skipped), the level-up count with the arrow above it, time labels every `shown / 6` bars
 * (`TextUtil.formatShortTimeForDisplay`, weekday from the second day on), the optional waterfall line,
 * and the legend below (wrapping onto a second row). With more bars than `timeline_chart_size_shown`
 * the bars scroll sideways under a fixed y axis (drag, as Java's fling/scroll).
 * "No upcoming reviews" in the middle when the timeline is empty.
 */
import { useEffect, useLayoutEffect, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent } from 'react';
import { shortTime } from '../../../app/format';
import { roundUpInterval, type TimeLineChartGridStyle, type TimeLineDataSet } from './panelData';

const HEIGHT = 250;
/** main_activity_view_background: the panel's border box is the 250 dp view minus the 6 dp shadow band,
 *  and its 3 dp outline sits inside it; the drawing keeps Java's view coordinates and the SVG shows the
 *  part inside the outline (250 − 6 − 2 × 3). */
const SHOWN_HEIGHT = HEIGHT - 12;
const PAD = 4;
const FONT = 12;

/** Text width in px (canvas when available, else an estimate for the pixel font). */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, size: number): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      measureCtx = null;
    }
  }
  if (measureCtx) {
    measureCtx.font = `${size}px 'Pixelify Sans', sans-serif`;
    const w = measureCtx.measureText(text).width;
    if (w > 0) return w;
  }
  return text.length * size * 0.6;
}

const ASCENT = -0.93 * FONT;
const DESCENT = 0.24 * FONT;

export interface TimeLineChartProps {
  data: TimeLineDataSet;
  shown: number;
  grid: TimeLineChartGridStyle;
  waterfall: boolean;
}

export function TimeLineChart({ data, shown, grid, waterfall }: TimeLineChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(343);
  const [scroll, setScroll] = useState(0);
  const drag = useRef<{ x: number; start: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => { if (el.clientWidth > 0) setWidth(el.clientWidth); };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { entries, colors, labels, maxBarCount, totalCount } = data;
  const numShown = Math.max(1, Math.min(shown, Math.max(entries.length, 1)));
  const baseWidth = width;
  const baseHeight = HEIGHT - 2 * PAD;

  const originY = PAD + baseHeight - 60;
  const axisSizeY = baseHeight - 108;
  const ppu = maxBarCount > 0 ? (axisSizeY / 1.1) / maxBarCount : 0;
  const ppuCum = totalCount > 0 ? (axisSizeY / 1.1) / totalCount : 0;
  const lineSpacing = Math.max(FONT * 1.2, 10) * 1.8;
  let ppuGrid = ppu;
  let interval = 0;
  let topLabel = '';
  if (grid === 'FOR_WATERFALL') {
    ppuGrid = ppuCum;
    interval = roundUpInterval(Math.ceil(lineSpacing / ppuGrid));
    topLabel = String(Math.trunc((totalCount + interval - 1) / interval) * interval);
  } else if (grid === 'FOR_BARS') {
    interval = roundUpInterval(Math.ceil(lineSpacing / ppuGrid));
    topLabel = String(Math.trunc((maxBarCount + interval - 1) / interval) * interval);
  }
  const labelW = topLabel === '' ? 0 : textWidth(topLabel, FONT);
  const originX = labelW + 12;
  const axisSizeX = baseWidth - labelW - 20;
  const adv = axisSizeX / numShown;
  const maxScroll = Math.max(0, entries.length * adv - axisSizeX);
  const off = Math.min(scroll, maxScroll);

  useEffect(() => { if (scroll > maxScroll) setScroll(maxScroll); }, [scroll, maxScroll]);

  const scrollable = entries.length > numShown;
  const onDown = (e: ReactPointerEvent) => {
    if (!scrollable) return;
    drag.current = { x: e.clientX, start: off };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    setScroll(Math.min(maxScroll, Math.max(0, drag.current.start + drag.current.x - e.clientX)));
  };
  const onUp = () => { drag.current = null; };

  const ariaLabel = `${totalCount} reviews in the next ${entries.length} hours, most in one hour: ${maxBarCount}`;

  if (totalCount === 0) {
    return (
      <div className="kk-dash-panel kk-timeline" ref={ref} data-testid="timeline">
        <svg width="100%" height={SHOWN_HEIGHT} role="img" aria-label="No upcoming reviews">
          <text x={baseWidth / 2} y={HEIGHT / 2} textAnchor="middle" dominantBaseline="middle" className="kk-tl-text" fontSize={16}>
            No upcoming reviews
          </text>
        </svg>
      </div>
    );
  }
  if (axisSizeY <= 0 || axisSizeX <= 0) return <div className="kk-dash-panel kk-timeline" ref={ref} />;

  const visibleX = (x: number) => x >= originX && x <= originX + axisSizeX;

  // Grid.
  const gridEls: JSX.Element[] = [];
  gridEls.push(<line key="axis" x1={originX} y1={originY} x2={originX} y2={originY - axisSizeY} className="kk-tl-line" />);
  if (interval === 0) {
    gridEls.push(<line key="base" x1={originX} y1={originY} x2={originX + axisSizeX} y2={originY} className="kk-tl-line" />);
  } else {
    for (let level = 0; level * ppuGrid < axisSizeY; level += interval) {
      const y = originY - level * ppuGrid;
      gridEls.push(<line key={`g${level}`} x1={originX} y1={y} x2={originX + axisSizeX} y2={y} className="kk-tl-line" />);
      if (level > 0) {
        gridEls.push(
          <text key={`gl${level}`} x={originX - 4} y={y - (ASCENT + DESCENT) / 2} textAnchor="end" fontSize={FONT} className="kk-tl-text">{level}</text>,
        );
      }
    }
  }

  // Bars.
  const bars: JSX.Element[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const left = Math.max(originX, originX + adv * i + adv * 0.075 - off);
    const right = Math.min(originX + axisSizeX, originX + adv * i + adv * 0.925 - off);
    if (right < originX || left > originX + axisSizeX || left > right) continue;
    let bottom = originY;
    e.values.forEach((v, j) => {
      const top = bottom - v * ppu;
      if (v > 0) bars.push(<rect key={`b${i}-${j}`} x={left} y={top} width={right - left} height={bottom - top} fill={colors[j]} />);
      bottom = top;
    });
  }

  // Counts above the bars, lowest bars first, skipping overlaps.
  const counts: JSX.Element[] = [];
  const placed: { l: number; t: number; r: number; b: number }[] = [];
  const sorted = entries.map((e, i) => ({ e, i })).sort((a, b) => a.e.count - b.e.count || a.i - b.i);
  for (const { e, i } of sorted) {
    const x = originX + adv * i + adv / 2 - off;
    const y = originY - e.count * ppu - 1 - DESCENT;
    if (e.count === 0 || !visibleX(x)) continue;
    const text = String(e.count);
    const w = textWidth(text, FONT);
    const rect = { l: x - w / 2 - 1, t: y + ASCENT - 1, r: x + w / 2 + 1, b: y + DESCENT + 1 };
    while (placed.length > 0 && placed[0]!.b <= rect.t) placed.shift();
    if (placed.some((p) => p.l < rect.r && rect.l < p.r && p.t < rect.b && rect.t < p.b)) continue;
    counts.push(<text key={`c${i}`} x={x} y={y} textAnchor="middle" fontSize={FONT} className="kk-tl-text" data-testid="timeline-count">{text}</text>);
    placed.push(rect);
  }

  // Level-up counts and arrows.
  const levelUps: JSX.Element[] = [];
  let lastX = -1;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const x = originX + adv * i + adv / 2 - off;
    if (e.levelUp === 0 || !visibleX(x)) continue;
    const text = String(e.levelUp);
    const w = textWidth(text, 11);
    if (x - w / 2 - 1 < lastX) continue;
    lastX = x + w / 2 + 1;
    const countBaseline = originY - e.count * ppu - 1 - DESCENT;
    const countTop = countBaseline + ASCENT;
    const baseline = countTop - 3 - 0.24 * 11;
    const top = baseline - 0.93 * 11;
    const arrowBottom = top - 1;
    levelUps.push(
      <g key={`l${i}`} className="kk-tl-levelup" data-testid="timeline-levelup">
        <text x={x} y={baseline} textAnchor="middle" fontSize={11}>{text}</text>
        <path transform={`translate(${x - 6} ${arrowBottom - 9})`} d="M6,0.5L0.5,6.5h3.5v2h4v-2h3.5L6,0.5z" />
      </g>,
    );
  }

  // Time labels.
  const step = Math.max(1, Math.trunc(numShown / 6));
  const timeLabels: JSX.Element[] = [];
  for (let i = 0; i < entries.length; i += step) {
    const x = originX + adv * i + adv / 2 - off;
    if (!visibleX(x)) continue;
    timeLabels.push(
      <text key={`t${i}`} x={x} y={originY + 4 - ASCENT} textAnchor="middle" fontSize={FONT} className="kk-tl-text" data-testid="timeline-label">
        {shortTime(entries[i]!.at, i >= 24)}
      </text>,
    );
  }

  // Waterfall line.
  let waterfallPath = '';
  if (waterfall) {
    let prevX = -1;
    let prevY = -1;
    entries.forEach((e, i) => {
      const x = originX + adv * i + adv / 2 - off;
      const y = originY - e.cumulative * ppuCum;
      if (prevX >= originX && x <= originX + axisSizeX) waterfallPath += `M${prevX},${prevY}L${x},${y}`;
      prevX = x;
      prevY = y;
    });
  }

  // Legend.
  const legend: JSX.Element[] = [];
  const left = 12;
  const right = baseWidth - 4;
  let lx = left;
  let boxY = originY + 27;
  let textY = originY + 36;
  labels.forEach((label, i) => {
    const w = textWidth(label, FONT);
    const itemWidth = 8 + 5 + w;
    if (lx > left && lx + itemWidth > right) {
      lx = left;
      boxY += 16;
      textY += 16;
    }
    legend.push(<rect key={`lb${i}`} x={lx} y={boxY} width={8} height={8} fill={colors[i]} />);
    lx += 13;
    legend.push(<text key={`lt${i}`} x={lx} y={textY} fontSize={FONT} className="kk-tl-text">{label}</text>);
    lx += w + 10;
  });

  return (
    <div className="kk-dash-panel kk-timeline" ref={ref} data-testid="timeline">
      <svg
        width="100%"
        height={SHOWN_HEIGHT}
        role="img"
        aria-label={ariaLabel}
        className={scrollable ? 'scrollable' : undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {gridEls}
        {bars}
        {counts}
        {levelUps}
        {timeLabels}
        {waterfallPath !== '' && <path d={waterfallPath} className="kk-tl-waterfall" />}
        {legend}
      </svg>
    </div>
  );
}
