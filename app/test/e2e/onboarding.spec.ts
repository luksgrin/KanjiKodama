/** The getting-started guide: first start, both curriculum paths, skipping, and existing learners. */
import { expect, test, type Page } from '@playwright/test';
import { checkScreen, openApp, restoreFile, waitReady } from './helpers/app';
import { writeReviewSeed } from './helpers/progress';

const shell = (page: Page) => page.locator('.kk-shell');
const guide = (page: Page) => page.getByTestId('onboarding');
const next = (page: Page) => page.getByTestId('onboarding-next').click();

async function expectStep(page: Page, step: string): Promise<void> {
  await expect(guide(page)).toHaveAttribute('data-step', step);
}

test('first start: every step with its defaults keeps WaniKani order; not shown again', async ({ page }, info) => {
  await openApp(page, '/', { keepOnboarding: true });
  await expect(shell(page)).toHaveAttribute('data-route', 'welcome');
  await expectStep(page, 'welcome');
  await checkScreen(page, info, 'onboarding-1-welcome', { strict: true });
  for (const [i, step] of (['appearance', 'quiz', 'path', 'start', 'done'] as const).entries()) {
    await next(page);
    await expectStep(page, step);
    await checkScreen(page, info, `onboarding-${i + 2}-${step}`, { strict: true });
  }
  await page.getByTestId('onboarding-finish').click();
  await expect(shell(page)).toHaveAttribute('data-route', 'dashboard');
  await expect(page.getByTestId('level-duration')).toHaveText(/^You are level 1\. /);

  await page.reload();
  await waitReady(page);
  await expect(shell(page)).toHaveAttribute('data-route', 'dashboard');
});

test('JLPT path: switches the order, offers the level test and fast travel', async ({ page }) => {
  await openApp(page, '/', { keepOnboarding: true });
  for (let i = 0; i < 3; i++) await next(page);
  await expectStep(page, 'path');
  await page.getByTestId('onboarding-path-JLPT').click();
  await next(page);
  await expectStep(page, 'start');
  await expect(guide(page)).toContainText('You are in JLPT order');
  await expect(page.getByTestId('onboarding-start-FAST_TRAVEL')).toBeVisible();
  await expect(page.getByTestId('onboarding-start-IMPORT')).toHaveCount(0);
  await page.getByTestId('onboarding-back').click();
  await expectStep(page, 'path');
  await next(page); // already JLPT: nothing to switch
  await expectStep(page, 'start');
  await next(page); // from the beginning
  await page.getByTestId('onboarding-finish').click();
  await expect(page.getByTestId('level-duration')).toContainText('You are level 1 (N5');
});

test('the level test choice ends the guide on the level test', async ({ page }) => {
  await openApp(page, '/', { keepOnboarding: true });
  for (let i = 0; i < 4; i++) await next(page);
  await page.getByTestId('onboarding-start-LEVEL_TEST').click();
  await next(page);
  await expect(page.getByTestId('level-test-dialog')).toBeVisible();
  await expect(page.getByTestId('level-test-message')).toContainText('This test estimates');
});

test('Skip guide: straight to the dashboard, also after a restart', async ({ page }) => {
  await openApp(page, '/', { keepOnboarding: true });
  await page.getByTestId('onboarding-skip').click();
  await expect(shell(page)).toHaveAttribute('data-route', 'dashboard');
  await page.reload();
  await waitReady(page);
  await expect(shell(page)).toHaveAttribute('data-route', 'dashboard');
});

test('a learner with progress never sees it; Settings opens it again', async ({ page }, info) => {
  const seed = await writeReviewSeed(info, { radicals: 2 });
  // Started away from the dashboard: the guide doesn't open, and is never marked done.
  await openApp(page, '/settings/about');
  await restoreFile(page, seed.path);
  await page.reload();
  await waitReady(page);
  await expect(shell(page)).toHaveAttribute('data-route', 'dashboard');

  await openApp(page, '/settings');
  await page.getByTestId('link-welcome').click();
  await expectStep(page, 'welcome');
  await expect(page.getByTestId('toolbar-back')).toBeVisible();
});
