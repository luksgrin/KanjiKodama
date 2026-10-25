import { describe, expect, it, vi } from 'vitest';
import { createAndroidBackgroundSync } from './androidBackgroundSync';
import { createAndroidWidget } from './androidWidget';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));

describe('widget plugin wrapper', () => {
  it('sends the counts and schedule', async () => {
    const plugin = { update: vi.fn(async () => ({ widgets: 1 })), requestPin: vi.fn(async () => ({ requested: true })) };
    const w = createAndroidWidget(plugin);
    const u = { lessons: 2, reviews: 5, nextAt: 1000, schedule: [{ at: 3600, lessons: 2, reviews: 7, nextAt: 0 }] };
    await w.update(u);
    expect(plugin.update).toHaveBeenCalledWith(u);
    await w.update({ lessons: 1, reviews: 0, nextAt: 0 });
    expect(plugin.update).toHaveBeenLastCalledWith({ lessons: 1, reviews: 0, nextAt: 0, schedule: [] });
    expect(await w.requestPin!()).toBe(true);
  });

  it('retries after a failed update', async () => {
    const plugin = { update: vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ widgets: 0 }), requestPin: vi.fn() };
    const w = createAndroidWidget(plugin);
    await expect(w.update({ lessons: 0, reviews: 0, nextAt: 0 })).rejects.toThrow('x');
    await w.update({ lessons: 0, reviews: 0, nextAt: 0 });
    expect(plugin.update).toHaveBeenCalledTimes(2);
  });
});

describe('background sync plugin wrapper', () => {
  it('configures the worker on and off', async () => {
    const plugin = { configure: vi.fn(async (o: { enabled: boolean }) => ({ scheduled: o.enabled })), status: vi.fn(async () => ({ scheduled: true, lastRunAt: 5, lastResult: null })), runNow: vi.fn(async () => undefined) };
    const bg = createAndroidBackgroundSync(plugin);
    await bg.configure(true);
    await bg.configure(false);
    expect(plugin.configure.mock.calls.map((c) => c[0])).toEqual([{ enabled: true }, { enabled: false }]);
    expect(await bg.status!()).toEqual({ scheduled: true, lastRunAt: 5, lastResult: null });
  });
});
