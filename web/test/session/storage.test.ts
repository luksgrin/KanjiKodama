import { describe, expect, it } from 'vitest';
import { emptyStoredSession } from '../../src/core/session';
import { dontKnowCanShow, infoDumpFlags, nextButtonDelay, specialButtonBehavior } from '../../src/core/settings/sessionUi';
import { fromSessionRecords, sessionRecords } from '../../src/ui/components/session/sessionStorage';
import type { SessionRecord } from '../../src/storage/db';

describe('session rows', () => {
  it('round-trips the stored session and the meta', () => {
    const stored = emptyStoredSession();
    stored.sessionType = 'REVIEW';
    stored.currentItemId = 10;
    stored.currentQuestionType = 'WANIKANI_KANJI_READING';
    stored.items.set(10, { id: 10, assignmentId: 7, state: 'PENDING', srsStageId: 2, level: 1, bucket: 0, order: 0,
      done: [true, false, true, true], incorrect: [1, 0, 0, 0], numAnswers: 2, lastAnswer: 123 });
    const meta = { startedAt: 5, startLevel: 3, levelTestRound: 1 as const };
    const rows = sessionRecords(stored, meta);
    expect(rows[0]).toMatchObject({ subjectId: 0, kind: 'properties', sessionType: 'REVIEW', levelTestRound: 1 });
    const back = fromSessionRecords(JSON.parse(JSON.stringify(rows)) as SessionRecord[]);
    expect(back.meta).toEqual(meta);
    expect(back.stored.sessionType).toBe('REVIEW');
    expect(back.stored.currentQuestionType).toBe('WANIKANI_KANJI_READING');
    expect(back.stored.items.get(10)).toEqual(stored.items.get(10));
    expect(sessionRecords(emptyStoredSession(), meta)).toEqual([]);
    expect(fromSessionRecords([]).stored.sessionType).toBe('NONE');
  });
});

describe('session settings (GlobalSettings)', () => {
  it('gates the special buttons and Don\'t know on enable_advanced', () => {
    expect(specialButtonBehavior({ undo_button: 'SKIP' }, 1)).toBe('DISABLE');
    expect(specialButtonBehavior({ enable_advanced: true, undo_button: 'SKIP' }, 1)).toBe('SKIP');
    const s = { active: true, answered: false, correct: false, canUndo: false };
    expect(dontKnowCanShow({ dont_know_button: 'DISABLE' }, s)).toBe(true);
    expect(dontKnowCanShow({ enable_advanced: true, dont_know_button: 'DISABLE' }, s)).toBe(false);
    expect(dontKnowCanShow({ enable_advanced: true, dont_know_button: 'ONLY_IF_IGNORE_HIDDEN', ignore_button: 'SKIP' }, s)).toBe(false);
    expect(nextButtonDelay({ next_button_delay: '0.5' })).toBe(0);
    expect(nextButtonDelay({ next_button_delay: '2' })).toBe(2);
    expect(infoDumpFlags('ANSWERS_ONLY', { type: 'WANIKANI_KANJI_MEANING', done: [false, false, true, true] }))
      .toEqual({ meaningAnswers: true, readingAnswers: false, meaningRelated: false, readingRelated: false });
  });
});
