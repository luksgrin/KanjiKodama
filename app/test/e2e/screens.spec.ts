/** Curriculum switch, browse/search, item page, settings and its Advanced gate, About. */
import { expect, test } from '@playwright/test';
import { checkScreen, openApp, tab, toolbarBack } from './helpers/app';
import { subjects, subjectsAt } from './helpers/content';
import { kanaToRomaji } from './helpers/romaji';

test('curriculum switch WaniKani → JLPT and back (dialogs over Settings)', async ({ page }, info) => {
  await openApp(page, '/settings');
  await expect(page.getByTestId('link-curriculum')).toContainText('WaniKani order. Tap to switch; progress on every item is kept.');
  await page.getByTestId('link-curriculum').click();
  const choose = page.getByRole('dialog', { name: 'Curriculum order' });
  await expect(choose).toBeVisible();
  await expect(page.getByTestId('curriculum-WANIKANI')).toHaveAttribute('aria-checked', 'true');
  await checkScreen(page, info, '20-curriculum', { strict: true });

  await page.getByTestId('curriculum-JLPT').click();
  const dlg = page.getByRole('dialog', { name: 'Switch to JLPT order?' });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('You would be placed on level');
  await checkScreen(page, info, '21-curriculum-confirm', { strict: true });
  await dlg.getByRole('button', { name: 'Switch' }).click();
  const done = page.getByTestId('alert-message');
  await expect(done).toContainText(/You are now in JLPT order, on level \d+/);
  const level = /on level (\d+)/.exec(await done.innerText())?.[1];
  await done.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByTestId('link-curriculum')).toContainText('JLPT order. Tap to switch');

  await tab(page, 'Home');
  await expect(page.getByTestId('level-duration')).toContainText(`You are level ${level} (`);
  await checkScreen(page, info, '22-dashboard-jlpt');
  // Browse: the flat level grid in JLPT order too.
  await tab(page, 'Browse');
  await expect(page.getByTestId(`browse-level-${level}`)).toHaveAttribute('aria-current', 'true');

  // The deep link opens the same dialog over Settings.
  await openApp(page, '/settings/curriculum');
  await page.getByTestId('curriculum-WANIKANI').click();
  await page.getByRole('dialog', { name: 'Switch to WaniKani order?' }).getByRole('button', { name: 'Switch' }).click();
  await expect(page.getByTestId('alert-message')).toContainText('You are now in WaniKani order, on level 1');
  await page.getByTestId('alert-message').getByRole('button', { name: 'OK' }).click();
  await tab(page, 'Home');
  await expect(page.getByTestId('level-duration')).toContainText('You are level 1');
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
  const query = page.getByRole('textbox', { name: 'Query' });
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

test('search by parts: two parts narrow the kanji down, impossible parts are disabled, a result opens', async ({ page }, info) => {
  // 休 (person + tree): open data (RADKFILE), and a kanji of the content.
  const kyuu = (await subjects()).find((s) => s.object === 'kanji' && s.characters === '休' && s.hiddenAt === 0)!;
  expect(kyuu).toBeDefined();
  await openApp(page, '/browse');
  await page.getByTestId('browse-parts').click();
  await expect(page).toHaveURL(/#\/browse\/parts$/);
  await expect(page.getByTestId('parts-bar')).toContainText('Tap the parts');
  // Nothing picked: every part is available.
  await expect(page.locator('[data-testid^="part-"]:disabled')).toHaveCount(0);
  await expect(page.getByTestId('part-雨')).toBeEnabled();

  await page.getByTestId('part-亻').click();
  await expect(page.getByTestId('part-亻')).toHaveAttribute('aria-pressed', 'true');
  const personOnly = Number((await page.getByTestId('parts-count').innerText()).match(/\d+/)![0]);
  expect(personOnly).toBeGreaterThan(10);
  await page.getByTestId('part-木').click();
  await expect(page.getByTestId('part-木')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/#\/browse\/parts\?p=/);
  const both = Number((await page.getByTestId('parts-count').innerText()).match(/\d+/)![0]);
  expect(both).toBeGreaterThan(0);
  expect(both).toBeLessThan(personOnly);
  // Parts that no kanji with 亻 and 木 contains can't be picked; the picked ones stay enabled.
  await expect(page.getByTestId('part-雨')).toBeDisabled();
  await expect(page.getByTestId('part-魚')).toBeDisabled();
  await expect(page.getByTestId('part-亻')).toBeEnabled();
  expect(await page.locator('[data-testid^="part-"]:disabled').count()).toBeGreaterThan(150);
  await expect(page.getByTestId('parts-results-heading')).toContainText(`${both} kanji found`);
  // Few kanji left: the bar under the toolbar lists them too.
  if (both <= 8) await expect(page.getByTestId(`parts-quick-${kyuu.id}`)).toBeVisible();
  const hit = page.getByTestId(`result-${kyuu.id}`);
  await expect(hit).toBeVisible();
  await checkScreen(page, info, '34-parts-search');

  await hit.click();
  await expect(page).toHaveURL(new RegExp(`#/subject/${kyuu.id}$`));
  await expect(page.locator('.kk-main')).toContainText('休');
  // Back: the selection is still there.
  await toolbarBack(page);
  await expect(page.getByTestId('part-木')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId(`result-${kyuu.id}`)).toBeVisible();
  // Tapping a selected part in the bar drops it; Clear drops them all.
  await page.getByTestId('parts-bar').getByRole('button', { name: 'Remove 木' }).click();
  await expect(page.getByTestId('part-木')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('parts-count')).toContainText(`${personOnly} kanji`);
  await page.getByTestId('parts-bar').getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByTestId('parts-bar')).toContainText('Tap the parts');
  await expect(page.getByTestId('parts-results')).toHaveCount(0);
});

test('settings: sub-screens, list dialogs, Advanced gate', async ({ page }, info) => {
  await openApp(page);
  await tab(page, 'Settings');
  await expect(page.getByTestId('screen-review_settings')).toBeVisible();
  await expect(page.getByTestId('progress-save')).toContainText('Save progress to a file');
  await expect(page.getByTestId('setting-enable_advanced')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('screen-advanced_lesson_settings')).toHaveCount(0);
  await checkScreen(page, info, '40-settings', { strict: true });
  await checkScreen(page, info, '40-settings-full', { strict: true, fullPage: true });

  // A sub-screen with the toolbar title, a list setting as a radio dialog. (Long toolbar titles are
  // ellipsized, "REVIEW ADVAN…", so those screens' layout checks are not strict.)
  await page.getByTestId('screen-review_settings').click();
  await expect(page).toHaveURL(/#\/settings\?screen=review_settings$/);
  await expect(page.locator('select')).toHaveCount(0);
  await page.getByTestId('setting-close_enough_action').click();
  const list = page.getByRole('dialog', { name: 'Action for "close enough" answer' });
  await expect(list.getByRole('radio', { name: 'Accept silently' })).toHaveAttribute('aria-checked', 'true');
  await checkScreen(page, info, '43-list-dialog');
  await list.getByRole('radio', { name: 'Reject' }).click();
  await expect(list).toBeHidden();
  await expect(page.getByTestId('setting-close_enough_action')).toContainText('Reject');
  // EditTextPreference dialog.
  await page.getByTestId('setting-max_lesson_session_size').click();
  const edit = page.getByRole('dialog', { name: 'Max. # of lessons per session' });
  await edit.getByRole('textbox').fill('7');
  await checkScreen(page, info, '44-edit-dialog');
  await edit.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByTestId('setting-max_lesson_session_size')).toContainText('7');
  await checkScreen(page, info, '45-settings-review', { fullPage: true });
  await toolbarBack(page);
  await expect(page.getByTestId('settings-root')).toBeVisible();

  // No: stays off.
  const toggle = page.getByTestId('setting-enable_advanced');
  await toggle.click();
  const dlg = page.getByRole('dialog', { name: 'Enable advanced settings?' });
  await expect(dlg).toContainText('Are you sure you want to enable these settings?');
  await checkScreen(page, info, '41-advanced-warning', { strict: true });
  await dlg.getByRole('button', { name: 'No' }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('screen-advanced_lesson_settings')).toHaveCount(0);

  // Yes: the four sub-screens appear.
  await toggle.click();
  await dlg.getByRole('button', { name: 'Yes' }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  for (const id of ['advanced_lesson_settings', 'advanced_review_settings', 'advanced_self_study_settings', 'advanced_other_settings']) {
    await expect(page.getByTestId(`screen-${id}`)).toBeVisible();
  }
  await page.getByTestId('screen-advanced_review_settings').click();
  await expect(page.getByTestId('setting-review_order')).toContainText('Shuffle');
  await checkScreen(page, info, '42-advanced-on');
  await checkScreen(page, info, '42-advanced-on-full', { fullPage: true });
  // NumberRangePreference dialog.
  await page.getByTestId('setting-review_subjects_kanji').click();
  const range = page.getByRole('dialog', { name: 'Kanji' });
  await range.getByRole('textbox', { name: 'Kanji min' }).fill('2');
  await checkScreen(page, info, '46-range-dialog');
  await range.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByTestId('setting-review_subjects_kanji')).toContainText('Min 2');

  // Survives a reload.
  await page.reload();
  await openApp(page, '/settings');
  await expect(page.getByTestId('setting-enable_advanced')).toHaveAttribute('aria-checked', 'true');
});

test('fast travel: dialogs (blocked in WaniKani order)', async ({ page }, info) => {
  await openApp(page, '/settings');
  await page.getByTestId('link-fast-travel').click();
  const msg = page.getByRole('dialog', { name: 'Fast travel' });
  await expect(msg).toContainText('Fast travel is only available in JLPT order.');
  await checkScreen(page, info, '47-fast-travel-blocked', { strict: true });
  await msg.getByRole('button', { name: 'OK' }).click();
  await expect(msg).toBeHidden();
});

test.describe('About: install hint', () => {
  test('shown in the browser (not standalone)', async ({ page }, info) => {
    await openApp(page, '/settings/about');
    await expect(page.getByTestId('about-title')).toBeVisible();
    await expect(page.getByTestId('install-section')).toBeVisible();
    await expect(page.getByTestId('install-steps')).toBeVisible();
    await expect(page.getByText('Running from the home screen.')).toHaveCount(0);
    await checkScreen(page, info, '50-about');
    await checkScreen(page, info, '50-about-full', { fullPage: true });
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
