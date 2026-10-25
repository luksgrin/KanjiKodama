/** Curriculum switch, browse/search, item page, settings and its Advanced gate, About. */
import { expect, test } from '@playwright/test';
import { checkScreen, openApp, tab } from './helpers/app';
import { subjectsAt } from './helpers/content';
import { kanaToRomaji } from './helpers/romaji';

test('curriculum switch WaniKani → JLPT and back', async ({ page }, info) => {
  await openApp(page, '/settings');
  await page.getByTestId('link-curriculum').click();
  await expect(page.getByTestId('curriculum-summary')).toContainText('WaniKani order');
  await expect(page.getByTestId('curriculum-WANIKANI')).toHaveAttribute('aria-checked', 'true');
  await checkScreen(page, info, '20-curriculum');

  await page.getByTestId('curriculum-JLPT').click();
  const dlg = page.getByRole('dialog', { name: 'Switch to JLPT order?' });
  await expect(dlg).toBeVisible();
  await expect(page.getByTestId('curriculum-confirm')).toContainText('You would be placed on level');
  await checkScreen(page, info, '21-curriculum-confirm');
  await dlg.getByRole('button', { name: 'Switch' }).click();
  await expect(page.getByTestId('curriculum-status')).toContainText(/You are now in JLPT order, on level \d+/);
  await expect(page.getByTestId('curriculum-JLPT')).toHaveAttribute('aria-checked', 'true');
  const level = /on level (\d+)/.exec(await page.getByTestId('curriculum-status').innerText())?.[1];

  await tab(page, 'Home');
  await expect(page.getByText(`Level ${level} progress`)).toBeVisible();
  await checkScreen(page, info, '22-dashboard-jlpt');
  // Browse groups the levels under their JLPT block in JLPT order.
  await tab(page, 'Browse');
  await expect(page.locator('.kk-browse-block').first()).toBeVisible();

  await openApp(page, '/settings/curriculum');
  await page.getByTestId('curriculum-WANIKANI').click();
  await page.getByRole('dialog', { name: 'Switch to WaniKani order?' }).getByRole('button', { name: 'Switch' }).click();
  await expect(page.getByTestId('curriculum-status')).toContainText('You are now in WaniKani order, on level 1');
  await tab(page, 'Home');
  await expect(page.getByText('Level 1 progress')).toBeVisible();
});

test('browse by level and search by romaji; item page', async ({ page }, info) => {
  await openApp(page);
  await tab(page, 'Browse');
  await expect(page.getByTestId('browse-level-1')).toHaveAttribute('aria-current', 'true');
  await checkScreen(page, info, '30-browse');

  await page.getByTestId('browse-level-1').click();
  await expect(page.getByTestId('num-hits')).toContainText(/Level 1: \d+ subject\(s\) found/);
  await checkScreen(page, info, '31-search-results-level');

  // Keyword search typed as romaji finds the kanji by its reading.
  const kanji = (await subjectsAt(1, 'kanji'))[0]!;
  const reading = kanji.readings.find((r) => r.primary)!.reading;
  await openApp(page, '/browse');
  const query = page.getByRole('searchbox', { name: 'Query' });
  await query.fill(kanaToRomaji(reading));
  await query.press('Enter');
  await expect(page.getByTestId('num-hits')).toContainText(/\d+ subject\(s\) found/);
  const hit = page.getByTestId(`result-${kanji.id}`);
  await expect(hit).toBeVisible();
  await checkScreen(page, info, '32-search-results-romaji');

  await hit.click();
  await expect(page).toHaveURL(new RegExp(`#/subject/${kanji.id}$`));
  await expect(page.locator('.kk-main')).toContainText(kanji.characters!);
  await checkScreen(page, info, '33-item-page');
  await checkScreen(page, info, '33-item-page-full', { fullPage: true });
});

test('settings: basics, Advanced gate', async ({ page }, info) => {
  await openApp(page);
  await tab(page, 'Settings');
  await expect(page.getByRole('button', { name: 'Save progress' })).toBeVisible();
  await expect(page.getByTestId('link-advanced')).toContainText('Off. Only for experienced users!');
  await checkScreen(page, info, '40-settings');
  await checkScreen(page, info, '40-settings-full', { fullPage: true });

  await page.getByTestId('link-advanced').click();
  await expect(page.getByTestId('advanced-off')).toBeVisible();
  await expect(page.getByText('Lesson advanced settings')).toHaveCount(0);
  const toggle = page.getByTestId('setting-enable_advanced').getByRole('switch');

  // No: stays off.
  await toggle.click();
  const dlg = page.getByRole('dialog', { name: 'Enable advanced settings?' });
  await expect(dlg).toContainText('Are you sure you want to enable these settings?');
  await checkScreen(page, info, '41-advanced-warning');
  await dlg.getByRole('button', { name: 'No' }).click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId('advanced-off')).toBeVisible();

  // Yes: the four groups appear.
  await toggle.click();
  await dlg.getByRole('button', { name: 'Yes' }).click();
  await expect(toggle).toBeChecked();
  for (const g of ['Lesson advanced settings', 'Review advanced settings', 'Self-study advanced settings']) {
    await expect(page.getByText(g, { exact: true }).first()).toBeVisible();
  }
  await checkScreen(page, info, '42-advanced-on');
  await checkScreen(page, info, '42-advanced-on-full', { fullPage: true });

  // Back on Settings the row says On; survives a reload.
  await page.reload();
  await openApp(page, '/settings');
  await expect(page.getByTestId('link-advanced')).toContainText('On');
});

test.describe('About: install hint', () => {
  test('shown in the browser (not standalone)', async ({ page }, info) => {
    await openApp(page, '/settings/about');
    await expect(page.getByTestId('about-title')).toBeVisible();
    await expect(page.getByTestId('install-section')).toBeVisible();
    await expect(page.getByTestId('install-steps')).toBeVisible();
    await expect(page.getByText('Running from the home screen.')).toHaveCount(0);
    await checkScreen(page, info, '50-about');
    await openApp(page, '/settings');
    await expect(page.getByTestId('install-hint')).toBeVisible();
  });

  test('hidden when running from the home screen', async ({ page }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q.includes('display-mode: standalone')
        ? { ...real(q), matches: true, media: q } as MediaQueryList
        : real(q));
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    });
    await openApp(page, '/settings/about');
    await expect(page.getByTestId('install-section')).toContainText('Running from the home screen.');
    await expect(page.getByTestId('install-steps')).toHaveCount(0);
    await openApp(page, '/settings');
    await expect(page.getByTestId('install-hint')).toHaveCount(0);
  });
});
