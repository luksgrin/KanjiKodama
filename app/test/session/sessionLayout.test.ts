/**
 * The session screens' details that need no rendering: slide animations, the Display / Keyboard
 * settings getters, the session log's elapsed time, and the
 * visible height above the keyboard.
 */
import { describe, expect, it } from 'vitest';
import {
  ankiButtonsHeight,
  answerInputAttributes,
  centerCaret,
  prefInt,
  quizQuestionViewHeight,
  slideAnimations,
  stretchQuestionView,
} from '../../src/ui/components/session/displayPrefs';
import { formatElapsedTime } from '../../src/ui/components/session/SessionLog';
import { reasonAnimation, transitionAnimation } from '../../src/ui/components/session/transitions';
import { visibleHeight } from '../../src/ui/components/session/visibleViewport';

describe('fragment slides (getAnimation)', () => {
  const un = (id: string) => ({ kind: 'unanswered' as const, id });
  const an = (id: string) => ({ kind: 'answered' as const, id });
  it('follows the old fragment and the question choice reason', () => {
    expect(transitionAnimation(null, un('1:K'), 'NEXT_NATURAL')).toBe('NONE');
    expect(transitionAnimation(un('1:K'), an('1:K'), 'NEXT_NATURAL')).toBe('NONE');
    expect(transitionAnimation(an('1:K'), un('2:K'), 'NEXT_NATURAL')).toBe('RTL');
    expect(transitionAnimation(an('1:K'), un('1:K'), 'UNDO_AND_RETRY')).toBe('LTR');
    expect(transitionAnimation(un('1:K'), un('2:K'), 'SKIP')).toBe('RTL');
    expect(transitionAnimation({ kind: 'lesson', id: '1' }, { kind: 'lesson', id: '2' }, 'MOVE_TO_NEXT_LESSON_ITEM')).toBe('RTL');
    expect(transitionAnimation({ kind: 'lesson', id: '2' }, { kind: 'lesson', id: '1' }, 'MOVE_TO_PREVIOUS_LESSON_ITEM')).toBe('LTR');
    expect(transitionAnimation({ kind: 'lesson', id: '2' }, un('1:K'), 'STARTING_QUIZ')).toBe('RTL');
    // The quiz screens slide RTL when the new screen has no question (the lesson presentation).
    expect(transitionAnimation(un('1:K'), { kind: 'lesson', id: '1' }, 'BACK_TO_PRESENTATION')).toBe('RTL');
    expect(transitionAnimation({ kind: 'anki', id: '1:K' }, { kind: 'anki', id: '1:K' }, 'NEXT_NATURAL')).toBe('NONE');
  });
  it('maps the reasons as QuestionChoiceReason', () => {
    expect(reasonAnimation('LOAD')).toBe('NONE');
    expect(reasonAnimation('STARTING_REVIEW_SESSION')).toBe('NONE');
    expect(reasonAnimation('UNDO_AND_PUT_BACK')).toBe('LTR');
    expect(reasonAnimation('WRAPUP')).toBe('RTL');
  });
});

describe('Display and Keyboard settings', () => {
  it('has the defaults', () => {
    expect(centerCaret({})).toBe(false);
    expect(ankiButtonsHeight({})).toBe(50);
    expect(quizQuestionViewHeight({})).toBe(0);
    expect(stretchQuestionView({})).toBe(false);
    expect(slideAnimations({})).toBe(true);
  });
  it('reads the stored values', () => {
    expect(centerCaret({ center_caret: true })).toBe(true);
    expect(ankiButtonsHeight({ anki_buttons_height: 120 })).toBe(120);
    expect(quizQuestionViewHeight({ quiz_question_view_height: '200' })).toBe(200);
    expect(prefInt({ x: 'abc' }, 'x', 7)).toBe(7);
    expect(stretchQuestionView({ stretch_quiz_question_view: true })).toBe(true);
  });
  it('sets the answer field\'s keyboard attributes per question kind', () => {
    expect(answerInputAttributes({}, 'WANIKANI_KANJI_MEANING')).toEqual({
      lang: 'en', autoCorrect: 'off', spellCheck: false, autoCapitalize: 'none', autoComplete: 'off', inputMode: 'text',
      monospace: false,
    });
    expect(answerInputAttributes({}, 'WANIKANI_VOCAB_READING').lang).toBe('ja');
    expect(answerInputAttributes({ enable_auto_correct_meaning: true }, 'WANIKANI_KANJI_MEANING').autoCorrect).toBe('on');
    expect(answerInputAttributes({ enable_auto_correct_meaning: true }, 'WANIKANI_KANJI_READING').autoCorrect).toBe('off');
    expect(answerInputAttributes({ enable_auto_correct_reading: true }, 'WANIKANI_KANJI_READING').spellCheck).toBe(true);
    // Visible password switches the field to the monospace typeface; only where the flag is set (Android).
    expect(answerInputAttributes({ force_visible_password_meaning: true }, 'WANIKANI_KANJI_MEANING', true).monospace).toBe(true);
    expect(answerInputAttributes({ force_visible_password_meaning: true }, 'WANIKANI_KANJI_MEANING', false).monospace).toBe(false);
    expect(answerInputAttributes({ force_visible_password_meaning: true }, 'WANIKANI_KANJI_READING', true).monospace).toBe(false);
  });
});

describe('session log', () => {
  it('formats the elapsed time', () => {
    expect(formatElapsedTime(12_400)).toBe('12s');
    expect(formatElapsedTime(185_000)).toBe('3:05');
    expect(formatElapsedTime(3_723_000)).toBe('1:02:03');
  });
});

describe('visible height', () => {
  it('is the visual viewport (iOS, Chrome: the keyboard shrinks it), else the window', () => {
    const win = (inner: number, vv: number | null) => ({ innerHeight: inner, visualViewport: vv === null ? null : { height: vv } }) as unknown as Window;
    expect(visibleHeight(win(667, 410))).toBe(410);
    expect(visibleHeight(win(568, null))).toBe(568);
    // Android WebView (adjustResize): both shrink.
    expect(visibleHeight(win(300, 300))).toBe(300);
  });
});
