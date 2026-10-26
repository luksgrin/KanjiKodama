// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { formatTimestamp } from '../../src/app/format';
import { createMemoryLocation } from '../../src/app/router';
import { updateProgress } from '../../src/core/progression';
import { DAY, HOUR } from '../../src/core/time';
import { daysAtLevel, monthDay, roundUpInterval } from '../../src/ui/screens/dashboard/panelData';
import { srsBreakdownTags } from '../../src/ui/screens/dashboard/SrsBreakdown';
import { fallbackSrsSystems } from '../../src/core/srs';
import { fakePlatform, makeApp, T0 } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

async function render(path = '/', opts: { setup?: 'default' | 'none'; notifications?: boolean } = {}) {
  const h = makeApp(opts.notifications ? { platform: fakePlatform({}, { notifications: true }) } : {});
  await h.app.start();
  if (opts.setup !== 'none') {
    // Radical 1 passed and due now; radical 2 started, due in 3 hours.
    await h.app.write((ldb, now) => {
      updateProgress(ldb, 1, { startedAt: now - 10 * HOUR, srsStage: 5, passedAt: now - HOUR, availableAt: now - HOUR });
      updateProgress(ldb, 2, { startedAt: now - 10 * HOUR, srsStage: 1, availableAt: now + 3 * HOUR });
    });
  }
  container = document.createElement('div');
  document.body.append(container);
  const location = createMemoryLocation(path);
  await act(async () => {
    root = createRoot(container!);
    root.render(<App app={h.app} location={location} />);
  });
  return { ...h, location, el: container };
}

const text = (el: HTMLElement, testId: string): string | null => el.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null;
const has = (el: HTMLElement, testId: string): boolean => el.querySelector(`[data-testid="${testId}"]`) !== null;

describe('dashboard', () => {
  it('shows the Java panels in Java order', async () => {
    const { el, app } = await render();
    expect(text(el, 'level-duration')).toMatch(/^You are level 1\. Your time on this level is \d+\.\d days\.$/);
    expect(text(el, 'available-sessions')).toBe('Lessons:0Reviews:1');
    expect(text(el, 'reviews-count')).toBe('1');
    expect(text(el, 'lessons-count')).toBe('0');
    expect(text(el, 'upcoming-text')).toBe('1 reviews available now, 1 in next 24h');
    // PWA (no notifications): the next review in Java's "Next review:" format.
    expect(text(el, 'next-review')).toBe(`Next review: ${formatTimestamp(T0 + 3 * HOUR)}`);
    // One start button for what is available.
    expect(has(el, 'start-reviews')).toBe(true);
    expect(has(el, 'start-lessons')).toBe(false);
    expect(el.querySelector('[data-testid="level-1"]')?.textContent).toBe('Lvl 1 radicals');
    expect(text(el, 'srs-apprentice')).toBe('1');
    expect(text(el, 'srs-guru')).toBe('1');
    expect(text(el, 'srs-burned')).toBe('0');
    expect([...el.querySelectorAll('.kk-srs-name')].map((n) => n.textContent)).toEqual(['Apprentice', 'Guru', 'Master', 'Enlightened', 'Burned']);
    // Timeline: SRS-stage legend (the default style), the count above the bar of hour 3.
    const legend = [...el.querySelectorAll('[data-testid="timeline"] text')].map((t) => t.textContent);
    expect(legend).toEqual(expect.arrayContaining(['Apprentice', 'Guru', 'Master', 'Enlightened']));
    // Hour 0 (the review due now) and hour 3.
    expect([...el.querySelectorAll('[data-testid="timeline-count"]')].map((t) => t.textContent)).toEqual(['1', '1']);
    expect(el.querySelectorAll('[data-testid="timeline-label"]')).toHaveLength(6);
    // Panel order: sessions, (banners), timeline, SRS, level progression, recent unlocks.
    const order = ['level-duration', 'available-sessions', 'upcoming-text', 'start-reviews', 'backup-reminder', 'timeline',
      'srs-breakdown', 'level-progress', 'recent-unlocks'].map((id) => el.querySelector(`[data-testid="${id}"]`));
    expect(order.every((n) => n !== null)).toBe(true);
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(el.querySelector('.kk-bottomnav')).toBeNull();
    app.dispose();
  });

  it('shows no "No reviews scheduled" text while reviews are due and none upcoming', async () => {
    const { el, app } = await render('/', { setup: 'none' });
    await act(async () => {
      await app.write((ldb, now) => {
        updateProgress(ldb, 1, { startedAt: now - 10 * HOUR, srsStage: 1, availableAt: now - HOUR });
        updateProgress(ldb, 2, { startedAt: now - 10 * HOUR, srsStage: 1, availableAt: now - HOUR });
      });
    });
    expect(text(el, 'upcoming-text')).toBe('2 reviews available now');
    expect(el.textContent).not.toContain('No reviews scheduled');
    expect(has(el, 'next-review')).toBe(false);
    app.dispose();
  });

  it('leaves the next review line out where notifications exist (Android)', async () => {
    const { el, app } = await render('/', { notifications: true });
    expect(has(el, 'next-review')).toBe(false);
    expect(text(el, 'upcoming-text')).toBe('1 reviews available now, 1 in next 24h');
    app.dispose();
  });

  it('re-renders after a write; Resume replaces the start buttons while a session runs', async () => {
    const { el, app } = await render();
    await act(async () => {
      await app.write((ldb, now) => updateProgress(ldb, 2, { availableAt: now - 1 }));
    });
    expect(text(el, 'reviews-count')).toBe('2');
    app.dispose();
  });

  it('lists recent unlocks, critical condition and burned items', async () => {
    const { el, app } = await render();
    await act(async () => {
      await app.write((ldb, now) => {
        updateProgress(ldb, 10, { unlockedAt: now - 2 * DAY, startedAt: now - DAY, srsStage: 2, percentageCorrect: 50, reviewStatisticId: 7 });
        updateProgress(ldb, 11, { unlockedAt: now - 40 * DAY, srsStage: 9, burnedAt: now - DAY, passedAt: now - 30 * DAY });
      });
    });
    const recent = el.querySelector('[data-testid="recent-unlocks"]')!;
    expect(recent.querySelector('h2')?.textContent).toBe('Recent unlocks in the last 30 days');
    const rows = [...recent.querySelectorAll('.kk-subject-row')].map((r) => r.textContent);
    // Newest first: radicals 1 and 2 (unlocked at the start, no characters here), then 一.
    expect(rows).toEqual([monthDay(T0), monthDay(T0), `一${monthDay(T0 - 2 * DAY)}`]);
    // 二 was unlocked 40 days ago: not recent.
    expect(recent.textContent).not.toContain('二');
    expect(el.querySelector('[data-testid="critical-condition"]')?.textContent).toBe('Critical condition items一50%');
    expect(el.querySelector('[data-testid="burned-items"]')?.textContent).toBe(`Burned items in the last 30 days二${monthDay(T0 - DAY)}`);
    await act(async () => {
      await app.setPreference('show_recent_unlocks', false);
      await app.setPreference('show_critical_condition', false);
      await app.setPreference('show_burned_items', false);
    });
    expect(has(el, 'recent-unlocks') || has(el, 'critical-condition') || has(el, 'burned-items')).toBe(false);
    app.dispose();
  });

  it('opens the stage search from an SRS tile and the level search from a progression row', async () => {
    const { el, app, location } = await render();
    await act(async () => el.querySelector<HTMLButtonElement>('.kk-srs-tile.guru')!.click());
    const q = new URLSearchParams(location.get().split('?')[1]);
    expect(location.get()).toMatch(/^\/browse\/results\?/);
    expect(q.get('t')).toBe('2');
    expect([...JSON.parse(q.get('q')!).srsStages].sort()).toEqual(['pass:0', 'pass:1']);
    await act(async () => location.navigate('/'));
    await act(async () => el.querySelector<HTMLButtonElement>('[data-testid="level-1"]')!.click());
    const p = JSON.parse(new URLSearchParams(location.get().split('?')[1]).get('q')!);
    expect([p.minLevel, p.maxLevel, p.itemTypes, p.sortOrder]).toEqual([1, 1, ['WANIKANI_RADICAL'], 'STAGE_TYPE']);
    app.dispose();
  });

  it('honours the dashboard panel and chart settings', async () => {
    const { el, app } = await render();
    await act(async () => {
      await app.setPreference('timeline_chart_style', 'ITEM_TYPE');
      await app.setPreference('show_jlpt_progress', true);
      await app.setPreference('show_joyo_progress', true);
      await app.setPreference('show_lesson_review_breakdown', true);
    });
    const legend = [...el.querySelectorAll('[data-testid="timeline"] text')].map((t) => t.textContent);
    expect(legend).toEqual(expect.arrayContaining(['Radical', 'Kanji', 'Vocabulary']));
    expect(el.querySelector('[data-testid="jlpt-progress"] caption')?.textContent).toBe('JLPT progress');
    expect(el.querySelector('[data-testid="joyo-progress"] caption')?.textContent).toBe('Jōyō kanji progress');
    expect(el.querySelector('[data-testid="lesson-review-breakdown"]')?.textContent).toContain('Current-level reviews');
    await act(async () => {
      await app.setPreference('show_timeline', false);
      await app.setPreference('show_srs_breakdown', false);
      await app.setPreference('show_level_progression', false);
    });
    expect(has(el, 'timeline')).toBe(false);
    expect(text(el, 'srs-apprentice')).toBeNull();
    expect(el.querySelector('[data-testid="level-1"]')).toBeNull();
    // The session counts and the upcoming line stay (Java has no setting for them).
    expect(text(el, 'reviews-count')).toBe('1');
    app.dispose();
  });

  it('shows the install hint after the session buttons on the web build until dismissed', async () => {
    const { el, app } = await render();
    const hint = el.querySelector('[data-testid="install-hint"]');
    expect(hint).not.toBeNull();
    expect(el.querySelector('[data-testid="start-reviews"]')!.compareDocumentPosition(hint!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => {
      el.querySelector<HTMLButtonElement>('[data-testid="install-hint-dismiss"]')!.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(el.querySelector('[data-testid="install-hint"]')).toBeNull();
    app.dispose();
  });
});

describe('dashboard helpers', () => {
  it('ports the Java formatting and grid rules', () => {
    expect(monthDay(Date.UTC(2026, 9, 17, 12))).toBe('Oct 17');
    expect([0, 3, 7, 12, 27, 120, 1034].map(roundUpInterval)).toEqual([1, 3, 5, 20, 30, 200, 2000]);
    expect(daysAtLevel({ level: 6, since: T0 - 13.84 * DAY }, T0).toFixed(1)).toBe('13.8');
    expect(srsBreakdownTags(0, fallbackSrsSystems())).toEqual(['prepass:0', 'prepass:1', 'prepass:2', 'prepass:3']);
    expect(srsBreakdownTags(4, fallbackSrsSystems())).toEqual(['burned']);
  });
});
