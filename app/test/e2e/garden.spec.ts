/**
 * The study garden: reviews grow today's plant and start a streak (dashboard panel and the Study
 * garden screen), the log goes into the saved progress file, and restoring that file on a fresh
 * device brings the calendar back.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { answerAllCorrect, checkScreen, noHorizontalScroll, openApp, restoreFile } from './helpers/app';
import { writeReviewSeed } from './helpers/progress';

/** No share sheet: Save falls back to a download. */
const noShare = () => {
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
};

test('reviews grow the garden; the calendar travels in the progress file', async ({ page, browser }, info) => {
  await page.addInitScript(noShare);
  const seed = await writeReviewSeed(info, { radicals: 3 });
  await openApp(page);
  await restoreFile(page, seed.path);

  const garden = page.getByTestId('study-garden');
  await expect(garden).toBeVisible();
  await expect(page.getByTestId('garden-streak')).toHaveText('Plant your first sprout today');
  await checkScreen(page, info, '80-dashboard-garden-empty');

  // Three reviews, all right.
  await page.getByTestId('start-reviews').click();
  await answerAllCorrect(page);
  await page.getByTestId('summary-finish').click();
  await expect(page.getByTestId('reviews-count')).toHaveText('0');

  await expect(page.getByTestId('garden-streak')).toHaveText('Streak 1 day');
  await expect(garden.locator('.kk-garden-week-day.today')).toHaveAttribute('data-level', '1');
  await checkScreen(page, info, '81-dashboard-garden-sprout');

  // The Study garden screen.
  await garden.click();
  await expect(page.getByTestId('stats-screen')).toBeVisible();
  await expect(page.getByTestId('streak-current')).toHaveText('1');
  await expect(page.getByTestId('streak-best')).toHaveText('1');
  await expect(page.locator('.kk-garden-cell.today')).toHaveAttribute('data-level', '1');
  await expect(page.getByTestId('garden-detail')).toContainText(': 3 reviews (100 % right)');
  await expect(page.getByTestId('garden-all-totals')).toContainText('Reviews3');
  await checkScreen(page, info, '82-garden-month', { strict: true, fullPage: true });
  await page.getByTestId('garden-view-year').click();
  await expect(page.locator('.kk-garden-dot.today')).toHaveClass(/l1/);
  await checkScreen(page, info, '83-garden-year', { strict: true, fullPage: true });

  // Saved progress carries the day…
  await openApp(page, '/settings');
  const download = page.waitForEvent('download');
  await page.getByTestId('progress-save').click();
  const path = info.outputPath('garden-progress.json');
  await (await download).saveAs(path);
  const saved = JSON.parse(readFileSync(path, 'utf8')) as { activity?: { day: string; reviews: number; correct: number }[] };
  expect(saved.activity).toHaveLength(1);
  expect(saved.activity![0]).toMatchObject({ reviews: 3, correct: 3 });

  // …and a fresh device gets it back with the restore.
  const fresh = await browser.newContext({
    baseURL: info.project.use.baseURL, viewport: page.viewportSize(), locale: 'en-US', timezoneId: 'Asia/Tokyo', serviceWorkers: 'block',
  });
  const other = await fresh.newPage();
  await openApp(other);
  await expect(other.getByTestId('garden-streak')).toHaveText('Plant your first sprout today');
  await restoreFile(other, path);
  await expect(other.getByTestId('garden-streak')).toHaveText('Streak 1 day');
  await openApp(other, '/stats');
  await expect(other.locator('.kk-garden-cell.today')).toHaveAttribute('data-level', '1');
  await fresh.close();
});

test('the garden screen fits narrow phones in both views, without study', async ({ page }, info) => {
  await openApp(page, '/stats');
  await expect(page.getByTestId('streak-current')).toHaveText('0');
  await noHorizontalScroll(page, 'garden month');
  await page.getByTestId('garden-prev').click();
  await page.getByTestId('garden-view-year').click();
  await expect(page.getByTestId('garden-year').locator('.kk-garden-mini')).toHaveCount(12);
  await noHorizontalScroll(page, 'garden year');
  await checkScreen(page, info, '84-garden-year-empty', { strict: true, fullPage: true });
});
