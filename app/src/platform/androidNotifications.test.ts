import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeContent, type ContentSubject } from '../core/content';
import { createLearnerDb, updateProgress } from '../core/progression';
import { HOUR } from '../core/time';
import type { ReviewTime } from './index';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));

const { createAndroidNotifications, androidNotifications } = await import('./androidNotifications');
const { rescheduleReviewNotifications } = await import('./reviewNotifications');
const { webPlatform } = await import('./web');

const NOW = Date.UTC(2026, 9, 24, 9, 20);
const H10 = Date.UTC(2026, 9, 24, 10);

const plugin = {
  permission: vi.fn(),
  request: vi.fn(),
  schedule: vi.fn(),
  cancelAll: vi.fn(),
};
const api = createAndroidNotifications(plugin);

function granted(display: string = 'granted') {
  plugin.permission.mockResolvedValue({ display });
}

beforeEach(() => {
  for (const f of Object.values(plugin)) f.mockReset();
  plugin.schedule.mockImplementation(async (o: { entries: unknown[] }) => ({ scheduled: o.entries.length }));
  plugin.cancelAll.mockResolvedValue(undefined);
});

describe('permission', () => {
  it('maps the plugin states', async () => {
    granted('prompt-with-rationale');
    await expect(api.permission()).resolves.toBe('prompt');
    granted('denied');
    await expect(api.permission()).resolves.toBe('denied');
    granted();
    await expect(api.permission()).resolves.toBe('granted');
  });

  it('asks only while the answer is open (Android 13+ prompt)', async () => {
    granted('prompt');
    plugin.request.mockResolvedValue({ display: 'granted' });
    await expect(api.requestPermission()).resolves.toBe(true);
    expect(plugin.request).toHaveBeenCalledTimes(1);

    plugin.request.mockClear();
    granted('denied');
    await expect(api.requestPermission()).resolves.toBe(false);
    granted();
    await expect(api.requestPermission()).resolves.toBe(true);
    expect(plugin.request).not.toHaveBeenCalled();
  });
});

describe('scheduleReviews', () => {
  const times: ReviewTime[] = [
    { at: NOW - HOUR, newReviews: 1, totalReviews: 1, lessons: 0 }, // past: dropped
    { at: H10, newReviews: 2, totalReviews: 3, lessons: 0 },
    { at: H10 + HOUR, newReviews: 1, totalReviews: 4, lessons: 5 },
  ];

  it('hands the native side one plan for the single notification, with its texts', async () => {
    granted();
    await expect(api.scheduleReviews(times, { now: NOW, current: { lessons: 5, reviews: 1 } })).resolves.toBe(2);
    expect(plugin.schedule).toHaveBeenCalledTimes(1);
    expect(plugin.schedule.mock.calls[0]![0]).toEqual({
      entries: [
        { at: H10, lessons: 0, reviews: 3, title: 'New reviews available', body: '3 reviews available' },
        { at: H10 + HOUR, lessons: 5, reviews: 4, title: 'New lessons and reviews available', body: '5 lessons and 4 reviews available' },
      ],
      current: { at: NOW, lessons: 5, reviews: 1, title: 'New lessons and reviews available', body: '5 lessons and 1 reviews available' },
    });
    expect(plugin.cancelAll).not.toHaveBeenCalled();
  });

  it('caps at 64 entries', async () => {
    granted();
    const many = Array.from({ length: 100 }, (_, i) => ({ at: H10 + i * HOUR, newReviews: 1, totalReviews: i + 1, lessons: 0 }));
    await expect(api.scheduleReviews(many, { now: NOW })).resolves.toBe(64);
    expect(plugin.schedule.mock.calls[0]![0].entries).toHaveLength(64);
    expect(plugin.schedule.mock.calls[0]![0].current).toBeNull();
  });

  it('without permission only cancels, never prompts', async () => {
    granted('prompt');
    await expect(api.scheduleReviews(times, { now: NOW })).resolves.toBe(0);
    expect(plugin.cancelAll).toHaveBeenCalled();
    expect(plugin.request).not.toHaveBeenCalled();
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it('nothing upcoming: an empty plan (the native side cancels its alarm)', async () => {
    granted();
    await expect(api.scheduleReviews([], { now: NOW, current: { lessons: 0, reviews: 0 } })).resolves.toBe(0);
    expect(plugin.schedule.mock.calls[0]![0].entries).toEqual([]);
  });
});

describe('cancelAll', () => {
  it('cancels the plan and the shown notification', async () => {
    await api.cancelAll();
    expect(plugin.cancelAll).toHaveBeenCalled();
  });
});

describe('rescheduleReviewNotifications', () => {
  function subject(id: number): ContentSubject {
    return {
      id, object: 'kanji', hiddenAt: 0, lessonPosition: id, srsSystemId: 1, level: 1, characters: String(id), slug: null,
      meanings: [], auxiliaryMeanings: [], readings: [], componentSubjectIds: [], amalgamationSubjectIds: [],
      visuallySimilarSubjectIds: [], partsOfSpeech: [], frequency: 0, joyoGrade: 0, jlptLevel: 0,
    };
  }
  const db = createLearnerDb(makeContent([subject(1)], []), new Map());
  updateProgress(db, 1, { unlockedAt: 1, startedAt: 1, availableAt: H10 });

  it('plans and schedules', async () => {
    const a2 = { ...androidNotifications, scheduleReviews: vi.fn().mockResolvedValue(1), cancelAll: vi.fn() };
    await expect(rescheduleReviewNotifications(a2, db, {}, NOW)).resolves.toBe(1);
    expect(a2.scheduleReviews).toHaveBeenCalledWith([{ at: H10, newReviews: 1, totalReviews: 1, lessons: 0 }],
      { now: NOW, current: { lessons: 0, reviews: 0 }, style: { frequency: 'ONLY_NEW_REVIEWS', priority: 'DEFAULT', category: 'RECOMMENDATION' } });
  });

  it('passes the Notification settings (unknown values: the defaults)', async () => {
    const a2 = { ...androidNotifications, scheduleReviews: vi.fn().mockResolvedValue(1), cancelAll: vi.fn() };
    const prefs = { notification_update_frequency: 'CONTINUOUSLY', notification_priority: 'HIGH', notification_category: 'BOGUS' };
    await rescheduleReviewNotifications(a2, db, prefs, NOW);
    expect(a2.scheduleReviews.mock.calls[0]![1]).toMatchObject({ style: { frequency: 'CONTINUOUSLY', priority: 'HIGH', category: 'RECOMMENDATION' } });
  });

  it('cancels when enable_notifications is off', async () => {
    const a2 = { ...androidNotifications, scheduleReviews: vi.fn(), cancelAll: vi.fn().mockResolvedValue(undefined) };
    await expect(rescheduleReviewNotifications(a2, db, { enable_notifications: false }, NOW)).resolves.toBe(0);
    expect(a2.cancelAll).toHaveBeenCalled();
    expect(a2.scheduleReviews).not.toHaveBeenCalled();
  });

  it('is a no-op on the web build', async () => {
    const api = webPlatform.notifications;
    expect(api.supported).toBe(false);
    await expect(api.permission()).resolves.toBe('denied');
    await expect(rescheduleReviewNotifications(api, db, {}, NOW)).resolves.toBe(0);
  });
});
