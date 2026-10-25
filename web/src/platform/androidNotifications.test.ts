import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeContent, type ContentSubject } from '../core/content';
import { createLearnerDb, updateProgress } from '../core/progression';
import { HOUR } from '../core/time';
import type { ReviewTime } from './index';

const ln = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  cancelAll: vi.fn(),
  removeAllDeliveredNotifications: vi.fn(),
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }));

const { androidNotifications, resetChannelForTests, REVIEW_ID_BASE } = await import('./androidNotifications');
const { rescheduleReviewNotifications } = await import('./reviewNotifications');
const { webPlatform } = await import('./web');

const NOW = Date.UTC(2026, 9, 24, 9, 20);
const H10 = Date.UTC(2026, 9, 24, 10);

function granted(display: string = 'granted') {
  ln.checkPermissions.mockResolvedValue({ display });
}

beforeEach(() => {
  for (const f of Object.values(ln)) f.mockReset();
  ln.createChannel.mockResolvedValue(undefined);
  ln.schedule.mockResolvedValue({ notifications: [] });
  resetChannelForTests();
});

describe('permission', () => {
  it('maps the plugin states', async () => {
    granted('prompt-with-rationale');
    await expect(androidNotifications.permission()).resolves.toBe('prompt');
    granted('denied');
    await expect(androidNotifications.permission()).resolves.toBe('denied');
    granted();
    await expect(androidNotifications.permission()).resolves.toBe('granted');
  });

  it('asks only while the answer is open (Android 13+ prompt)', async () => {
    granted('prompt');
    ln.requestPermissions.mockResolvedValue({ display: 'granted' });
    await expect(androidNotifications.requestPermission()).resolves.toBe(true);
    expect(ln.requestPermissions).toHaveBeenCalledTimes(1);

    ln.requestPermissions.mockClear();
    granted('denied');
    await expect(androidNotifications.requestPermission()).resolves.toBe(false);
    granted();
    await expect(androidNotifications.requestPermission()).resolves.toBe(true);
    expect(ln.requestPermissions).not.toHaveBeenCalled();
  });
});

describe('scheduleReviews', () => {
  const times: ReviewTime[] = [
    { at: NOW - HOUR, newReviews: 1, totalReviews: 1, lessons: 0 }, // past: dropped
    { at: H10, newReviews: 2, totalReviews: 3, lessons: 0 },
    { at: H10 + HOUR, newReviews: 1, totalReviews: 4, lessons: 5 },
  ];

  it('replaces everything with one inexact notification per future time, Java texts, Java channel', async () => {
    granted();
    await expect(androidNotifications.scheduleReviews(times, NOW)).resolves.toBe(2);
    expect(ln.cancelAll).toHaveBeenCalled();
    expect(ln.removeAllDeliveredNotifications).toHaveBeenCalled();
    expect(ln.createChannel).toHaveBeenCalledWith({
      id: 'NewReviewsChannel', name: 'NewReviewsChannel', description: 'New reviews available', importance: 3, visibility: 1,
    });
    const sent = ln.schedule.mock.calls[0]![0].notifications;
    expect(sent).toEqual([
      expect.objectContaining({
        id: REVIEW_ID_BASE, title: 'New reviews available', body: '3 reviews available', channelId: 'NewReviewsChannel',
        smallIcon: 'ic_stat_name', isExactNotification: false, schedule: { at: new Date(H10), allowWhileIdle: true },
      }),
      expect.objectContaining({
        id: REVIEW_ID_BASE + 1, title: 'New lessons and reviews available', body: '5 lessons and 4 reviews available',
      }),
    ]);
  });

  it('caps at 64', async () => {
    granted();
    const many = Array.from({ length: 100 }, (_, i) => ({ at: H10 + i * HOUR, newReviews: 1, totalReviews: i + 1, lessons: 0 }));
    await expect(androidNotifications.scheduleReviews(many, NOW)).resolves.toBe(64);
    expect(ln.schedule.mock.calls[0]![0].notifications.at(-1).id).toBe(REVIEW_ID_BASE + 63);
  });

  it('without permission only cancels, never prompts', async () => {
    granted('prompt');
    await expect(androidNotifications.scheduleReviews(times, NOW)).resolves.toBe(0);
    expect(ln.cancelAll).toHaveBeenCalled();
    expect(ln.requestPermissions).not.toHaveBeenCalled();
    expect(ln.schedule).not.toHaveBeenCalled();
  });

  it('nothing upcoming: cancels and schedules nothing', async () => {
    granted();
    await expect(androidNotifications.scheduleReviews([], NOW)).resolves.toBe(0);
    expect(ln.cancelAll).toHaveBeenCalled();
    expect(ln.schedule).not.toHaveBeenCalled();
  });

  it('creates the channel once', async () => {
    granted();
    await androidNotifications.scheduleReviews(times, NOW);
    await androidNotifications.scheduleReviews(times, NOW);
    expect(ln.createChannel).toHaveBeenCalledTimes(1);
  });
});

describe('cancelAll', () => {
  it('cancels pending and clears the shade', async () => {
    await androidNotifications.cancelAll();
    expect(ln.cancelAll).toHaveBeenCalled();
    expect(ln.removeAllDeliveredNotifications).toHaveBeenCalled();
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
    const api = { ...androidNotifications, scheduleReviews: vi.fn().mockResolvedValue(1), cancelAll: vi.fn() };
    await expect(rescheduleReviewNotifications(api, db, {}, NOW)).resolves.toBe(1);
    expect(api.scheduleReviews).toHaveBeenCalledWith([{ at: H10, newReviews: 1, totalReviews: 1, lessons: 0 }]);
  });

  it('cancels when enable_notifications is off', async () => {
    const api = { ...androidNotifications, scheduleReviews: vi.fn(), cancelAll: vi.fn().mockResolvedValue(undefined) };
    await expect(rescheduleReviewNotifications(api, db, { enable_notifications: false }, NOW)).resolves.toBe(0);
    expect(api.cancelAll).toHaveBeenCalled();
    expect(api.scheduleReviews).not.toHaveBeenCalled();
  });

  it('is a no-op on the web build', async () => {
    const api = webPlatform.notifications;
    expect(api.supported).toBe(false);
    await expect(api.permission()).resolves.toBe('denied');
    await expect(rescheduleReviewNotifications(api, db, {}, NOW)).resolves.toBe(0);
  });
});
