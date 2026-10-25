// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import { updateProgress } from '../../src/core/progression';
import { HOUR } from '../../src/core/time';
import { makeApp } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

async function render(path = '/') {
  const h = makeApp();
  await h.app.start();
  // Radical 1 passed and due now; radical 2 started, due in 3 hours.
  await h.app.write((ldb, now) => {
    updateProgress(ldb, 1, { startedAt: now - 10 * HOUR, srsStage: 5, passedAt: now - HOUR, availableAt: now - HOUR });
    updateProgress(ldb, 2, { startedAt: now - 10 * HOUR, srsStage: 1, availableAt: now + 3 * HOUR });
  });
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

describe('dashboard', () => {
  it('shows the counts, next review, level progress and SRS breakdown from the core', async () => {
    const { el, app } = await render();
    expect(text(el, 'reviews-count')).toBe('1');
    // The start-up unlocked radicals 1 and 2, both started since: no lessons (unlocks come with reports).
    expect(text(el, 'lessons-count')).toBe('0');
    expect(text(el, 'upcoming-text')).toBe('1 reviews available now, 1 in next 24h');
    expect(text(el, 'next-review')).toMatch(/^Next review: .+ \(in 3 hours\)$/);
    expect(el.querySelector('[data-testid="level-1"]')?.textContent).toMatch(/Lvl 1 radicals.*1\/2/);
    expect(text(el, 'srs-apprentice')).toBe('1');
    expect(text(el, 'srs-guru')).toBe('1');
    expect(text(el, 'srs-burned')).toBe('0');
    expect(el.querySelector('.kk-timeline-bars')?.children).toHaveLength(24);
    // PWA, progress never saved: the backup reminder is shown.
    expect(el.querySelector('[data-testid="backup-reminder"]')).not.toBeNull();
    expect(el.querySelector('.kk-bottomnav [aria-current="page"]')?.textContent).toBe('Home');
    app.dispose();
  });

  it('re-renders after a write', async () => {
    const { el, app } = await render();
    await act(async () => {
      await app.write((ldb, now) => updateProgress(ldb, 2, { availableAt: now - 1 }));
    });
    expect(text(el, 'reviews-count')).toBe('2');
    app.dispose();
  });

  it('navigates to settings and shows the progress section and limitations', async () => {
    const { el, app, location } = await render();
    await act(async () => location.navigate('/settings'));
    expect(el.querySelector('.kk-topbar h1')?.textContent).toBe('Settings');
    expect(text(el, 'last-saved')).toMatch(/Never saved/);
    expect(el.textContent).toContain('No review notifications.');
    await act(async () => location.navigate('/settings/about'));
    expect(el.querySelector('.kk-topbar button[aria-label="Back"]')).not.toBeNull();
    app.dispose();
  });
});
