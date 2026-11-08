/**
 * Layout on every device: each main screen without sideways scroll, tap targets ≥ 40 px, no clipped
 * text (soft failures, so one run lists them all), and the quiz's quick-action row: at the bottom, on
 * the keyboard (simulated: iPhone SE 410 px visible, 320 px Android 300 px, …); answered, the keyboard
 * closes and Next is pinned at the bottom of the screen.
 */
import { expect, test } from '@playwright/test';
import { answer, checkQuickActions, checkScreen, expectHeadlineLayout, keyboardTopFor, openApp, quiz, restoreFile, tab } from './helpers/app';
import { subjectsAt } from './helpers/content';
import { writeReviewSeed } from './helpers/progress';

test('main screens', async ({ page }, info) => {
  const seed = await writeReviewSeed(info, { radicals: 2, kanji: 2 });
  await openApp(page);
  await restoreFile(page, seed.path);

  await checkScreen(page, info, 'L01-dashboard', { strict: true });
  await checkScreen(page, info, 'L01-dashboard-full', { strict: true, fullPage: true });
  // START sits above the fold on every phone, banners (install hint, backup reminder) come after it.
  const start = await page.getByTestId('start-reviews').boundingBox();
  expect(start, 'START REVIEWS').not.toBeNull();
  expect(start!.y + start!.height, 'START REVIEWS above the fold').toBeLessThanOrEqual(page.viewportSize()!.height);

  await page.getByTestId('start-reviews').click();
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  await checkQuickActions(page, 'review quiz', keyboardTopFor(info));
  const row = await page.getByTestId('quick-actions').boundingBox();
  info.annotations.push({ type: 'quick-actions', description: `bottom at ${Math.round((row?.y ?? 0) + (row?.height ?? 0))}px of ${page.viewportSize()?.height}px` });
  await checkScreen(page, info, 'L02-quiz', { strict: true });
  await answer(page, 'wrong');
  await checkQuickActions(page, 'review quiz answered');
  await checkScreen(page, info, 'L03-quiz-answered', { strict: true });
  await checkScreen(page, info, 'L03-quiz-answered-full', { strict: true, fullPage: true });
  await page.getByTestId('toolbar-overflow').click();
  await expect(page.getByTestId('menu-session_log')).toBeVisible();
  await checkScreen(page, info, 'L04-session-menu', { strict: true });
  await page.getByTestId('menu-session_log').click();
  await expect(page.getByTestId('session-log')).toBeVisible();
  await checkScreen(page, info, 'L04-session-log', { strict: true });
  await page.getByTestId('toolbar-back').click();
  await expect(quiz(page)).toBeVisible();
  await page.getByTestId('toolbar-overflow').click();
  await page.getByTestId('menu-wrapup_session').click();
  await checkScreen(page, info, 'L04-wrapup-dialog', { strict: true });
  await page.getByTestId('wrapup-dialog').getByRole('button', { name: /^Yes$/ }).click().catch(() => undefined);

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
  await openApp(page, '/settings?screen=subject_info_settings');
  await checkScreen(page, info, 'L10-settings-subject-info-full', { strict: true, fullPage: true });
  await openApp(page, '/settings/about');
  await checkScreen(page, info, 'L11-about-full', { strict: true, fullPage: true });
  await openApp(page, '/settings/level-test');
  // A dialog over the dashboard (the wrapped-up session above still runs: "Finish or abandon…").
  await expect(page.getByTestId('level-test-dialog')).toBeVisible();
  await checkScreen(page, info, 'L12-level-test', { strict: true });
  await openApp(page, '/settings/fast-travel');
  await checkScreen(page, info, 'L13-fast-travel', { strict: true });
  await openApp(page, '/settings?screen=data_import_export');
  await expect(page.getByTestId('data-import-export')).toBeVisible();
  await checkScreen(page, info, 'L14-data-import-export', { strict: true });
  await openApp(page, '/settings');
  await page.getByTestId('reset-database').click();
  await expect(page.getByTestId('dialog-reset-database')).toBeVisible();
  await checkScreen(page, info, 'L15-reset-database-dialog', { strict: true });
  await page.getByTestId('dialog-reset-database').getByRole('button', { name: /^No$/ }).click();
  await openApp(page, '/settings?screen=display_settings');
  await checkScreen(page, info, 'L16-settings-display-full', { strict: true, fullPage: true });
  await openApp(page, '/settings?screen=keyboard_settings');
  await checkScreen(page, info, 'L17-settings-keyboard', { strict: true });
  await openApp(page, '/settings/keyboard-help');
  await checkScreen(page, info, 'L18-keyboard-help-full', { strict: true, fullPage: true });
  await openApp(page, '/settings/theme-customization');
  await checkScreen(page, info, 'L19-theme-customization-full', { strict: true, fullPage: true });
  await openApp(page, '/settings?screen=font_settings');
  await checkScreen(page, info, 'L20-settings-fonts-full', { strict: true, fullPage: true });
  await openApp(page, '/settings?screen=font_selection');
  await expect(page.getByTestId('font-row-8')).toBeVisible();
  await checkScreen(page, info, 'L21-font-selection-full', { strict: true, fullPage: true });
  await openApp(page, '/settings?screen=font_import');
  await checkScreen(page, info, 'L22-font-import', { strict: true });
  await openApp(page, '/settings?screen=other_settings');
  await checkScreen(page, info, 'L23-settings-other-full', { strict: true, fullPage: true });
});

test('item headline: narrow/wide layout, text never a sliver', async ({ page }) => {
  await openApp(page);
  const vocab = (await subjectsAt(1, 'vocabulary')).filter((s) => [...(s.characters ?? '')].length >= 2);
  const kanji = await subjectsAt(1, 'kanji');
  for (const s of [vocab[0]!, kanji[0]!]) {
    await page.goto(`./#/subject/${s.id}`);
    await expectHeadlineLayout(page, `item ${s.characters}`);
  }
});
