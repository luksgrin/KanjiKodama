import { describe, expect, it } from 'vitest';
import { buildPath, createMemoryLocation, matchRoute } from '../../src/app/router';
import { handleBack, pushBackHandler } from '../../src/app/back';
import { ROUTES, paths } from '../../src/ui/routes';
import { computeDashboard, upcomingReviewsText } from '../../src/app/dashboardData';
import { waitTimeInformal, shortTime } from '../../src/app/format';
import { applyOrdering, createLearnerDb, updateProgress } from '../../src/core/progression';
import { HOUR, MINUTE, DAY } from '../../src/core/time';
import { NO_JLPT, smallContent } from '../progress-storage/helpers';

describe('router', () => {
  it('matches patterns with params and query', () => {
    expect(matchRoute(ROUTES, '/')?.name).toBe('dashboard');
    const m = matchRoute(ROUTES, '/subject/42?tab=parts');
    expect(m).toMatchObject({ name: 'subject', params: { id: '42' }, path: '/subject/42' });
    expect(m?.query.get('tab')).toBe('parts');
    expect(matchRoute(ROUTES, '/settings/fast-travel/')?.name).toBe('fastTravel');
    expect(matchRoute(ROUTES, '/nope')).toBeNull();
  });

  it('builds paths that match their own route', () => {
    expect(buildPath('/subject/:id', { id: 7 }, { q: 'a b' })).toBe('/subject/7?q=a+b');
    for (const r of ROUTES) {
      const path = r.name === 'subject' ? paths.subject(1) : (paths[r.name] as () => string)();
      expect(matchRoute(ROUTES, path)?.name).toBe(r.name);
    }
  });

  it('memory location goes back and home', () => {
    const loc = createMemoryLocation();
    loc.navigate('/settings');
    loc.navigate('/settings/about');
    expect(loc.depth()).toBe(2);
    expect(loc.back()).toBe(true);
    expect(loc.get()).toBe('/settings');
    loc.home();
    expect(loc.get()).toBe('/');
    expect(loc.back()).toBe(false);
  });

  it('back handlers run newest first before the fallback', () => {
    const calls: string[] = [];
    const offA = pushBackHandler(() => { calls.push('a'); return false; });
    const offB = pushBackHandler(() => { calls.push('b'); return true; });
    expect(handleBack(() => { calls.push('router'); return true; })).toBe(true);
    expect(calls).toEqual(['b']);
    offB();
    expect(handleBack(() => { calls.push('router'); return false; })).toBe(false);
    expect(calls).toEqual(['b', 'a', 'router']);
    offA();
  });
});

describe('dashboard data', () => {
  const now = Date.UTC(2026, 9, 25, 9, 30);

  it('builds the upcoming reviews texts', () => {
    const ldb = createLearnerDb(smallContent(), NO_JLPT);
    let d = computeDashboard(ldb, {}, now);
    expect(d.upcomingText).toBeNull();
    expect(d.nextReviewAt).toBe(0);
    updateProgress(ldb, 1, { unlockedAt: 1, startedAt: 1, srsStage: 1, availableAt: now + 2 * HOUR + 30 * MINUTE });
    d = computeDashboard(ldb, {}, now);
    expect(d.upcomingText).toBe('1 reviews in 3 hours, 1 upcoming in next 24h');
    expect(d.nextReviewAt).toBe(now + 2.5 * HOUR);
    expect(d.slots[3]?.counts).toEqual([1, 0, 0]);
    updateProgress(ldb, 1, { availableAt: now + 3 * DAY });
    expect(upcomingReviewsText(ldb, computeDashboard(ldb, {}, now).timeLine, now)).toBe('1 reviews available in 3.0 days');
    updateProgress(ldb, 2, { unlockedAt: 1, startedAt: 1, srsStage: 1, availableAt: now - 1 });
    expect(computeDashboard(ldb, { timeline_chart_size: '72' }, now).upcomingText).toBe('1 reviews available now, 1 in 3.0 days');
  });

  it('labels levels with their JLPT block in JLPT order', () => {
    const ldb = createLearnerDb(smallContent(), new Map([['一', 5], ['二', 5], ['三', 4]]));
    expect(computeDashboard(ldb, {}, now).levelProgress[0]?.block).toBeNull();
    applyOrdering(ldb, 'JLPT');
    ldb.progress.curriculum = 'JLPT';
    const groups = computeDashboard(ldb, { show_over_level_progression: true }, now).levelProgress;
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) expect(g.block).toMatch(/^(N[1-5]|Obscure), level \d+ of \d+$/);
  });

  it('formats wait times and dates', () => {
    expect(waitTimeInformal(0)).toBe('now');
    expect(waitTimeInformal(90 * MINUTE)).toBe('in 90 min');
    expect(waitTimeInformal(5 * HOUR)).toBe('in 5 hours');
    expect(waitTimeInformal(3 * DAY)).toBe('in 3 days');
    const t = new Date(2026, 9, 25, 14, 30).getTime();
    expect(shortTime(t, false, true)).toBe('14:30');
    expect(shortTime(t, true, false)).toBe('Sun 2.30pm');
    expect(shortTime(new Date(2026, 9, 25, 0, 0).getTime(), false, false)).toBe('12am');
  });
});
