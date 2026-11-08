/** Server-mode content, predictions and mode features (core/server/subjects, localMode; reportServer). */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';

import { makeContent } from '../../src/core/content';
import { planWidget } from '../../src/core/notifications';
import { createLearnerDb, progressRow, reportServer, updateProgress } from '../../src/core/progression';
import { buildServerContent, featureVisible, serverSrsSystems, serverSubjectToContent, type ServerSubjectEnvelope } from '../../src/core/server';
import { HOUR } from '../../src/core/time';
import { SyncEngine } from '../../src/sync/engine';
import { switchToServer } from '../../src/sync/modeSwitch';
import { loadServerContent } from '../../src/sync/serverContent';
import { createServerReporter, enqueueReports } from '../../src/sync/serverSession';
import { listQueue } from '../../src/sync/queue';
import { NO_JLPT, smallContent, subject } from '../progress-storage/helpers';
import { BASE, FakeClock, FakeHttp, firstSyncRoutes, fixture, limiterFor, NOW, openDb } from './helpers';

const page = (name: string) => (fixture(name) as { data: ServerSubjectEnvelope[] }).data;

describe('server subjects → Content', () => {
  it('maps the API fields, readings and timestamps; reference data from the bundled subject', () => {
    const [kanji] = page('subjects-page2');
    const bundled = { ...subject(10, 'kanji', 1, [1], '一'), frequency: 2, joyoGrade: 1, jlptLevel: 5 };
    const s = serverSubjectToContent({ ...kanji!, data: { ...kanji!.data, hidden_at: '2026-01-01T00:00:00.000000Z', amalgamation_subject_ids: [100] } }, bundled)!;
    expect(s).toMatchObject({
      id: 10, object: 'kanji', level: 1, lessonPosition: 2, srsSystemId: 1, characters: '一', slug: '一',
      componentSubjectIds: [1], amalgamationSubjectIds: [100], frequency: 2, joyoGrade: 1, jlptLevel: 5,
      hiddenAt: Date.UTC(2026, 0, 1),
    });
    expect(s.meanings).toEqual([{ meaning: 'One', primary: true, accepted_answer: true }]);
    expect(s.readings[0]).toEqual({ reading: 'いち', primary: true, accepted_answer: true, type: 'onyomi' });
    expect(serverSubjectToContent({ id: 5, object: 'kana_vocabulary', data: { level: 3 } })?.object).toBe('kana_vocabulary');
    expect(serverSubjectToContent({ id: 6, object: 'something', data: { level: 3 } })).toBeNull();
  });

  it('SRS systems from the stored list; bundled content before the first download (no extra kanji)', () => {
    const srs = serverSrsSystems([{ id: 1, ...((fixture('spaced_repetition_systems') as { data: { data: object }[] }).data[0]!.data) }]);
    expect(srs[0]).toMatchObject({ id: 1, passingStagePosition: 5, burningStagePosition: 9 });
    expect(srs[0]!.stages[1]).toEqual({ position: 1, interval: 14400, interval_unit: 'seconds' });
    const bundled = makeContent([subject(1, 'radical', 1), subject(100001, 'kanji', 61)], []);
    expect(buildServerContent([], null, bundled).subjects.map((s) => s.id)).toEqual([1]);
    const c = buildServerContent(page('subjects-page1'), null, bundled);
    expect(c.subjects.map((s) => s.id)).toEqual([1, 2]);
  });

  it('loads what a first sync wrote', async () => {
    const http = firstSyncRoutes(new FakeHttp());
    const kk = await openDb();
    const clock = new FakeClock(NOW);
    await switchToServer(kk, { baseUrl: BASE, token: 'tok', user: { id: 'u', username: 'kodama', level: 2, maxLevelGranted: 60, vacationStartedAt: 0 } as never });
    await new SyncEngine({ kk, http, clock, limiter: limiterFor(clock), retryDelay: 1 }).syncNow();
    const c = await loadServerContent(kk, smallContent());
    expect(c.subjects.map((s) => s.id)).toEqual([1, 2, 10]);
    expect(c.srsSystems[0]!.name).toBe('Default system for dictionary subjects');
  });
});

describe('server-mode report', () => {
  it('patches assignment and statistic locally, no progression; queues the upload', async () => {
    const content = smallContent([{ ...subject(10, 'kanji', 1, [1]), amalgamationSubjectIds: [100] }, subject(1, 'radical', 1), subject(100, 'vocabulary', 1, [10])]);
    const db = createLearnerDb(content, NO_JLPT);
    updateProgress(db, 10, { unlockedAt: NOW - 100 * HOUR, startedAt: NOW - 90 * HOUR, srsStage: 4, availableAt: NOW - HOUR, assignmentId: 9003 });
    updateProgress(db, 1, { unlockedAt: NOW - HOUR, assignmentId: 9001 });
    const reporter = createServerReporter();
    const hooks = reporter.hooks({ levelTestRoundActive: () => false, onSessionFinishing: () => undefined });
    hooks.report!(db, { subjectId: 10, type: 'REVIEW', meaningIncorrect: 0, readingIncorrect: 0, timestamp: NOW, assignmentId: 0 }, NOW);
    hooks.report!(db, { subjectId: 1, type: 'LESSON', meaningIncorrect: 0, readingIncorrect: 0, timestamp: NOW, assignmentId: 9001 }, NOW);
    hooks.report!(db, { subjectId: 1, type: 'SELF_STUDY' as never, meaningIncorrect: 1, readingIncorrect: 0, timestamp: NOW, assignmentId: 9001 }, NOW);
    const row = progressRow(db, 10);
    expect(row).toMatchObject({ srsStage: 5, assignmentPatched: 1, statisticPatched: 1, passedAt: NOW });
    // No local unlock of the vocabulary (the server decides).
    expect(num(progressRow(db, 100).unlockedAt)).toBe(0);
    const reports = reporter.drain();
    expect(reports.map((r) => [r.subjectId, r.type, r.assignmentId, r.justPassed])).toEqual([[10, 'REVIEW', 9003, true], [1, 'LESSON', 9001, false]]);
    expect(reporter.pending).toBe(0);
    const kk = await openDb();
    await enqueueReports(kk, reports, NOW);
    expect((await listQueue(kk)).map((t) => t.kind).sort()).toEqual(['lessonStart', 'review']);
    expect(reportServer(db, { subjectId: 999, type: 'REVIEW', meaningIncorrect: 0, readingIncorrect: 0, timestamp: 0 }, NOW)).toBeNull();
  });
});

const num = (v: unknown) => (typeof v === 'number' ? v : 0);

describe('mode features', () => {
  it('hides the local-only features in server mode and the sync ones in local mode', () => {
    for (const f of ['curriculum', 'extraKanji', 'fastTravel', 'levelTest', 'restore', 'importWaniKani'] as const) {
      expect(featureVisible('local', f)).toBe(true);
      expect(featureVisible('server', f)).toBe(false);
    }
    expect(featureVisible('server', 'syncNow')).toBe(true);
    expect(featureVisible('local', 'backgroundSync')).toBe(false);
  });
});

describe('planWidget', () => {
  it('counts now, the next review, and later entries per review hour', () => {
    const db = createLearnerDb(smallContent(), NO_JLPT);
    const top = NOW - (NOW % HOUR);
    updateProgress(db, 1, { unlockedAt: 1, startedAt: 1, availableAt: NOW - 1 });
    updateProgress(db, 2, { unlockedAt: 1, startedAt: 1, availableAt: top + HOUR + 60_000 });
    updateProgress(db, 10, { unlockedAt: 1, startedAt: 1, availableAt: top + 3 * HOUR });
    updateProgress(db, 11, { unlockedAt: 1 });
    const p = planWidget(db, NOW);
    expect(p).toMatchObject({ lessons: 1, reviews: 1, nextAt: top + HOUR + 60_000 });
    expect(p.schedule).toEqual([
      { at: top + 2 * HOUR, lessons: 1, reviews: 2, nextAt: top + 3 * HOUR },
      { at: top + 3 * HOUR, lessons: 1, reviews: 3, nextAt: 0 },
    ]);
  });
});
