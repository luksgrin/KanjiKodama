import { expect, test } from '@playwright/test';
import { subjectsAt } from './helpers/content';
import {
  answer, answerAllCorrect, checkQuickActions, checkScreen, dashboardCounts, keyboardTopFor, next, openApp, quiz, throughPresentation,
} from './helpers/app';

test('first start: content loads and the dashboard shows the counts', async ({ page }, info) => {
  await page.goto('./');
  // The start-up screen, then the app.
  await openApp(page);
  const radicals = await subjectsAt(1, 'radical');
  const counts = await dashboardCounts(page);
  expect(counts.lessons).toBe(radicals.length);
  expect(counts.reviews).toBe(0);
  await expect(page.getByRole('button', { name: /Reviews: 0 available/ })).toBeDisabled();
  await expect(page.getByText('Level 1 progress')).toBeVisible();
  await expect(page.getByText(`0/${radicals.length}`).first()).toBeVisible();
  await checkScreen(page, info, '01-dashboard-first-start');
});

test('lesson batch: presentation, quiz, summary', async ({ page }, info) => {
  await openApp(page);
  const before = await dashboardCounts(page);
  await page.getByRole('button', { name: /Lessons: \d+ available/ }).click();
  await expect(page.getByRole('region', { name: 'Lesson' })).toBeVisible();
  const batch = await throughPresentation(page, async (i) => {
    if (i === 0) await checkScreen(page, info, '02-lesson-presentation');
  });
  expect(batch).toBeGreaterThan(0);

  // Quiz: layout before answering; one wrong answer shows the answered state (Next in Submit's place);
  // then every answer correct (lightning mode moves on by itself).
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  await checkQuickActions(page, 'lesson quiz', keyboardTopFor(info));
  await checkScreen(page, info, '03-lesson-quiz');
  const wrong = await answer(page, 'wrong');
  expect(wrong.advanced).toBe(false);
  await expect(page.getByTestId('answer-frame')).toHaveClass(/incorrect/);
  await expect(page.getByTestId('next')).toBeVisible();
  await expect(page.getByTestId('submit')).toHaveCount(0);
  await expect(page.getByTestId('dont-know')).toHaveCount(0);
  await checkQuickActions(page, 'lesson quiz answered');
  await checkScreen(page, info, '04-lesson-quiz-answered');
  await next(page);
  await answerAllCorrect(page);

  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('summary-correct-radical')).toHaveText(String(batch - 1));
  await expect(page.getByTestId('summary-incorrect-radical')).toHaveText('1');
  await expect(page.getByTestId('summary-correct-percentage')).toHaveText(`${Math.round(((batch - 1) / batch) * 100)}%`);
  await checkScreen(page, info, '05-summary');
  await page.getByTestId('summary-finish').click();

  await expect(page.getByTestId('lessons-count')).toHaveText(String(before.lessons - batch));
  await expect(page.getByTestId('reviews-count')).toHaveText('0');
  await expect(page.locator('.kk-dashboard')).toContainText(/Apprentice/);
});
