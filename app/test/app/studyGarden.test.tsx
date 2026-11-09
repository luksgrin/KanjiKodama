// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import type { ActivityDay } from '../../src/core/stats';
import { KkDb } from '../../src/storage/db';
import { freshName } from '../progress-storage/helpers';
import { makeApp } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

const day = (d: string, reviews: number, extra: Partial<ActivityDay> = {}): ActivityDay => ({
  day: d, lessons: 0, reviews, correct: reviews, incorrect: 0, selfStudy: 0, ...extra,
});

// T0 is 2026-10-25 09:30 UTC: the study day 2026-10-25 (UTC, day start 4 AM).
const SEED = [
  day('2026-10-01', 3), day('2026-10-02', 3), day('2026-10-03', 3), day('2026-10-04', 3),
  day('2026-10-23', 25, { correct: 20, incorrect: 5 }), day('2026-10-24', 70, { lessons: 5 }),
  day('2026-09-15', 160),
];

async function render(path: string, opts: { seed?: ActivityDay[]; prefs?: Record<string, unknown> } = {}) {
  const dbName = freshName();
  const kk = new KkDb(dbName);
  await kk.open();
  await kk.activity.bulkPut(opts.seed ?? SEED);
  for (const [key, value] of Object.entries(opts.prefs ?? {})) await kk.settings.put({ key, value });
  kk.close();
  const h = makeApp({ dbName });
  await h.app.start();
  container = document.createElement('div');
  document.body.append(container);
  const location = createMemoryLocation(path);
  await act(async () => {
    root = createRoot(container!);
    root.render(<App app={h.app} location={location} />);
  });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { ...h, location, el: container };
}

const $ = (el: HTMLElement, testId: string) => el.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const click = async (el: HTMLElement | null) => {
  expect(el).not.toBeNull();
  await act(async () => { el!.click(); });
};

describe('study garden', () => {
  it('the dashboard panel: streak and the last week; a tap opens the calendar', async () => {
    const { el, location, app } = await render('/');
    // Nothing yet today: the run of the 23rd and 24th still counts.
    expect($(el, 'garden-streak')?.textContent).toBe('Streak 2 days · study today to keep it · best 4 days');
    const levels = ['19', '20', '21', '22', '23', '24', '25'].map((d) => $(el, `garden-day-2026-10-${d}`)?.dataset.level);
    expect(levels).toEqual(['0', '0', '0', '0', '2', '3', '0']);
    await click($(el, 'study-garden'));
    expect(location.get()).toBe('/stats');
    expect($(el, 'stats-screen')).not.toBeNull();
    app.dispose();
  });

  it('can be switched off', async () => {
    const { el, app } = await render('/', { prefs: { show_study_garden: false } });
    expect($(el, 'study-garden')).toBeNull();
    app.dispose();
  });

  it('a first visit invites the first sprout', async () => {
    const { el, app } = await render('/', { seed: [] });
    expect($(el, 'garden-streak')?.textContent).toBe('Plant your first sprout today');
    app.dispose();
  });

  it('the screen: streaks, the month, a day\'s details, the year and the totals', async () => {
    const { el, app } = await render('/stats');
    expect($(el, 'streak-current')?.textContent).toBe('2');
    expect($(el, 'streak-best')?.textContent).toBe('4');
    expect($(el, 'garden-title')?.textContent).toBe('October 2026');
    expect($(el, 'garden-next')?.hasAttribute('disabled')).toBe(true);
    expect($(el, 'garden-cell-2026-10-24')?.dataset.level).toBe('3');
    expect($(el, 'garden-cell-2026-10-26')?.dataset.level).toBe('future');
    expect($(el, 'garden-detail')?.textContent).toBe('Sun 25 Oct 2026: Nothing studied');
    await click($(el, 'garden-cell-2026-10-23'));
    expect($(el, 'garden-detail')?.textContent).toBe('Fri 23 Oct 2026: 25 reviews (80 % right)');
    expect($(el, 'garden-period-totals')?.textContent).toContain('Study days6');
    expect($(el, 'garden-all-totals')?.textContent).toContain('Study days7');

    await click($(el, 'garden-prev'));
    expect($(el, 'garden-title')?.textContent).toBe('September 2026');
    expect($(el, 'garden-cell-2026-09-15')?.dataset.level).toBe('4');

    await click($(el, 'garden-view-year'));
    expect($(el, 'garden-title')?.textContent).toBe('2026');
    expect($(el, 'garden-year')?.querySelectorAll('.kk-garden-mini')).toHaveLength(12);
    expect($(el, 'garden-year')?.querySelectorAll('.kk-garden-dot.l4')).toHaveLength(1);
    await click($(el, 'garden-year')!.querySelectorAll<HTMLElement>('.kk-garden-mini')[9]!); // October
    expect($(el, 'garden-title')?.textContent).toBe('October 2026');
    app.dispose();
  });
});
