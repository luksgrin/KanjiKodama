// @vitest-environment jsdom
/**
 * The session, summary, level test and item page screens: toolbar title and
 * colour, the session menu items, the session log, the summary's blocks and button order, the level test
 * as a dialog over the dashboard, the answer field.
 */
import 'fake-indexeddb/auto';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, click, dueReviews, q, renderApp, rightAnswer, typeText, waitFor } from './helpers';

afterEach(cleanup);

const toolbar = (el: HTMLElement) => q(el, 'toolbar')!;
const title = (el: HTMLElement) => toolbar(el).querySelector('h1')?.textContent;
const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLElement | undefined;

async function openMenu(el: HTMLElement): Promise<string[]> {
  if (q(el, 'toolbar-menu') === null) await click(q(el, 'toolbar-overflow'));
  return [...q(el, 'toolbar-menu')!.querySelectorAll('[role^="menuitem"]')].map((b) => b.textContent ?? '');
}

describe('quiz screen', () => {
  it('colours the toolbar like the subject and titles it with the question type', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([10]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    expect(title(el)).toBe(q(el, 'question-type')?.textContent);
    expect(toolbar(el).getAttribute('style')).toContain('var(--color-kanji)');
    // The answer field: centred underlined field with the hint; the menu is not on the question view.
    const input = el.querySelector<HTMLInputElement>('input.kk-answer')!;
    expect(input.placeholder).toMatch(/^(Your response|答え)$/);
    expect(q(el, 'session-menu')).toBeNull();
    expect(q(el, 'question-view')?.querySelectorAll('button')).toHaveLength(0);
  });

  it('shows the answer band, the mark and Next in Submit\'s place after answering', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([1]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    await typeText(el, 'banana');
    await click(q(el, 'submit'));
    await waitFor(() => q(el, 'next'), 'answered');
    expect(q(el, 'answer-frame')?.className).toContain('incorrect');
    expect(q(el, 'answer-mark')?.textContent).toBe('✗');
    expect(q(el, 'question-view')?.className).toContain('with-mark');
    // The item info's cards and the reveal button sit in the headline.
    expect(el.querySelector('.kk-quiz-info .kk-headline-buttons [data-testid="reveal"]')).not.toBeNull();
  });

  it('wraps up with the toast and dialog', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([1, 2, 10]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    await openMenu(el);
    await click(q(el, 'menu-wrapup_session'));
    const dialog = q(el, 'wrapup-dialog')!;
    expect(dialog.querySelector('.kk-sdialog-icon')).not.toBeNull();
    await click(button(dialog, 'Yes')!);
    expect(document.querySelector('[data-testid="toast"]')?.textContent).toBe('Session wrapping up...');
    expect(q(el, 'wrapup-dialog')).toBeNull();
  });
});

describe('session log', () => {
  it('lists the items by state, hides unstarted subjects and closes with back', async () => {
    const { el, app } = await renderApp('/reviews', { setup: dueReviews([1, 2, 10]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    await typeText(el, rightAnswer(el));
    await click(q(el, 'submit'));
    await waitFor(() => q(el, 'next'), 'answered');
    await click(q(el, 'next'));
    await waitFor(() => q(el, 'submit'), 'next question');
    const labels = await openMenu(el);
    expect(labels).toContain('Session log...');
    await click(q(el, 'menu-session_log'));
    const log = await waitFor(() => q(el, 'session-log'), 'log');
    expect(title(el)).toBe('Session log');
    expect(q(el, 'session-log-tutorial')?.textContent).toContain('By default, this session log shows only limited information');
    const headers = [...log.querySelectorAll('.kk-log-title')].map((h) => h.textContent);
    expect(headers[headers.length - 1]).toBe('Items not started');
    expect(log.querySelector('[data-testid="log-header-notstarted"] .kk-log-details')?.textContent).toMatch(/^\d+ items?$/);
    // Not started: "?" and not clickable; the status lines.
    const unstarted = log.querySelector('[data-testid="log-header-notstarted"]')!.parentElement!;
    expect(unstarted.querySelector('.kk-log-unknown')?.textContent).toBe('?');
    expect(unstarted.querySelector('button.kk-log-row')).toBeNull();
    expect(log.textContent).toMatch(/(Name|Meaning|Reading): (Unanswered|Done, no incorrect answers)/);
    // Collapse a group.
    await click(q(el, 'log-header-notstarted'));
    expect(unstarted.querySelector('.kk-log-list')).toBeNull();
    // Dismiss the tutorial (session_log_dismissed).
    await click(button(q(el, 'session-log-tutorial')!, 'Dismiss')!);
    expect(app.get().prefs.session_log_dismissed).toBe(true);
    // The toolbar arrow closes it.
    await click(q(el, 'toolbar-back'));
    await waitFor(() => q(el, 'submit'), 'back at the quiz');
  });
});

describe('lesson presentation', () => {
  it('titles the toolbar "一 (level 1 radical)" and hides Previous on the first item', async () => {
    const { el } = await renderApp('/lessons', { prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'lesson-next'), 'presentation');
    expect(title(el)).toMatch(/^(一|丨) \(level 1 radical\)$/);
    expect(toolbar(el).getAttribute('style')).toContain('var(--color-radical)');
    expect(q(el, 'lesson-previous')).toBeNull();
    const labels = await openMenu(el);
    expect(labels).toContain('My notes...');
    expect(labels).toContain('Abandon session');
    expect(labels).not.toContain('Wrap up session');
    await click(q(el, 'menu-study_materials'));
    const notes = await waitFor(() => q(el, 'notes-dialog'), 'notes');
    expect(notes.querySelector('.kk-sdialog-title')?.textContent).toMatch(/^My notes for (一|丨) \(level 1 radical\):$/);
    await click(button(notes, 'Cancel')!);
  });
});

describe('summary', () => {
  it('has Show items · Finish at the top and the green and red blocks', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([1]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    await typeText(el, rightAnswer(el));
    await click(q(el, 'submit'));
    await waitFor(() => q(el, 'next'), 'answered');
    await click(q(el, 'next'));
    const summary = await waitFor(() => q(el, 'summary'), 'summary');
    expect(title(el)).toBe('Session summary');
    expect([...summary.querySelector('.kk-summary-buttons')!.querySelectorAll('button')].map((b) => b.textContent))
      .toEqual(['Show items', 'Finish']);
    expect(q(el, 'summary-correct')?.className).toContain('correct');
    expect(q(el, 'summary-incorrect')?.className).toContain('incorrect');
    expect(q(el, 'summary-correct')?.querySelector('th')?.textContent).toBe('Overall percentage correct:');
    await click(q(el, 'summary-show'));
    expect(q(el, 'summary-correct')).toBeNull();
    expect(summary.textContent).toContain('Items with only correct answers:');
    expect(q(el, 'summary-correct-items')?.querySelector('.kk-link.kk-type--radical')).not.toBeNull();
  });
});

describe('level test', () => {
  it('is a dialog over the dashboard', async () => {
    const { el, location } = await renderApp('/settings/level-test', { prefs: { enable_lightning_mode: false } });
    const dialog = await waitFor(() => q(el, 'level-test-dialog'), 'dialog');
    await waitFor(() => q(el, 'level-test-message')?.textContent?.startsWith('This test estimates'), 'intro');
    expect(dialog.querySelector('.kk-sdialog-title')?.textContent).toBe('Kanji level test');
    expect([...dialog.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Cancel', 'Start round 1']);
    // The dashboard is behind it.
    expect(q(el, 'level-test')?.querySelector('[data-testid="reviews-count"], [data-testid="lessons-count"]')).not.toBeNull();
    await click(button(dialog, 'Cancel')!);
    await act(async () => undefined);
    expect(location.get()).toBe('/');
  });
});

describe('item page', () => {
  it('titles the toolbar with the info title in the subject colour and offers My notes...', async () => {
    const { el } = await renderApp('/subject/10');
    await waitFor(() => el.querySelector('.kk-item'), 'item page');
    expect(title(el)).toBe('二 (level 1 kanji)');
    expect(toolbar(el).getAttribute('style')).toContain('var(--color-kanji)');
    const labels = await openMenu(el);
    expect(labels).toContain('My notes...');
    expect(labels).not.toContain('Abandon session');
    // Cards with the progress line ("Used radicals:").
    expect(el.querySelector('.kk-links .kk-link.kk-type--radical .kk-link-meaning')?.textContent).toBe('Ground');
  });
});

describe('placement and focus', () => {
  it('puts Don\'t know | Submit after a spacer at the bottom, Next in the grown header and at the bottom', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([10]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    const quiz = el.querySelector('section.kk-quiz')!;
    expect(quiz.className).toContain('unanswered');
    const kids = [...quiz.children].map((c) => c.className || c.getAttribute('data-testid'));
    expect(kids.indexOf('kk-quiz-spacer')).toBeLessThan(kids.findIndex((k) => k === 'kk-quiz-actions'));
    expect(kids.indexOf('kk-quiz-spacer')).toBeGreaterThan(kids.findIndex((k) => k?.startsWith('kk-quiz-answer')));
    await typeText(el, 'banana');
    await click(q(el, 'submit'));
    const next = await waitFor(() => q(el, 'next'), 'answered');
    // Next in the question view, focused; the second Next in the bottom row.
    expect(q(el, 'question-view')?.contains(next)).toBe(true);
    expect(next.className).toContain('kk-btn-focus');
    expect(document.activeElement).toBe(next);
    expect(q(el, 'quick-actions')?.contains(q(el, 'next-bottom'))).toBe(true);
    await click(q(el, 'next-bottom'));
    await waitFor(() => q(el, 'submit'), 'next question');
    // The new question's field has the focus (taken over from the keyboard keeper).
    expect(document.activeElement).toBe(el.querySelector('input.kk-answer'));
  });

  it('keeps the focus in the answer field while a session dialog is open, and Enter does not submit', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([10, 11]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    const input = el.querySelector<HTMLInputElement>('input.kk-answer')!;
    act(() => input.focus());
    await typeText(el, 'banana');
    await openMenu(el);
    act(() => input.focus()); // the toolbar menu leaves the keyboard open (tested in the shell)
    await click(q(el, 'menu-wrapup_session'));
    const dialog = q(el, 'wrapup-dialog')!;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.getAttribute('aria-labelledby')).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(el.querySelector('dialog[open]')).toBeNull();
    // Enter in the field: nothing (the dialog has the input focus).
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      input.form!.requestSubmit();
    });
    expect(q(el, 'next')).toBeNull();
    // Tab goes into the dialog.
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    expect(dialog.contains(document.activeElement)).toBe(true);
    act(() => input.focus());
    await click(button(dialog, 'No')!);
    expect(q(el, 'wrapup-dialog')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('focuses Finish on the summary', async () => {
    const { el } = await renderApp('/reviews', { setup: dueReviews([1]), prefs: { enable_lightning_mode: false } });
    await waitFor(() => q(el, 'submit'), 'question');
    await typeText(el, rightAnswer(el));
    await click(q(el, 'submit'));
    await waitFor(() => q(el, 'next'), 'answered');
    await click(q(el, 'next'));
    const finish = await waitFor(() => q(el, 'summary-finish'), 'summary');
    expect(finish.className).toContain('kk-btn-focus');
    expect(document.activeElement).toBe(finish);
  });

  it('applies the Display and Keyboard settings to the quiz', async () => {
    const { el } = await renderApp('/reviews', {
      setup: dueReviews([10]),
      prefs: {
        enable_lightning_mode: false, center_caret: true, quiz_question_view_height: 150, stretch_quiz_question_view: true,
        enable_auto_correct_meaning: true, enable_auto_correct_reading: true,
      },
    });
    await waitFor(() => q(el, 'submit'), 'question');
    const quiz = el.querySelector<HTMLElement>('section.kk-quiz')!;
    expect(quiz.className).toContain('stretch');
    expect(quiz.style.getPropertyValue('--kk-qv-fixed')).toBe('150px');
    expect(q(el, 'question-view')?.className).toContain('fixed');
    const input = el.querySelector<HTMLInputElement>('input.kk-answer')!;
    expect(input.className).toContain('centered');
    expect(input.getAttribute('autocorrect')).toBe('on');
    expect(input.getAttribute('spellcheck')).toBe('true');
    expect(input.getAttribute('autocapitalize')).toBe('none');
  });

  it('pins the Anki buttons at the bottom, anki_buttons_height high', async () => {
    const { el } = await renderApp('/reviews', {
      setup: dueReviews([10]),
      prefs: { enable_lightning_mode: false, enable_advanced: true, anki_mode_review_meaning: true, anki_mode_review_reading: true, anki_buttons_height: 80 },
    });
    await waitFor(() => q(el, 'anki-show'), 'anki question');
    const bar = q(el, 'quick-actions')!;
    expect(bar.className).toBe('kk-anki-bar');
    expect(el.querySelector<HTMLElement>('section.kk-quiz.anki')!.style.getPropertyValue('--kk-anki-height')).toBe('80px');
    expect(q(el, 'anki-show')?.className).not.toContain('kk-btn');
  });
});

describe('full session log', () => {
  it('lists the events newest first with the elapsed time', async () => {
    const { el, clock } = await renderApp('/reviews', {
      setup: dueReviews([10]),
      prefs: { enable_lightning_mode: false, enable_advanced: true, full_session_log: true },
    });
    await waitFor(() => q(el, 'submit'), 'question');
    await typeText(el, 'banana');
    await click(q(el, 'submit'));
    await waitFor(() => q(el, 'next'), 'answered');
    clock.advance(12_000);
    await openMenu(el);
    await click(q(el, 'menu-session_log'));
    await waitFor(() => q(el, 'session-log'), 'log');
    expect(q(el, 'log-header-events')?.querySelector('.kk-log-details')?.textContent).toBe('2 events');
    const rows = [...el.querySelectorAll('.kk-log-event')].map((r) => r.querySelector('.kk-pre-line')?.textContent);
    expect(rows[0]).toMatch(/^Submit (Meaning|Reading|Name): .+\nIncorrect$/);
    expect(rows[1]).toBe('Review session started');
    expect(el.querySelector('.kk-log-event .kk-log-status')?.textContent).toMatch(/^12s ago/);
  });
});
