/** Look details outside sessions and settings: radical images, sizes, scroll position on Back. */
import { expect, test } from '@playwright/test';
import { checkScreen, openApp, settle, tab, toolbarBack } from './helpers/app';

test('image-only radicals show their image (item page headline and toolbar, browse results)', async ({ page }, info) => {
  // 8787 "yurt": drawn from radical_8787.xml.
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

test('browse level cells have their size (~31 px tall, 2 px apart, 8 px between rows)', async ({ page }) => {
  await openApp(page);
  await tab(page, 'Browse');
  await settle(page);
  // One measurement of the whole grid, repeated until the screen's slide-in and the column count (set
  // from a ResizeObserver) have settled: separate boundingBox calls could catch two different frames.
  const measure = () => page.getByTestId('browse-levels').evaluate((grid) => {
    const box = (n: number) => grid.querySelector(`[data-testid="browse-level-${n}"]`)!.getBoundingClientRect();
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const a = box(1), b = box(2), below = box(cols + 1);
    return { height: Math.round(a.height), across: Math.round(b.left - a.right), down: Math.round(below.top - a.bottom) };
  });
  await expect.poll(async () => { const m = await measure(); return [m.across, m.down]; }).toEqual([2, 8]);
  const { height } = await measure();
  expect(height).toBeGreaterThanOrEqual(30);
  expect(height).toBeLessThanOrEqual(32);
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

test('KanjiKodama Black: a pure black ground in dark mode, kept after a restart', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page, '/settings?screen=display_settings');
  await page.getByTestId('setting-nightTheme').click();
  await page.getByTestId('choice-nightTheme-KANJIKODAMA_BLACK').click();
  await expect(page.getByTestId('setting-nightTheme')).toContainText('KanjiKodama Black is used in system wide dark mode');
  const look = () => page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      theme: document.documentElement.dataset.kkTheme,
      kind: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.body).backgroundColor,
      bar: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
      // Panels just above black; text and accents stay the dark theme's (the build lowercases CSS colours).
      surface: s.getPropertyValue('--color-surface').trim().toUpperCase(),
      text: s.getPropertyValue('--color-text').trim().toUpperCase(),
    };
  });
  const black = { theme: 'KANJIKODAMA_BLACK', kind: 'dark', bg: 'rgb(0, 0, 0)', bar: '#0B1513', surface: '#0B1513', text: '#E3F4EA' };
  await expect.poll(look).toEqual(black);

  // The next start paints it before the database is open.
  await openApp(page, '/');
  await expect.poll(look).toEqual(black);
  await checkScreen(page, info, '81-dashboard-black');

  // Light system mode: still the Light Theme.
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.kkTheme)).toBe('KANJIKODAMA_LIGHT');
});
