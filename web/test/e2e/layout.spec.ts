/**
 * Layout on every device: each main screen without sideways scroll, tap targets ≥ 40 px, no clipped
 * text (soft failures, so one run lists them all), and the quiz's quick-action row directly under the
 * answer field, inside the viewport, and above the keyboard on the iPhone SE (top 410 px).
 */
import { expect, test } from '@playwright/test';
import { answer, checkQuickActions, checkScreen, keyboardTopFor, openApp, quiz, restoreFile, tab } from './helpers/app';
import { writeReviewSeed } from './helpers/progress';

test('main screens', async ({ page }, info) => {
  const seed = await writeReviewSeed(info, { radicals: 2, kanji: 2 });
  await openApp(page);
  await restoreFile(page, seed.path);

  await checkScreen(page, info, 'L01-dashboard', { strict: true });
  await checkScreen(page, info, 'L01-dashboard-full', { strict: true, fullPage: true });

  await page.getByRole('button', { name: /Reviews: \d+ available/ }).click();
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  await checkQuickActions(page, 'review quiz', keyboardTopFor(info));
  const row = await page.getByTestId('quick-actions').boundingBox();
  info.annotations.push({ type: 'quick-actions', description: `bottom at ${Math.round((row?.y ?? 0) + (row?.height ?? 0))}px of ${page.viewportSize()?.height}px` });
  await checkScreen(page, info, 'L02-quiz', { strict: true });
  await answer(page, 'wrong');
  await checkQuickActions(page, 'review quiz answered', keyboardTopFor(info));
  await checkScreen(page, info, 'L03-quiz-answered', { strict: true });
  await checkScreen(page, info, 'L03-quiz-answered-full', { strict: true, fullPage: true });
  await page.getByTestId('session-menu').click();
  await checkScreen(page, info, 'L04-session-menu', { strict: true });
  await page.getByTestId('menu-wrapup').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Yes$/ }).click().catch(() => undefined);

  await openApp(page, '/');
  await tab(page, 'Browse');
  await checkScreen(page, info, 'L05-browse', { strict: true });
  await checkScreen(page, info, 'L05-browse-full', { strict: true, fullPage: true });
  await page.getByTestId('browse-level-1').click();
  await expect(page.getByTestId('num-hits')).toBeVisible();
  await checkScreen(page, info, 'L06-search-results', { strict: true });
  await page.locator('[data-testid^="result-"]').first().click();
  await expect(page).toHaveURL(/#\/subject\/\d+$/);
  await checkScreen(page, info, 'L07-item-page', { strict: true });
  await checkScreen(page, info, 'L07-item-page-full', { strict: true, fullPage: true });

  await openApp(page, '/');
  await tab(page, 'Study');
  await checkScreen(page, info, 'L08-self-study', { strict: true });
  await tab(page, 'Settings');
  await checkScreen(page, info, 'L09-settings', { strict: true });
  await checkScreen(page, info, 'L09-settings-full', { strict: true, fullPage: true });
  await openApp(page, '/settings/advanced');
  await checkScreen(page, info, 'L10-advanced', { strict: true });
  await openApp(page, '/settings/about');
  await checkScreen(page, info, 'L11-about-full', { strict: true, fullPage: true });
  await openApp(page, '/settings/level-test');
  await checkScreen(page, info, 'L12-level-test', { strict: true });
  await openApp(page, '/settings/fast-travel');
  await checkScreen(page, info, 'L13-fast-travel', { strict: true });
});
