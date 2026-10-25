import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { updateProgress } from '../../src/core/progression';
import { HOUR } from '../../src/core/time';
import { ContentMissingError } from '../../src/app/errors';
import { KkDb } from '../../src/storage/db';
import { progressFile, smallContent, smallSubjects } from '../progress-storage/helpers';
import { T0, fakePlatform, makeApp } from './fixtures';

describe('app controller start-up', () => {
  it('opens storage, loads content, unlocks the first lessons and persists them', async () => {
    const { app, dbName, platform } = makeApp();
    expect(app.get().status.kind).toBe('idle');
    await app.start();
    const s = app.get();
    expect(s.status).toEqual({ kind: 'ready' });
    expect(s.learner?.progress.userLevel).toBe(1);
    expect(s.mode).toBe('local');
    // LocalProgression.update on start: level 1 radicals unlocked.
    const unlocked = [...s.learner!.progress.subjects].filter(([, r]) => r.unlockedAt === T0).map(([id]) => id);
    expect(unlocked).toEqual(expect.arrayContaining([1, 2]));
    const kk = new KkDb(dbName);
    expect((await kk.subjects.get(1))?.unlockedAt).toBe(T0);
    kk.close();
    // Persistent storage is requested in the background.
    await vi.waitFor(() => expect(app.get().persistence?.persisted).toBe(true));
    expect(platform.storage.persist).toHaveBeenCalled();
    app.dispose();
  });

  it('reports missing content as a retryable error, and recovers on retry', async () => {
    let fail = true;
    const content = smallContent();
    const { app } = makeApp({
      loadContent: async () => {
        if (fail) throw new ContentMissingError('no content-manifest.json');
        return { manifest: null, db: null as never, content, wkOrder: new Map(), jlptOrder: new Map(), jlptBlocks: [], jlptKanji: new Map() };
      },
    });
    await app.start();
    const st = app.get().status;
    expect(st.kind === 'error' && st.error.code).toBe('content-missing');
    expect(st.kind === 'error' && st.error.retryable).toBe(true);
    fail = false;
    await app.start();
    expect(app.get().status.kind).toBe('ready');
    app.dispose();
  });

  it('notifies subscribers and refreshes now on tick', async () => {
    const { app, clock } = makeApp();
    const seen: string[] = [];
    app.subscribe(() => seen.push(app.get().status.kind));
    await app.start();
    expect(seen).toContain('loading');
    expect(seen.at(-1)).toBe('ready');
    clock.advance(HOUR);
    app.tick();
    expect(app.get().now).toBe(T0 + HOUR);
    app.dispose();
  });
});

describe('the write path', () => {
  it('a write persists and survives a reload', async () => {
    const h = makeApp();
    await h.app.start();
    const rev = h.app.get().revision;
    const result = await h.app.write((ldb, now) => {
      updateProgress(ldb, 1, { startedAt: now, srsStage: 1, availableAt: now + 4 * HOUR, meaningNote: 'mine' });
      return 'done';
    });
    expect(result).toBe('done');
    expect(h.app.get().revision).toBeGreaterThan(rev);
    h.app.dispose();

    const again = makeApp({ dbName: h.dbName, at: T0 + HOUR });
    await again.app.start();
    const row = again.app.get().learner!.progress.subjects.get(1)!;
    expect(row).toMatchObject({ startedAt: T0, srsStage: 1, availableAt: T0 + 4 * HOUR, meaningNote: 'mine' });
    again.app.dispose();
  });

  it('saves non-subject changes too (auto mode), and only what changed otherwise', async () => {
    const h = makeApp();
    await h.app.start();
    await h.app.write((ldb) => { ldb.state.set('level_test', 'DONE'); });
    const kk = new KkDb(h.dbName);
    expect((await kk.state.get('mm_state.level_test'))?.value).toBe('DONE');
    await h.app.write((ldb) => updateProgress(ldb, 2, { meaningNote: 'two' }), { persist: { subjects: [2] } });
    expect((await kk.subjects.get(2))?.meaningNote).toBe('two');
    kk.close();
    h.app.dispose();
  });

  it('a failing operation leaves memory as stored and reports the error', async () => {
    const h = makeApp();
    await h.app.start();
    await expect(h.app.write((ldb) => {
      updateProgress(ldb, 1, { meaningNote: 'lost' });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(h.app.get().learner!.progress.subjects.get(1)?.meaningNote).not.toBe('lost');
    expect(h.app.get().lastWriteError).toBe('boom');
    h.app.dispose();
  });

  it('runs writes one at a time, in order', async () => {
    const h = makeApp();
    await h.app.start();
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((n) => h.app.write((ldb) => {
      order.push(n);
      updateProgress(ldb, 10, { meaningNote: String(n) });
    })));
    expect(order).toEqual([1, 2, 3]);
    expect(h.app.get().learner!.progress.subjects.get(10)?.meaningNote).toBe('3');
    h.app.dispose();
  });

  it('stores preferences', async () => {
    const h = makeApp();
    await h.app.start();
    await h.app.setPreference('kk_theme', 'dark');
    expect(h.app.get().prefs.kk_theme).toBe('dark');
    h.app.dispose();
    const again = makeApp({ dbName: h.dbName });
    await again.app.start();
    expect(again.app.get().prefs.kk_theme).toBe('dark');
    again.app.dispose();
  });
});

describe('save and restore', () => {
  it('saves the progress file, keeps orphan rows in it, and records lastSavedAt', async () => {
    // v1 content has subject 11; v2 doesn't: its row is an orphan, still exported.
    const h = makeApp();
    await h.app.start();
    await h.app.write((ldb, now) => updateProgress(ldb, 11, { unlockedAt: now, startedAt: now, srsStage: 3 }));
    h.app.dispose();

    const saveText = vi.fn(async () => 'saved' as const);
    const platform = fakePlatform({ saveText });
    const v2 = smallContent(smallSubjects().filter((s) => s.id !== 11));
    const again = makeApp({ dbName: h.dbName, content: v2, platform, at: T0 + HOUR });
    await again.app.start();
    expect(again.app.backupReminder()).toMatchObject({ state: 'never', show: true });
    const out = await again.app.saveProgress();
    expect(out).toEqual({ result: 'saved', name: 'kanjikodama-progress-2026-10-25.json' });
    const text = (saveText.mock.calls[0] as unknown as [string, string])[1];
    const file = JSON.parse(text) as { subjects: { id: number; srsStage: number }[]; exportedAt: number };
    expect(file.exportedAt).toBe(T0 + HOUR);
    expect(file.subjects.find((s) => s.id === 11)?.srsStage).toBe(3);
    expect(again.app.get().lastSavedAt).toBe(T0 + HOUR);
    expect(again.app.backupReminder().show).toBe(false);
    again.app.dispose();
  });

  it('previews and restores a progress file', async () => {
    const text = progressFile({ userLevel: 2, subjects: [{ id: 10, srsStage: 5, unlockedAt: 1, startedAt: 2, passedAt: 3 }] });
    const platform = fakePlatform({ openText: vi.fn(async () => ({ name: 'p.json', text })) });
    const h = makeApp({ platform });
    await h.app.start();
    const opened = await h.app.openProgressFile();
    expect(opened?.name).toBe('p.json');
    expect(opened?.summary).toMatch(/level 2/);
    const msg = await h.app.restoreProgress(opened!.text);
    expect(msg).toBe('Progress restored, level 2.');
    expect(h.app.get().learner!.progress.subjects.get(10)?.srsStage).toBe(5);
    h.app.dispose();

    const again = makeApp({ dbName: h.dbName });
    await again.app.start();
    expect(again.app.get().learner!.progress.userLevel).toBe(2);
    again.app.dispose();
  });

  it('drops orphan rows on a replacing write and on restore, keeps them on normal saves', async () => {
    const seed = async () => {
      const h = makeApp();
      await h.app.start();
      await h.app.write((ldb, now) => updateProgress(ldb, 11, { unlockedAt: now, startedAt: now, srsStage: 3 }));
      h.app.dispose();
      const again = makeApp({ dbName: h.dbName, content: smallContent(smallSubjects().filter((s) => s.id !== 11)) });
      await again.app.start();
      return again;
    };
    const has11 = (h: Awaited<ReturnType<typeof seed>>) => (JSON.parse(h.app.exportProgressFile().text) as { subjects: { id: number }[] }).subjects.some((s) => s.id === 11);
    const stored11 = async (dbName: string) => {
      const kk = new KkDb(dbName);
      const row = await kk.subjects.get(11);
      kk.close();
      return row !== undefined;
    };

    const kept = await seed();
    await kept.app.write((ldb, now) => updateProgress(ldb, 1, { startedAt: now }), { persist: 'all' });
    expect(has11(kept)).toBe(true);
    expect(await stored11(kept.dbName)).toBe(true);
    kept.app.dispose();

    const replaced = await seed();
    await replaced.app.write((ldb, now) => updateProgress(ldb, 1, { startedAt: now }), { persist: 'replace' });
    expect(has11(replaced)).toBe(false);
    expect(await stored11(replaced.dbName)).toBe(false);
    replaced.app.dispose();

    const restored = await seed();
    await restored.app.restoreProgress(progressFile({ userLevel: 1, subjects: [{ id: 10, srsStage: 1, unlockedAt: 1, startedAt: 2 }] }));
    expect(has11(restored)).toBe(false);
    expect(await stored11(restored.dbName)).toBe(false);
    restored.app.dispose();
  });

  it('rejects a bad file without changing anything', async () => {
    const platform = fakePlatform({ openText: vi.fn(async () => ({ name: 'x.json', text: '{"format":"other"}' })) });
    const h = makeApp({ platform });
    await h.app.start();
    await expect(h.app.openProgressFile()).rejects.toThrow(/not a KanjiKodama progress file/);
    h.app.dispose();
  });
});
