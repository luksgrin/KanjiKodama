import { describe, expect, it } from 'vitest';
import { makeContent, type ContentSubject } from '../content';
import { burnLocal, createLearnerDb, isBurnable, isResurrectable, progressRow, resurrectLocal, srsSystemOf, updateProgress } from './index';

const subject = (id: number): ContentSubject => ({
  id, object: 'kanji', hiddenAt: 0, lessonPosition: id, srsSystemId: 1, level: 1, characters: '一', slug: null,
  meanings: [], auxiliaryMeanings: [], readings: [], componentSubjectIds: [], amalgamationSubjectIds: [],
  visuallySimilarSubjectIds: [], partsOfSpeech: [], frequency: 0, joyoGrade: 0, jlptLevel: 0,
});

const T = 1_760_000_000_000;

describe('burn / resurrect', () => {
  it('resurrects a burned subject and burns it again, with the patchAssignment columns', () => {
    const db = createLearnerDb(makeContent([subject(5)], []), new Map());
    const system = srsSystemOf(db, 5);
    updateProgress(db, 5, { srsStage: system.completedStageId, unlockedAt: 10, startedAt: 20, passedAt: 30, burnedAt: 40, availableAt: 0 });
    expect(isResurrectable(db, 5)).toBe(true);
    expect(isBurnable(db, 5)).toBe(false);

    resurrectLocal(db, 5, T);
    expect(progressRow(db, 5)).toMatchObject({
      srsStage: system.firstStartedStage.id, unlockedAt: 10, startedAt: 20, availableAt: T, passedAt: 30,
      burnedAt: 0, resurrectedAt: T, assignmentPatched: 1,
    });
    expect(isResurrectable(db, 5)).toBe(false);
    expect(isBurnable(db, 5)).toBe(true);

    burnLocal(db, 5, T + 1);
    expect(progressRow(db, 5)).toMatchObject({
      srsStage: system.completedStageId, unlockedAt: 10, startedAt: 20, availableAt: 0, passedAt: 30,
      burnedAt: T + 1, resurrectedAt: 0, assignmentPatched: 1,
    });
    expect(isBurnable(db, 5)).toBe(false);
    expect(isResurrectable(db, 5)).toBe(true);
  });

  it('stores Locked (-999) when the subject was never unlocked', () => {
    const db = createLearnerDb(makeContent([subject(6)], []), new Map());
    burnLocal(db, 6, T);
    expect(progressRow(db, 6).srsStage).toBe(-999);
    expect(isResurrectable(db, 6)).toBe(false);
  });
});
