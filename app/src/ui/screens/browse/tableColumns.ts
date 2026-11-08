/**
 * A table whose columns shrink to fit, for the advanced search's two-column CSS grid:
 * each column is as wide as its widest cell; when both don't fit, every column gives up the same
 * amount, so long labels wrap evenly.
 */
import { useLayoutEffect, useRef } from 'react';

export function tableColumns(natural: readonly number[], available: number): number[] {
  const total = natural.reduce((a, b) => a + b, 0);
  if (total <= available) return [...natural];
  const extra = (available - total) / natural.length;
  return natural.map((w) => Math.max(0, w + extra));
}

export function useTableColumns<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    let frame = 0;
    const layout = () => {
      // Natural widths: max-content columns with unwrapped labels.
      el.classList.add('kk-table-measure');
      el.style.gridTemplateColumns = 'max-content max-content';
      const natural = getComputedStyle(el).gridTemplateColumns.split(' ').map(parseFloat);
      el.classList.remove('kk-table-measure');
      const available = el.clientWidth;
      if (natural.length !== 2 || natural.some((n) => !Number.isFinite(n)) || available <= 0) {
        el.style.gridTemplateColumns = '';
        return;
      }
      el.style.gridTemplateColumns = tableColumns(natural, available).map((w) => `${w}px`).join(' ');
    };
    layout();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    });
    ro?.observe(el.parentElement ?? el);
    void document.fonts?.ready.then(layout);
    return () => { ro?.disconnect(); cancelAnimationFrame(frame); };
  });
  return ref;
}
