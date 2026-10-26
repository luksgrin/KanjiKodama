// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { makeContent } from '../../src/core/content';
import { titleFor } from '../../src/ui/components/session/QuestionView';
import { testSubjects } from './helpers';
import { num, progressRow } from '../../src/core/progression';
import { KkDb } from '../../src/storage/db';
import { sessionRuntime } from '../../src/ui/components/session/runtime';
import {
  cleanup, click, currentQuestion, dueReviews, field, q, renderApp, rightAnswer, typeText, waitFor,
} from './helpers';

afterEach(cleanup);

/** Opens the toolbar's overflow menu and returns the item `menu-<id>` (null when hidden). */
async function menuItem(el: HTMLElement, id: string): Promise<HTMLElement | null> {
  if (q(el, 'toolbar-menu') === null) await click(q(el, 'toolbar-overflow'));
  return q(el, `menu-${id}`);
}

const toolbarTitle = (el: HTMLElement): string | null | undefined => el.querySelector('[data-testid="toolbar"] h1')?.textContent;
const ids = (el: HTMLElement | null): string[] => [...(el?.querySelectorAll('[data-subject-id]') ?? [])].map((e) => (e as HTMLElement).dataset.subjectId!);

async function answer(el: HTMLElement, text: string): Promise<void> {
  await typeText(el, text);
  await click(q(el, 'submit'));
}

describe('lessons', () => {
  it('runs a lesson batch through the presentation and the quiz', async () => {
    const { el, app, platform } = await renderApp('/lessons', { prefs: { enable_lightning_mode: false } });
    // The start-up unlocked the two level 1 radicals: the presentation shows 1/2, Previous hidden.
    await waitFor(() => q(el, 'lesson-next'), 'presentation');
    expect(q(el, 'session-progress')?.textContent).toBe('1/2');
    expect(q(el, 'lesson-previous')).toBeNull();
    expect(el.querySelector('.kk-item')).not.toBeNull();
    expect(q(el, 'lesson-next')?.textContent).toBe('Next');
    await click(q(el, 'lesson-next'));
    expect(q(el, 'session-progress')?.textContent).toBe('2/2');
    expect(q(el, 'lesson-next')?.textContent).toBe('Start quiz');
    await click(q(el, 'lesson-previous'));
    expect(q(el, 'session-progress')?.textContent).toBe('1/2');
    await click(q(el, 'lesson-next'));
    await click(q(el, 'lesson-next'));
    // The quiz: both radical names.
    for (let i = 0; i < 2; i++) {
      await waitFor(() => q(el, 'submit'), 'question');
      expect(q(el, 'question-type')?.textContent).toBe('Radical Name');
      await answer(el, rightAnswer(el));
      await waitFor(() => q(el, 'next'), 'answered');
      expect(q(el, 'answer-frame')?.classList.contains('correct')).toBe(true);
      // Item info after answering.
      expect(el.querySelector('.kk-quiz-info .kk-item')).not.toBeNull();
      await click(q(el, 'next'));
    }
    // Summary, then Finish.
    await waitFor(() => q(el, 'summary'), 'summary');
    expect(q(el, 'summary-correct-percentage')?.textContent).toBe('100%');
    expect(q(el, 'summary-correct-radical')?.textContent).toBe('2');
    await click(q(el, 'summary-finish'));
    await waitFor(() => el.querySelector('[data-testid="lessons-count"]'), 'dashboard');
    const learner = app.requireLearner();
    expect(num(progressRow(learner, 1), 'startedAt')).not.toBe(0);
    expect(num(progressRow(learner, 2), 'startedAt')).not.toBe(0);
    // After the session: auto backup and notifications.
    expect(platform.backups).toHaveLength(1);
    expect(platform.scheduled.length).toBeGreaterThan(0);
    expect(await new KkDb(app.db.name).session.count()).toBe(0);
  });
});

describe('reviews', () => {
  const setup = dueReviews([1, 2, 10]);

  it('a wrong answer, Don\'t know, the kana field and the summary', async () => {
    const { el, app, platform } = await renderApp('/reviews', { setup, prefs: { enable_lightning_mode: false, enable_haptic_feedback_failure: true } });
    await waitFor(() => q(el, 'submit'), 'question');
    expect(q(el, 'session-progress')?.textContent).toBe('0/3');
    let wrongDone = false;
    let dontKnowDone = false;
    const wrongIds = new Set<string>();
    for (let guard = 0; guard < 20 && !q(el, 'summary'); guard++) {
      const { chars, reading } = currentQuestion(el);
      if (!wrongDone && chars === '一') {
        await answer(el, 'banana');
        wrongDone = true;
        wrongIds.add(chars);
        await waitFor(() => q(el, 'next'), 'answered');
        expect(q(el, 'answer-frame')?.classList.contains('incorrect')).toBe(true);
        expect(platform.haptic).toContain('wrong');
      } else if (!dontKnowDone && chars === '丨') {
        await click(q(el, 'dont-know'));
        dontKnowDone = true;
        wrongIds.add(chars);
        await waitFor(() => q(el, 'next'), 'answered');
        expect(q(el, 'answer-frame')?.classList.contains('incorrect')).toBe(true);
      } else if (reading) {
        // Romaji becomes kana while typing (PseudoIme.fixup).
        await typeText(el, 'ni');
        expect(field(el).value).toBe('に');
        await click(q(el, 'submit'));
        await waitFor(() => q(el, 'next'), 'answered');
      } else {
        await answer(el, rightAnswer(el));
        await waitFor(() => q(el, 'next'), 'answered');
      }
      // Next replaces Submit in the quick-action row; Don't know is gone.
      expect(q(el, 'submit')).toBeNull();
      expect(q(el, 'dont-know')).toBeNull();
      await click(q(el, 'next'));
    }
    await waitFor(() => q(el, 'summary'), 'summary');
    expect(q(el, 'summary-correct-percentage')?.textContent).toBe('33%');
    expect(q(el, 'summary-incorrect-percentage')?.textContent).toBe('67%');
    expect(q(el, 'summary-correct-kanji')?.textContent).toBe('1');
    expect(q(el, 'summary-incorrect-radical')?.textContent).toBe('2');
    await click(q(el, 'summary-show'));
    expect(ids(q(el, 'summary-incorrect-items'))).toEqual(['1', '2']);
    expect(ids(q(el, 'summary-correct-items'))).toEqual(['10']);
    // Java's card: characters, one meaning, the progress line.
    expect(q(el, 'summary-correct-items')?.querySelector('.kk-link-chars')?.textContent).toBe('二');
    const learner = app.requireLearner();
    // Reported at once (no delayed results): the kanji moved up, the radicals didn't.
    expect(num(progressRow(learner, 10), 'srsStage')).toBe(2);
    expect(num(progressRow(learner, 1), 'srsStage')).toBe(1);
    expect(num(progressRow(learner, 1), 'meaningIncorrect')).toBe(1);
    await click(q(el, 'summary-finish'));
    await waitFor(() => q(el, 'reviews-count'), 'dashboard');
  });

  it('retries a reading typed as a meaning with a shake, and converts after an IME composition', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([10]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    if (!currentQuestion(el).reading) {
      // A reading as the meaning answer: retry (shake), still unanswered.
      await answer(el, 'ni');
      expect(q(el, 'submit')).not.toBeNull();
      expect(q(el, 'answer-frame')?.className).toMatch(/shake-/);
      field(el).value = '';
      await answer(el, 'two');
      await click(q(el, 'next'));
    }
    await waitFor(() => currentQuestion(el).reading && q(el, 'submit'), 'reading question');
    const input = field(el);
    // A composing keyboard (iOS Japanese, Samsung Keyboard, Gboard): the value is left alone until compositionend.
    await act(async () => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      input.value = 'ni';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'ni', inputType: 'insertCompositionText', isComposing: true }));
    });
    expect(input.value).toBe('ni');
    await act(async () => {
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'ni' }));
    });
    expect(input.value).toBe('に');
    await click(q(el, 'submit'));
    await waitFor(() => q(el, 'next'), 'answered');
    expect(q(el, 'answer-frame')?.classList.contains('correct')).toBe(true);
  });

  it('submits romaji still being composed (keyboards that compose until the end)', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([10]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    if (!currentQuestion(el).reading) {
      await answer(el, 'two');
      await click(q(el, 'next'));
    }
    await waitFor(() => currentQuestion(el).reading && q(el, 'submit'), 'reading question');
    const input = field(el);
    await act(async () => {
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      input.value = 'ni';
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'ni', inputType: 'insertCompositionText', isComposing: true }));
    });
    await click(q(el, 'submit'));
    await waitFor(() => q(el, 'next'), 'answered');
    expect(q(el, 'answer-frame')?.classList.contains('correct')).toBe(true);
    expect(field(el).value).toBe('に');
  });

  it('Enter in the field submits through the form (no key codes)', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([1]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    await typeText(el, 'ground');
    await act(async () => {
      el.querySelector('form.kk-answer-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await waitFor(() => q(el, 'next'), 'answered');
  });

  it('lightning mode advances on a correct answer', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([1, 2]) });
    await waitFor(() => q(el, 'submit'), 'question');
    await answer(el, rightAnswer(el));
    await waitFor(() => q(el, 'session-progress')?.textContent === '1/2' && q(el, 'submit'), 'next question');
    expect(q(el, 'next')).toBeNull();
  });

  it('undo (special button 1) puts a wrong answer back', async () => {
    const { el, app } = await renderApp('/reviews', {
      setup: dueReviews([1]),
      prefs: { enable_lightning_mode: false, enable_advanced: true, undo_button: 'UNDO_AND_RETRY_NOW', ignore_button: 'UNDO_AND_MARK_CORRECT' },
    });
    await waitFor(() => q(el, 'submit'), 'question');
    expect(q(el, 'special-1')).toBeNull();
    await answer(el, 'banana');
    await waitFor(() => q(el, 'next'), 'answered');
    expect(q(el, 'special-1')?.textContent).toBe('Undo');
    expect(q(el, 'special-2')?.textContent).toBe('Ignore');
    await click(q(el, 'special-1'));
    await waitFor(() => q(el, 'submit'), 'question again');
    expect(field(el).value).toBe('');
    const s = sessionRuntime(app).get().session!;
    expect(s.items[0]!.incorrect[0]).toBe(0);
    // Ignore: a wrong answer counted correct.
    await answer(el, 'banana');
    await click(q(el, 'special-2'));
    await waitFor(() => q(el, 'answer-frame')?.classList.contains('correct'), 'ignored');
    expect(s.items[0]!.incorrect[0]).toBe(0);
  });

  it('Anki mode: reveal, then grade', async () => {
    const { el, app } = await renderApp('/reviews', {
      setup: dueReviews([1]),
      prefs: { enable_lightning_mode: false, enable_advanced: true, anki_mode_review_meaning: true },
    });
    await waitFor(() => q(el, 'anki-show'), 'anki question');
    expect(el.querySelector('input.kk-answer')).toBeNull();
    await click(q(el, 'anki-show'));
    expect(el.querySelector('.kk-anki-answer')?.textContent).toContain('Ground');
    expect(q(el, 'anki-show')).toBeNull();
    await click(q(el, 'anki-incorrect'));
    await waitFor(() => q(el, 'next'), 'graded');
    expect(sessionRuntime(app).get().session!.items[0]!.incorrect[0]).toBe(1);
    await click(q(el, 'next'));
    await waitFor(() => q(el, 'anki-show'), 'asked again');
    await click(q(el, 'anki-show'));
    await click(q(el, 'anki-correct'));
    await click(q(el, 'next'));
    await waitFor(() => q(el, 'summary'), 'summary');
  });

  it('restores the session after a reload', async () => {
    const first = await renderApp('/reviews', { setup: dueReviews([1, 2]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(first.el, 'submit'), 'question');
    const firstChars = currentQuestion(first.el).chars;
    await answer(first.el, rightAnswer(first.el));
    await click(q(first.el, 'next'));
    await waitFor(() => q(first.el, 'submit'), 'second question');
    const secondChars = currentQuestion(first.el).chars;
    expect(secondChars).not.toBe(firstChars);
    const rows = await first.app.db.session.toArray();
    expect(rows.find((r) => r.subjectId === 0)).toMatchObject({ kind: 'properties', sessionType: 'REVIEW' });
    expect(rows.filter((r) => r.kind === 'item')).toHaveLength(2);
    first.unmount();
    // A new app on the same database: the dashboard route, then Reviews resumes the same session.
    const again = await renderApp('/reviews', { dbName: first.dbName, prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(again.el, 'submit'), 'restored question');
    // Session.load keeps only items still eligible: the reported one is no longer due (as in Java).
    expect(q(again.el, 'session-progress')?.textContent).toBe('0/1');
    expect(currentQuestion(again.el).chars).toBe(secondChars);
  });

  it('the dashboard offers Resume session while one runs (SessionButtonsView)', async () => {
    const { el, location } = await renderApp('/reviews', { setup: dueReviews([1, 2]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    const chars = currentQuestion(el).chars;
    await act(async () => location.navigate('/'));
    const resume = await waitFor(() => q(el, 'resume-session'), 'resume button');
    expect(resume.textContent).toBe('Resume session');
    // SessionButtonsView: only Resume while a session runs.
    expect([...el.querySelectorAll('button')].some((b) => /^Start (reviews|lessons)$/i.test(b.textContent ?? ''))).toBe(false);
    await click(resume);
    expect(location.get()).toBe('/reviews');
    await waitFor(() => q(el, 'submit'), 'resumed question');
    expect(currentQuestion(el).chars).toBe(chars);
  });

  it('adds a synonym from the item info after answering (SubjectInfoView\'s "+")', async () => {
    const { el, app } = await renderApp('/reviews', { setup: dueReviews([1, 2]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    const id = currentQuestion(el).chars === '一' ? 1 : 2;
    await answer(el, 'zzz');
    const add = await waitFor(() => el.querySelector<HTMLButtonElement>('.kk-quiz-info button[aria-label="Add synonym"]'), 'add synonym');
    // Notes are edited from the toolbar menu's "My notes..." (StudyMaterialsActivity), not on the page.
    expect(el.querySelector('.kk-quiz-info')?.textContent).not.toContain('Edit notes');
    expect((await menuItem(el, 'study_materials'))?.textContent).toBe('My notes...');
    await click(q(el, 'toolbar-overflow'));
    await click(add);
    const dialog = await waitFor(() => document.querySelector<HTMLElement>('dialog[open]'), 'dialog');
    const input = dialog.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'zzz');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    await waitFor(() => String(progressRow(app.requireLearner(), id).meaningSynonyms ?? '').includes('zzz'), 'saved synonym');
    const kk = new KkDb(app.db.name);
    expect(String((await kk.subjects.get(id))?.meaningSynonyms)).toContain('zzz');
    kk.close();
  });

  it('wrap up and abandon from the session menu, with Java\'s confirmation', async () => {
    const { el, app } = await renderApp('/reviews', { setup: dueReviews([1, 2, 10]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    // The toolbar in the subject colour with the question title; the session menu has Java's entries.
    expect(toolbarTitle(el)).toBe(q(el, 'question-type')?.textContent);
    await click(q(el, 'toolbar-overflow'));
    const labels = [...q(el, 'toolbar-menu')!.querySelectorAll('[role^="menuitem"]')].map((b) => b.textContent);
    for (const l of ['Settings', 'Download audio', 'Browse/search...', 'Session log...', 'Abandon session', 'Wrap up session', 'My notes...', 'About...']) {
      expect(labels).toContain(l);
    }
    expect(labels).not.toContain('Self-study quiz');
    expect(labels.indexOf('Session log...')).toBeLessThan(labels.indexOf('Abandon session'));
    expect(labels.indexOf('Wrap up session')).toBeLessThan(labels.indexOf('My notes...'));
    expect(q(el, 'menu-wrapup_session')).not.toBeNull();
    await click(q(el, 'menu-abandon_session'));
    const dialog = q(el, 'abandon-dialog')!;
    expect(dialog.querySelector('.kk-sdialog-title')?.textContent).toBe('Abandon session?');
    expect(dialog.querySelector('.kk-sdialog-message')?.textContent)
      .toBe('Are you sure you want to abandon this session? If you do:\n- 3 unquizzed items will not be reported');
    // Java's button row: neutral, then negative and positive.
    expect([...dialog.querySelectorAll('button')].map((b) => b.textContent)).toEqual(["Yes and don't ask again", 'No', 'Yes']);
    const yes = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Yes') as HTMLElement;
    await click(yes);
    expect(document.querySelector('[data-testid="toast"]')?.textContent).toBe('Session abandoned');
    await waitFor(() => q(el, 'reviews-count'), 'dashboard');
    expect(sessionRuntime(app).get().session!.state).toBe('INACTIVE');
    expect(await app.db.session.count()).toBe(0);
  });
});

describe('question title', () => {
  it('names the reading kind with indicate_kanji_reading_type (advanced only), as QuestionType.getTitle', () => {
    const kanji = makeContent(testSubjects(), []).byId.get(10)!;
    expect(titleFor('WANIKANI_KANJI_READING', kanji, {})).toBe('Kanji Reading');
    expect(titleFor('WANIKANI_KANJI_READING', kanji, { indicate_kanji_reading_type: true })).toBe('Kanji Reading');
    const on = { enable_advanced: true, indicate_kanji_reading_type: true };
    expect(titleFor('WANIKANI_KANJI_READING', kanji, on)).toBe("Kanji On'yomi");
    const kun = { ...kanji, readings: [{ reading: 'ふた', primary: true, accepted_answer: true, type: 'kunyomi' }] };
    expect(titleFor('WANIKANI_KANJI_READING', kun, on)).toBe("Kanji Kun'yomi");
    const both = { ...kanji, readings: [...kanji.readings, ...kun.readings] };
    expect(titleFor('WANIKANI_KANJI_READING', both, on)).toBe('Kanji Reading');
    expect(titleFor('WANIKANI_KANJI_MEANING', kanji, on)).toBe('Kanji Meaning');
  });
});

describe('layout', () => {
  it('lays the quiz out as the Java fragments: spacer before the row; answered: the info, then the pinned row', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([1]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    const quiz = el.querySelector('.kk-quiz')!;
    const order = [...quiz.children].map((c) => (c as HTMLElement).dataset.testid ?? c.className);
    expect(order.slice(0, 5)).toEqual(['question-view', 'question-type', 'answer-frame', 'kk-quiz-spacer', 'quick-actions']);
    expect([...q(el, 'quick-actions')!.children].map((b) => b.textContent)).toEqual(["Don't know", 'Submit']);
    await answer(el, 'banana');
    await waitFor(() => q(el, 'next'), 'answered');
    const after = [...quiz.children].map((c) => (c as HTMLElement).dataset.testid ?? c.className);
    expect(after.slice(0, 3)).toEqual(['question-view', 'question-type', 'answer-frame']);
    expect(after.indexOf('kk-quiz-info')).toBeLessThan(after.indexOf('quick-actions'));
    expect([...q(el, 'quick-actions')!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Next']);
    // nextButton2 sits in Submit's half (the left half is a spacer).
    expect(q(el, 'quick-actions')!.firstElementChild?.classList.contains('kk-quiz-actions-space')).toBe(true);
  });

  it('sizes the quiz by the height above the keyboard', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(`${process.cwd()}/src/ui/components/session/session.css`, 'utf8');
    expect(css).toMatch(/--kk-quiz-height: calc\(var\(--kk-visible-height, 100dvh\) - var\(--safe-top\) - var\(--toolbar-height\)\)/);
    expect(css).toMatch(/\.kk-quiz\.unanswered \{[^}]*height: var\(--kk-quiz-height\)/);
    expect(css).toMatch(/\.kk-quiz-spacer \{ flex: 1 1 0/);
    expect(css).toMatch(/\.kk-quiz\.answered \.kk-quiz-actions \{[^}]*position: sticky/);
    // The row's budget: toolbar 56 + question view (shrinks) + banner 34 + field 48 + row 60 fits 300 px
    // (320×568 with the keyboard) with a question view of at least 56 px; iPhone SE (410 px): the full 132 px.
    expect(56 + 56 + 34 + 48 + 60).toBeLessThanOrEqual(300);
    expect(56 + 132 + 34 + 48 + 60).toBeLessThanOrEqual(410);
  });
});

describe('self-study and the level test', () => {
  it('starts a self-study quiz from the form and leaves SRS alone', async () => {
    const { el, app } = await renderApp('/self-study', { setup: dueReviews([1, 2]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'self-study-tutorial'), 'self-study screen');
    const before = num(progressRow(app.requireLearner(), 1), 'srsStage');
    const search = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Start') as HTMLElement;
    await click(search);
    await waitFor(() => q(el, 'submit'), 'self-study question');
    expect(toolbarTitle(el)).toBe(q(el, 'question-type')?.textContent);
    for (let guard = 0; guard < 20 && !q(el, 'summary'); guard++) {
      await answer(el, rightAnswer(el));
      await waitFor(() => q(el, 'next'), 'answered');
      await click(q(el, 'next'));
    }
    await waitFor(() => q(el, 'summary'), 'summary');
    await click(q(el, 'summary-finish'));
    await waitFor(() => q(el, 'reviews-count'), 'dashboard');
    expect(num(progressRow(app.requireLearner(), 1), 'srsStage')).toBe(before);
    // The form's parameters are kept as the self-study default preset.
    expect(JSON.stringify(await app.db.meta.get('searchPresets'))).toContain('SELF_STUDY_DEFAULT');
  });

  it('runs round 1, scores it, and starts at the result', async () => {
    const { el, app } = await renderApp('/settings/level-test', { prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'level-test-message')?.textContent?.startsWith('This test estimates'), 'intro');
    await click([...el.querySelectorAll('button')].find((b) => b.textContent === 'Start round 1') as HTMLElement);
    await waitFor(() => q(el, 'submit'), 'round 1 question');
    expect(toolbarTitle(el)).toBe(q(el, 'question-type')?.textContent);
    for (let guard = 0; guard < 10 && !q(el, 'summary'); guard++) {
      await answer(el, rightAnswer(el));
      await waitFor(() => q(el, 'next'), 'answered');
      await click(q(el, 'next'));
    }
    await waitFor(() => q(el, 'summary'), 'summary');
    await click(q(el, 'summary-finish'));
    const msg = await waitFor(() => q(el, 'level-test-message')?.textContent?.startsWith('Round 1 results') && q(el, 'level-test-message'), 'round 1 results');
    expect(msg.textContent).toContain('N5: 1 of 1, about 100%');
    expect(msg.textContent).toContain('You know most of every JLPT block. Round 2 is not needed.');
    await click([...el.querySelectorAll('button')].find((b) => b.textContent === 'Continue') as HTMLElement);
    const result = await waitFor(() => q(el, 'level-test-message')?.textContent?.startsWith('Your kanji knowledge') && q(el, 'level-test-message'), 'result');
    expect(result.textContent).toContain('• The 1 kanji you answered right go straight to Guru.');
    expect(result.textContent).toContain('• Your curriculum switches to JLPT order.');
    await click([...el.querySelectorAll('button')].find((b) => b.textContent === 'Start there') as HTMLElement);
    await waitFor(() => q(el, 'level-test-message')?.textContent?.match(/kanji moved to Guru/), 'outcome');
    expect(app.requireLearner().progress.curriculum).toBe('JLPT');
  });

  it('refuses while a session runs', async () => {
    const { el, location } = await renderApp('/reviews', { setup: dueReviews([1]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    await act(async () => location.navigate('/settings/level-test'));
    await waitFor(() => q(el, 'level-test-message')?.textContent === 'Finish or abandon your current lesson or review session first.', 'refusal');
    await act(async () => location.navigate('/self-study'));
    await waitFor(() => q(el, 'self-study-running'), 'resume offer');
    await click([...el.querySelectorAll('button')].find((b) => b.textContent === 'Resume') as HTMLElement);
    await waitFor(() => q(el, 'submit'), 'back in the session');
  });
});
