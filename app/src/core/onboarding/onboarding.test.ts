import { describe, expect, it } from 'vitest';
import { makeContent, type ContentSubject } from '../content';
import { setLevelTestStatus } from '../levelTest/status';
import { createLearnerDb, updateProgress } from '../progression';
import {
  ONBOARDING_DONE_KEY,
  ONBOARDING_STEPS,
  hasChangedSettings,
  hasProgress,
  needsOnboarding,
  nextStep,
  previousStep,
  startChoices,
} from './index';

const subject = (id: number): ContentSubject => ({
  id, object: 'kanji', hiddenAt: 0, lessonPosition: id, srsSystemId: 1, level: 1, characters: '一', slug: null,
  meanings: [], auxiliaryMeanings: [], readings: [], componentSubjectIds: [], amalgamationSubjectIds: [],
  visuallySimilarSubjectIds: [], partsOfSpeech: [], frequency: 0, joyoGrade: 0, jlptLevel: 0,
});

const fresh = () => createLearnerDb(makeContent([subject(1), subject(2)], []), new Map());

describe('who sees the getting-started guide', () => {
  it('a fresh learner with no settings does, in local mode only', () => {
    const db = fresh();
    expect(hasProgress(db)).toBe(false);
    expect(needsOnboarding(db, {}, 'local')).toBe(true);
    expect(needsOnboarding(db, {}, 'server')).toBe(false);
  });

  it('unlocked lessons are not progress; a started, passed or burned item, notes and synonyms are', () => {
    const db = fresh();
    updateProgress(db, 1, { unlockedAt: 10, availableAt: 0 });
    expect(hasProgress(db)).toBe(false);
    for (const values of [{ startedAt: 20 }, { passedAt: 30 }, { burnedAt: 40 }, { meaningNote: 'mine' }, { meaningSynonyms: 'one' }, { readingNote: 'x' }]) {
      const d = fresh();
      updateProgress(d, 2, values);
      expect(hasProgress(d), JSON.stringify(values)).toBe(true);
      expect(needsOnboarding(d, {}, 'local')).toBe(false);
    }
  });

  it('a level, the JLPT order, a jump, probation or a level test count as progress', () => {
    const cases: ((db: ReturnType<typeof fresh>) => void)[] = [
      (db) => { db.progress.userLevel = 3; },
      (db) => { db.progress.curriculum = 'JLPT'; },
      (db) => { db.progress.jumps.push({} as never); },
      (db) => { db.progress.probation.set(1, 5); },
      (db) => setLevelTestStatus(db, 'ROUND1'),
    ];
    for (const change of cases) {
      const db = fresh();
      change(db);
      expect(hasProgress(db)).toBe(true);
    }
  });

  it('any stored setting counts, except the guide\'s own key and the update check\'s bookkeeping', () => {
    expect(hasChangedSettings({})).toBe(false);
    expect(hasChangedSettings({ kk_update_last_check: 5, kk_update_later_version: '1.0.0', [ONBOARDING_DONE_KEY]: false })).toBe(false);
    expect(hasChangedSettings({ font_size: null, other: undefined })).toBe(false);
    expect(hasChangedSettings({ mute: true })).toBe(true);
    expect(needsOnboarding(fresh(), { keyboard_help_dismissed: true }, 'local')).toBe(false);
  });

  it('font and text size don\'t count: the guide sets them itself', () => {
    const appearance = { font_size_question_edit: 26, font_size_subject_info: 18, selected_fonts: '["x"]', text_size: 1.2 };
    expect(hasChangedSettings(appearance)).toBe(false);
    expect(needsOnboarding(fresh(), appearance, 'local')).toBe(true);
    expect(hasChangedSettings({ ...appearance, show_timeline: false })).toBe(true);
  });

  it('done once finished or skipped', () => {
    expect(needsOnboarding(fresh(), { [ONBOARDING_DONE_KEY]: true }, 'local')).toBe(false);
    expect(needsOnboarding(fresh(), { [ONBOARDING_DONE_KEY]: false }, 'local')).toBe(true);
  });
});

describe('steps and starting points', () => {
  it('walks the steps in order', () => {
    expect(ONBOARDING_STEPS).toEqual(['welcome', 'appearance', 'quiz', 'path', 'start', 'done']);
    expect(nextStep('welcome')).toBe('appearance');
    expect(nextStep('start')).toBe('done');
    expect(nextStep('done')).toBe('done');
    expect(previousStep('welcome')).toBeNull();
    expect(previousStep('path')).toBe('quiz');
  });

  it('offers the level test and fast travel in JLPT order, the WaniKani import in WaniKani order, the beginning first', () => {
    expect(startChoices('JLPT')).toEqual(['BEGINNING', 'LEVEL_TEST', 'FAST_TRAVEL']);
    expect(startChoices('WANIKANI')).toEqual(['BEGINNING', 'IMPORT']);
  });
});
