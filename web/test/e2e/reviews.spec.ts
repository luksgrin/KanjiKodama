import { expect, test } from '@playwright/test';
import {
  answer, answerAllCorrect, checkQuickActions, checkScreen, dashboardCounts, enableUndoButton, keyboardTopFor, next,
  openApp, questionInfo, quiz, restoreFile, watchSessionStandIns,
} from './helpers/app';
import { writeReviewSeed } from './helpers/progress';

test('review session: correct, wrong, Don\'t know, undo, summary', async ({ page }, info) => {
  const seed = await writeReviewSeed(info, { radicals: 4 });
  await openApp(page);
  await restoreFile(page, seed.path);
  expect((await dashboardCounts(page)).reviews).toBe(seed.due);
  await checkScreen(page, info, '06-dashboard-reviews-due');
  await enableUndoButton(page);

  await openApp(page, '/');
  await page.getByTestId('start-reviews').click();
  await expect(quiz(page)).toBeVisible();
  await checkQuickActions(page, 'review quiz', keyboardTopFor(info));
  await checkScreen(page, info, '07-review-quiz');

  // 1. Correct (lightning mode: straight on to the next question).
  const first = await answer(page, 'correct', 'keyboard');
  expect(first.advanced).toBe(true);

  // 2. Wrong, then Undo (special button 1, "Undo": retry now): the same question, unanswered again.
  const wrong = await answer(page, 'wrong', 'keyboard');
  expect(wrong.advanced).toBe(false);
  await expect(page.getByTestId('answer-frame')).toHaveClass(/incorrect/);
  await checkQuickActions(page, 'review quiz answered');
  await checkScreen(page, info, '08-review-quiz-wrong');
  await expect(page.getByTestId('special-1')).toHaveText('Undo');
  await page.getByTestId('special-1').click();
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  expect(await questionInfo(page)).toEqual(wrong.question);
  await expect(page.getByTestId('submit')).toBeVisible();
  const retried = await answer(page, 'correct', 'keyboard');
  expect(retried.advanced).toBe(true);

  // 3. Don't know: answered as incorrect, the answer shown.
  const dk = await answer(page, 'dontknow');
  expect(dk.advanced).toBe(false);
  await expect(page.getByTestId('answer-frame')).toHaveClass(/incorrect/);
  await checkScreen(page, info, '09-review-dont-know');
  await next(page);

  // The rest correct (the Don't-know item comes back until it is answered).
  const standIns = await watchSessionStandIns(page);
  await answerAllCorrect(page);
  await expect(page.getByTestId('summary')).toBeVisible();
  // 4 radicals: the undone wrong answer doesn't count, the Don't know one does.
  await expect(page.getByTestId('summary-correct-radical')).toHaveText('3');
  await expect(page.getByTestId('summary-incorrect-radical')).toHaveText('1');
  await expect(page.getByTestId('summary-correct-percentage')).toHaveText('75%');
  await page.getByTestId('summary-show').click();
  await expect(page.getByTestId('summary-incorrect-items').getByRole('button')).toHaveCount(1);
  await expect(page.getByTestId('summary-correct-items').getByRole('button')).toHaveCount(3);
  await checkScreen(page, info, '10-review-summary-items');
  await page.getByTestId('summary-finish').click();
  await expect(page.getByTestId('reviews-count')).toHaveText('0');
  // Quiz → summary → dashboard without a frame of "Loading…" or "No session to summarize" + Dashboard.
  expect(await standIns.seen(), 'stand-in states shown on the way out of the session').toEqual([]);
});
