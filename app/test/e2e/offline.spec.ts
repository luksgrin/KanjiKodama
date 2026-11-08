/** Offline launch through the service worker: load once online, go offline, reload, review. */
import { expect, test } from '@playwright/test';
import { answerAllCorrect, dashboardCounts, openApp, restoreFile, waitReady } from './helpers/app';
import { writeReviewSeed } from './helpers/progress';

test.use({ serviceWorkers: 'allow' });

test('offline launch: the app starts from the cache and a review works', async ({ page, context }, info) => {
  const seed = await writeReviewSeed(info, { radicals: 2 });
  await openApp(page);
  // Wait for the service worker, then load once under its control so the content DB is cached.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await waitReady(page);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 }).toBe(true);
  await restoreFile(page, seed.path);
  await page.reload();
  await waitReady(page);
  await expect.poll(async () => page.evaluate(async () => {
    const names = await caches.keys();
    let content = 0;
    for (const n of names) {
      const keys = await (await caches.open(n)).keys();
      content += keys.filter((r) => /\/content\/content-[0-9a-f]+\.db$/.test(r.url)).length;
    }
    return content;
  }), { timeout: 30_000, message: 'content DB in the runtime cache' }).toBeGreaterThan(0);

  await context.setOffline(true);
  try {
    await page.reload();
    await waitReady(page);
    expect((await dashboardCounts(page)).reviews).toBe(seed.due);
    await page.getByTestId('start-reviews').click();
    await answerAllCorrect(page);
    await expect(page.getByTestId('summary-correct-percentage')).toHaveText('100%');
    await page.getByTestId('summary-finish').click();
    await expect(page.getByTestId('reviews-count')).toHaveText('0');
  } finally {
    await context.setOffline(false);
  }
});
