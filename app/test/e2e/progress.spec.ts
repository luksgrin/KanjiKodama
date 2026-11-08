/** Save progress (download fallback, share sheet) and restore (file chooser, summary, confirmation). */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { checkScreen, dashboardCounts, openApp, pickRestoreFile, restoreFile, tab } from './helpers/app';
import { ANDROID_EXPORT } from './helpers/paths';
import { writeReviewSeed } from './helpers/progress';

/** No share sheet (as on desktop browsers): Save falls back to a download. */
const noShare = () => {
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
};

test('save progress: download fallback, then restore it', async ({ page }, info) => {
  await page.addInitScript(noShare);
  const seed = await writeReviewSeed(info, { radicals: 2, kanji: 1 });
  await openApp(page);
  await restoreFile(page, seed.path);
  const before = await dashboardCounts(page);

  await tab(page, 'Settings');
  await expect(page.getByTestId('progress-save')).not.toContainText('Last saved');
  const download = page.waitForEvent('download');
  await page.getByTestId('progress-save').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  const path = info.outputPath('saved-progress.json');
  await file.saveAs(path);
  const saved = JSON.parse(readFileSync(path, 'utf8')) as { format: string; version: number; userLevel: number; subjects: unknown[] };
  expect(saved.format).toBe('kanjikodama-progress');
  expect(saved.version).toBe(1);
  expect(saved.userLevel).toBe(1);
  expect(saved.subjects.length).toBeGreaterThanOrEqual(seed.items);
  // "Progress saved." in a message dialog.
  const saidSaved = page.getByTestId('alert-message');
  await expect(saidSaved.locator('.kk-alert-message')).toHaveText('Progress saved.');
  await checkScreen(page, info, '60-settings-saved');
  await saidSaved.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByTestId('progress-save')).toContainText('Last saved');

  // Restore the saved file: summary, Cancel changes nothing, Restore brings the same state back.
  const summary = await pickRestoreFile(page, path);
  expect(summary).toMatch(new RegExp(`^Saved .+, WaniKani order, level 1, ${saved.subjects.length} items with progress\\.$`));
  await checkScreen(page, info, '61-restore-confirm');
  const confirm = page.getByRole('dialog', { name: 'Override local progress?' });
  await expect(confirm).toContainText('This replaces ALL progress in KanjiKodama');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await restoreFile(page, path);
  expect(await dashboardCounts(page)).toEqual(before);
});

test('save progress through the share sheet when the browser has one (iOS Safari, Android Chrome)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: { name: string; size: number }[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => { for (const f of data.files ?? []) w.__shared.push({ name: f.name, size: f.size }); },
    });
  });
  await openApp(page, '/settings');
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.getByTestId('progress-save').click();
  await expect(page.getByTestId('alert-message')).toContainText('Progress saved.');
  const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string; size: number }[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]!.name).toMatch(/\.json$/);
  expect(shared[0]!.size).toBeGreaterThan(50);
  expect(downloaded).toBe(false);
});

test('restore rejects a file that is not a progress file', async ({ page }, info) => {
  const path = info.outputPath('not-progress.json');
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(info.outputDir, { recursive: true });
  writeFileSync(path, '{"hello": 1}');
  await openApp(page, '/settings');
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('progress-restore').click();
  await (await chooser).setFiles(path);
  // The error dialog.
  await expect(page.getByRole('dialog', { name: 'Something went wrong' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Override local progress?' })).toHaveCount(0);
});

test('restore the owner\'s Android export: level and counts on the dashboard', async ({ page }) => {
  // Personal file: read locally, loaded only into this local browser, never printed.
  const exp = JSON.parse(readFileSync(ANDROID_EXPORT, 'utf8')) as {
    userLevel: number; curriculum?: string; subjects: { srsStage?: number }[];
  };
  const summary = await pickRestoreFile(page, ANDROID_EXPORT);
  expect(summary.includes(`level ${exp.userLevel}, ${exp.subjects.length} items with progress.`), 'restore summary names the level and item count').toBe(true);
  await page.getByTestId('dialog-restore').getByRole('button', { name: 'Restore and override' }).click();
  await expect(page.getByTestId('alert-message').locator('.kk-alert-message')).toHaveText(`Progress restored, level ${exp.userLevel}.`);
  await page.getByTestId('alert-message').getByRole('button', { name: 'OK' }).click();
  await tab(page, 'Home');
  await expect(page.getByTestId("level-duration")).toContainText(`You are level ${exp.userLevel}`);
  const counts = await dashboardCounts(page);
  expect(counts.lessons + counts.reviews).toBeGreaterThanOrEqual(0);
  // The SRS breakdown counts every started item (stage ≥ 1) once, burned included.
  const started = exp.subjects.filter((s) => (s.srsStage ?? 0) >= 1).length;
  const breakdown = await page.locator('.kk-srs-count, [data-testid^="srs-count"]').allInnerTexts();
  const total = breakdown.map(Number).filter((n) => Number.isFinite(n)).reduce((a, b) => a + b, 0);
  expect.soft(total, 'SRS breakdown total vs started items in the file').toBe(started);
  // The app keeps working on the real data: the review button opens a session when reviews are due.
  if (counts.reviews > 0) {
    await page.getByTestId('start-reviews').click();
    await expect(page.getByTestId('question-view')).toBeVisible();
  }
});
