import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { KkDb, applyAnswer, emptyProgress } from '../storage/db';
import { exportProgress, parseProgressFile, ProgressFileError, restoreProgress } from './progressFile';

let d: KkDb;
beforeEach(async () => {
  d = new KkDb(`test-${Math.random()}`);
  await d.open();
});

describe('progress file', () => {
  it('round-trips export -> import', async () => {
    await d.progress.put(applyAnswer(emptyProgress(440), 'meaning', true, 'one'));
    const text = await exportProgress(d, 1700000000000);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      format: 'kanjikodama-progress', version: 1, exportedAt: 1700000000000, userLevel: 1, curriculum: 'WANIKANI',
      levelProgression: [], probation: [], jumps: [],
      subjects: [{ id: 440, srsStage: 1, meaningCorrect: 1, meaningIncorrect: 0, readingCorrect: 0, readingIncorrect: 0 }],
    });
    await d.progress.clear();
    await restoreProgress(d, parseProgressFile(text));
    expect((await d.progress.get(440))?.srsStage).toBe(1);
  });

  it.each([
    ['not json', 'hello'],
    ['array', '[]'],
    ['wrong format', JSON.stringify({ format: 'other', version: 1, subjects: [] })],
    ['newer version', JSON.stringify({ format: 'kanjikodama-progress', version: 2, subjects: [] })],
    ['missing version', JSON.stringify({ format: 'kanjikodama-progress', subjects: [] })],
    ['no subjects', JSON.stringify({ format: 'kanjikodama-progress', version: 1 })],
    ['bad id', JSON.stringify({ format: 'kanjikodama-progress', version: 1, subjects: [{ id: 'x' }] })],
    ['bad stage', JSON.stringify({ format: 'kanjikodama-progress', version: 1, subjects: [{ id: 1, srsStage: 42 }] })],
    ['bad jumps', JSON.stringify({ format: 'kanjikodama-progress', version: 1, subjects: [], jumps: {} })],
  ])('rejects %s without touching stored progress', async (_name, text) => {
    await d.progress.put(emptyProgress(7));
    expect(() => parseProgressFile(text)).toThrow(ProgressFileError);
    expect(await d.progress.count()).toBe(1);
  });

  it('accepts the legacy format tag', () => {
    expect(parseProgressFile(JSON.stringify({ format: 'mojimori-progress', version: 1, subjects: [] })).format).toBe('kanjikodama-progress');
  });
});
