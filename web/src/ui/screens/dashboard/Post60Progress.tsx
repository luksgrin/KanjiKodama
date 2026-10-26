/**
 * `Post60ProgressView` (`post60_progress.xml`): "Post-60 progression" (WK.TextView.Normal.Bold,
 * centred, 4 dp padding) over `Post60ProgressBarView`, a 24 dp bar of every subject by SRS stage group
 * (`show_post60_progression`; `show_post60_subsections` splits Apprentice I–IV and Guru I–II,
 * `show_post60_reverse` reverses it). Each segment shows its share as "12.3%" when that fits
 * (text width + 2 dp), else "12%", else nothing, in 12 dp text: colorPrimaryDark on light colours,
 * colorPrimaryLight with the black shadow on dark ones (`ThemeUtil.isLightColor`). No legend, as Java.
 * Drawn on a canvas like the Java view's `onDraw`.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Preferences } from '../../../core/settings';
import { activeTheme, intToHex, parseCustomizations, themePrefsFrom } from '../../theme/themes';

/** `ActiveTheme.stageBucketColors7` / `stageDeepBucketColors` (with the theme customisations). */
export function post60Colors(prefs: Preferences, deep: boolean): string[] {
  const tp = themePrefsFrom(prefs);
  const t = activeTheme(tp);
  const custom = parseCustomizations(tp.customizations[t.id]);
  const c = (i: number, base: string): string => (custom[i] ? intToHex(custom[i]!) : base);
  const seven = t.stage.map((v, i) => c(i + 4, v));
  if (!deep) return seven;
  const pre = t.prePassed.map((v, i) => c(i + 11, v));
  const passed = t.passed.map((v, i) => c(i + 15, v));
  return [seven[0]!, seven[1]!, pre[0]!, pre[1]!, pre[2]!, pre[3]!, passed[0]!, passed[1]!, seven[4]!, seven[5]!, seven[6]!];
}

/** `ThemeUtil.isLightColor`: the channel sum above 0x140. */
export function isLightColor(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return (n & 0xFF) + ((n >> 8) & 0xFF) + ((n >> 16) & 0xFF) > 0x140;
}

/** `Post60ProgressBarView.setBreakdown`: values and colours, reversed when asked. */
export function post60Segments(counts: readonly number[], colors: readonly string[], reversed: boolean): { values: number[]; colors: string[] } {
  const values = [...counts];
  const cols = [...colors];
  if (reversed) { values.reverse(); cols.reverse(); }
  return { values, colors: cols };
}

/** The segment text (`onDraw`): "%.1f%%" when it fits, else "%d%%", else none. */
export function segmentLabel(value: number, total: number, room: number, measure: (s: string) => number, slack: number): string | null {
  const long = `${((value * 100) / total).toFixed(1)}%`;
  if (measure(long) + slack <= room) return long;
  const short = `${Math.trunc((value * 100) / total)}%`;
  if (measure(short) + slack <= room) return short;
  return null;
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v === '' ? fallback : v;
}

export function Post60Progress({ counts, prefs }: { counts: readonly number[]; prefs: Preferences }) {
  const deep = counts.length === 11;
  const { values, colors } = post60Segments(counts, post60Colors(prefs, deep), prefs.show_post60_reverse === true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = canvas.current?.parentElement;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext?.('2d');
    if (!cv || !ctx || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(width * dpr);
    const height = Math.trunc(24 * dpr);
    cv.width = px;
    cv.height = height;
    ctx.clearRect(0, 0, px, height);
    const total = values.reduce((a, b) => a + b, 0);
    if (total === 0) return;
    const dark = cssVar('--color-primary-dark', '#000000');
    const light = cssVar('--kk-muted', '#FFFFFF');
    ctx.font = `${Math.trunc(12 * dpr)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let done = 0;
    values.forEach((value, i) => {
      if (value === 0) return;
      const start = Math.trunc((done * px) / total);
      const end = Math.trunc(((done + value) * px) / total);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = colors[i]!;
      ctx.fillRect(start, 0, end - start, height);
      const isLight = isLightColor(colors[i]!);
      const label = segmentLabel(value, total, end - start, (s) => ctx.measureText(s).width, Math.trunc(2 * dpr));
      if (label !== null) {
        ctx.fillStyle = isLight ? dark : light;
        // paint.setShadowLayer(3, 1, 1, black) in device px (this canvas is device px): Skia's sigma
        // 3 × 0.57735 + 0.5 = 2.23 px; a canvas shadowBlur is 2 sigma.
        if (!isLight) { ctx.shadowColor = '#000000'; ctx.shadowBlur = 4.46; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1; }
        ctx.fillText(label, (start + end) / 2, height / 2);
      }
      done += value;
    });
  }, [values.join(','), colors.join(','), width]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="kk-dash-panel kk-post60" data-testid="post60-progress">
      <h2 className="kk-post60-title">Post-60 progression</h2>
      <canvas ref={canvas} className="kk-post60-bar" aria-label={values.map((v) => String(v)).join(' / ')} />
    </section>
  );
}
