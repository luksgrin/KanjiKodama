/** Java look details outside sessions and settings: radical images, Java sizes, scroll position on Back. */
import { expect, test } from '@playwright/test';
import { checkScreen, openApp, settle, tab, toolbarBack } from './helpers/app';

test('image-only radicals show their image (item page headline and toolbar, browse results)', async ({ page }, info) => {
  // 8787 "yurt": Subject.getTitleImageId → radical_8787.xml.
  await openApp(page, '/subject/8787');
  const tile = page.locator('.kk-subject-tile [data-testid="title-image"]');
  await expect(tile).toBeVisible();
  await expect(tile).toHaveAttribute('aria-label', 'yurt');
  await expect(page.locator('.kk-toolbar [data-testid="title-image"]')).toHaveCount(1);
  await expect(page.locator('.kk-subject-tile')).not.toContainText('yurt');
  await checkScreen(page, info, '80-item-radical-image');

  const level = Number(/level (\d+)/i.exec(await page.locator('.kk-headline-title').innerText())?.[1]);
  await openApp(page, `/browse/results?t=0&q=${level}`);
  await expect(page.locator('[data-testid="result-8787"] [data-testid="title-image"]')).toBeVisible();
});

test('browse level cells have the Java size (~31 dp tall, 2 dp apart, 8 dp between rows)', async ({ page }) => {
  await openApp(page);
  await tab(page, 'Browse');
  await settle(page);
  const a = (await page.getByTestId('browse-level-1').boundingBox())!;
  const b = (await page.getByTestId('browse-level-2').boundingBox())!;
  expect(Math.round(a.height)).toBeGreaterThanOrEqual(30);
  expect(Math.round(a.height)).toBeLessThanOrEqual(32);
  expect(Math.round(b.x - (a.x + a.width))).toBe(2);
  const cols = await page.getByTestId('browse-levels').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  const below = (await page.getByTestId(`browse-level-${cols + 1}`).boundingBox())!;
  expect(Math.round(below.y - (a.y + a.height))).toBe(8);
});

test('the settings root keeps its scroll position when coming back from a sub-screen', async ({ page }) => {
  await openApp(page, '/settings');
  await expect(page.getByTestId('settings-root')).toBeVisible();
  const row = page.getByTestId('settings-root').locator('[data-testid^="screen-"]').last();
  await row.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 40));
  const before = await page.evaluate(() => Math.round(window.scrollY));
  test.skip(before === 0, 'the settings root fits the viewport');
  await row.click();
  await expect(page.getByTestId('settings-root')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await toolbarBack(page);
  await expect(page.getByTestId('settings-root')).toBeVisible();
  await settle(page);
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(before);
});
