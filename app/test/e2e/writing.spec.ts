/** Writing practice: strokes drawn with the mouse along KanjiVG (accepted) and along wrong paths (missed). */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { checkScreen, openApp, restoreFile } from './helpers/app';
import { subjects, subjectsAt } from './helpers/content';
import { drawStroke, strokesOf, writeKanji } from './helpers/strokes';

/** Level 1 kanji with stroke data and at least `minStrokes` strokes. */
async function level1Kanji(minStrokes: number, count: number): Promise<number[]> {
  const out: number[] = [];
  for (const s of await subjectsAt(1, 'kanji')) {
    const strokes = await strokesOf(s.id).catch(() => []);
    if (strokes.length >= minStrokes) out.push(s.id);
    if (out.length === count) break;
  }
  expect(out).toHaveLength(count);
  return out;
}

test('from memory: a backwards stroke is missed and hinted, then written; the missed kanji can be practised again', async ({ page }, info) => {
  const [a, b] = await level1Kanji(2, 2) as [number, number];
  await openApp(page, `/self-study/writing?ids=${a},${b}&mode=recall`);
  const screen = page.getByTestId('writing-screen');
  const pad = page.getByTestId('writing-pad');
  await expect(screen).toHaveAttribute('data-mode', 'recall');
  await expect(screen).toHaveAttribute('data-subject-id', String(a));
  await expect(page.getByTestId('writing-progress')).toContainText('Kanji 1 of 2');
  // From memory: no kanji in the prompt, no hint until asked or missed.
  await expect(page.locator('.kk-writing-prompt-kanji')).toHaveCount(0);
  await expect(page.getByTestId('writing-hint-stroke')).toHaveCount(0);
  await checkScreen(page, info, 'writing-recall', { strict: true });

  const first = (await strokesOf(a))[0]!;
  await drawStroke(page, [...first].reverse());
  await expect(page.getByTestId('writing-message')).toContainText('wrong direction');
  await expect(pad).toHaveAttribute('data-written', '0');
  await expect(page.getByTestId('writing-hint-stroke')).toHaveCount(1);
  await expect(page.getByTestId('writing-hint')).toBeDisabled();

  await writeKanji(page);
  await expect(page.locator('.kk-writing-prompt-kanji')).toHaveCount(1); // shown once written
  await expect(page.getByTestId('writing-message')).toContainText('Done');
  await page.getByTestId('writing-next').click();

  await expect(screen).toHaveAttribute('data-subject-id', String(b));
  await page.getByTestId('writing-hint').click();
  await expect(page.getByTestId('writing-hint-stroke')).toHaveCount(1);
  await writeKanji(page);
  await page.getByTestId('writing-next').click(); // Finish

  const summary = page.getByTestId('writing-summary');
  await expect(summary).toContainText('0 of 2 written without a slip');
  await expect(page.getByTestId(`writing-result-${a}`)).toContainText('1 miss');
  await expect(page.getByTestId(`writing-result-${b}`)).toContainText('1 hint');
  await checkScreen(page, info, 'writing-summary', { strict: true });
  await page.getByTestId('writing-missed').click();
  await expect(page.getByTestId('writing-progress')).toContainText('Kanji 1 of 2');
});

test('tracing from the kanji page: a later stroke first is the wrong order; a clean round', async ({ page }, info) => {
  const [id] = await level1Kanji(3, 1) as [number];
  const strokes = await strokesOf(id);
  await openApp(page, `/subject/${id}`);
  await page.getByTestId('practise-writing').click();
  const screen = page.getByTestId('writing-screen');
  await expect(screen).toHaveAttribute('data-mode', 'study');
  await expect(page.locator('.kk-writing-ghost')).toHaveCount(strokes.length);
  await expect(page.getByTestId('writing-hint-stroke')).toHaveCount(1);
  await expect(page.locator('.kk-writing-prompt-kanji')).toHaveCount(1);
  await checkScreen(page, info, 'writing-study', { strict: true });

  await drawStroke(page, strokes[strokes.length - 1]!);
  await expect(page.getByTestId('writing-message')).toContainText('comes later');
  await expect(page.getByTestId('writing-pad')).toHaveAttribute('data-written', '0');

  await writeKanji(page);
  await page.getByTestId('writing-next').click();
  await expect(page.getByTestId('writing-summary')).toContainText('0 of 1 written without a slip');
  await page.getByTestId('writing-again').click();
  await writeKanji(page);
  await expect(page.getByTestId('writing-message')).toContainText('Well written!');
  await page.getByTestId('writing-next').click();
  await expect(page.getByTestId('writing-summary')).toContainText('1 of 1 written without a slip');
  await expect(page.getByTestId('writing-missed')).toHaveCount(0);
  await page.getByTestId('writing-done').click();
  await expect(page).toHaveURL(new RegExp(`#/subject/${id}$`));
});

test('the self-study screen starts a round: nothing learned yet, then a level', async ({ page }) => {
  await openApp(page, '/self-study');
  const panel = page.getByTestId('writing-start');
  await expect(panel).toBeVisible();
  await page.getByTestId('writing-start-button').click();
  await expect(page.getByTestId('toast')).toContainText('Nothing to practise here yet');

  await page.getByTestId('writing-scope').selectOption('1');
  await page.getByTestId('writing-size').selectOption('5');
  await page.getByTestId('writing-mode-recall').click();
  await expect(page.getByTestId('writing-mode-recall')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('writing-start-button').click();
  await expect(page.getByTestId('writing-screen')).toHaveAttribute('data-mode', 'recall');
  await expect(page.getByTestId('writing-progress')).toContainText('Kanji 1 of 5');
  const ids = new URL(page.url().replace('#', '')).searchParams.get('ids')?.split(',') ?? [];
  const level1 = (await subjectsAt(1, 'kanji')).map((s) => String(s.id));
  expect(ids).toEqual(level1.filter((id) => ids.includes(id)).slice(0, 5)); // lesson order
  expect(ids).toHaveLength(5);
});

test('radicals: practised from a radical page and picked in the self-study panel; image-only radicals are skipped', async ({ page }) => {
  const radicals: number[] = [];
  for (const s of await subjectsAt(1, 'radical')) {
    if ((await strokesOf(s.id).catch(() => [])).length > 0) radicals.push(s.id);
  }
  expect(radicals.length).toBeGreaterThan(1);
  const id = radicals[0]!;
  await openApp(page, `/subject/${id}`);
  await page.getByTestId('practise-writing').click();
  await expect(page.getByTestId('writing-screen')).toHaveAttribute('data-subject-id', String(id));
  await expect(page.getByTestId('writing-progress')).toContainText('Radical 1 of 1');
  await writeKanji(page);
  await expect(page.getByTestId('writing-message')).toContainText('Well written!');

  // An image-only radical (no characters, no stroke data) in the address is left out.
  let imageOnly: number | null = null;
  for (const s of await subjects()) {
    if (s.object === 'radical' && s.characters === null && (await strokesOf(s.id).catch(() => [])).length === 0) {
      imageOnly = s.id;
      break;
    }
  }
  expect(imageOnly).not.toBeNull();
  await openApp(page, `/self-study/writing?ids=${imageOnly},${id}&mode=study`);
  await expect(page.getByTestId('writing-progress')).toContainText('Radical 1 of 1');
  await openApp(page, `/self-study/writing?ids=${imageOnly}&mode=study`);
  await expect(page.getByTestId('writing-empty')).toBeVisible();

  // The panel: level 1's radicals, in lesson order.
  await openApp(page, '/self-study');
  await page.getByTestId('writing-kind').selectOption('radical');
  await page.getByTestId('writing-scope').selectOption('1');
  await page.getByTestId('writing-start-button').click();
  await expect(page.getByTestId('writing-progress')).toContainText(`Radical 1 of ${Math.min(10, radicals.length)}`);
  const ids = new URL(page.url().replace('#', '')).searchParams.get('ids')?.split(',').map(Number) ?? [];
  expect(ids).toEqual(radicals.slice(0, 10));
});

test('writing progress: a clean recall reaches level 1, shows on the item page, comes due, and survives save and restore', async ({ page, browser }, info) => {
  await page.addInitScript(() => {
    // No share sheet: Save falls back to a download.
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  const start = new Date('2026-11-09T12:00:00Z');
  await page.clock.install({ time: start });
  const [id] = await level1Kanji(2, 1) as [number];
  await openApp(page, `/self-study/writing?ids=${id}&mode=recall`);
  await writeKanji(page);
  await page.getByTestId('writing-next').click();
  await expect(page.getByTestId(`writing-level-${id}`)).toHaveText('new → level 1');

  await openApp(page, `/subject/${id}`);
  await expect(page.getByTestId('writing-line')).toHaveText('✍ Writing: level 1 · 1 clean of 1 · due in 1 day');

  // Not due yet; two days later it is.
  await openApp(page, '/self-study');
  await page.getByTestId('writing-scope').selectOption('due');
  await page.getByTestId('writing-start-button').click();
  await expect(page.getByTestId('toast')).toContainText('Nothing is due for writing right now');
  await page.clock.setSystemTime(new Date(start.getTime() + 2 * 86_400_000));
  await page.getByTestId('writing-start-button').click();
  await expect(page.getByTestId('writing-screen')).toHaveAttribute('data-subject-id', String(id));
  expect(new URL(page.url().replace('#', '')).searchParams.get('ids')).toBe(String(id));

  // Weakest first lists it too.
  await openApp(page, '/self-study');
  await page.getByTestId('writing-scope').selectOption('weakest');
  await page.getByTestId('writing-start-button').click();
  await expect(page.getByTestId('writing-screen')).toHaveAttribute('data-subject-id', String(id));

  // Save the progress file: it carries the record.
  await openApp(page, '/settings');
  const download = page.waitForEvent('download');
  await page.getByTestId('progress-save').click();
  const path = info.outputPath('writing-progress.json');
  await (await download).saveAs(path);
  const saved = JSON.parse(readFileSync(path, 'utf8')) as { writing?: Array<{ id: number; level: number }> };
  expect(saved.writing).toEqual([expect.objectContaining({ id, level: 1, attempts: 1, clean: 1 })]);

  // Restored in a fresh browser: the record comes back.
  const fresh = await browser.newPage({ viewport: page.viewportSize() ?? undefined });
  await fresh.clock.install({ time: start });
  await openApp(fresh);
  await restoreFile(fresh, path);
  await openApp(fresh, `/subject/${id}`);
  await expect(fresh.getByTestId('writing-line')).toHaveText('✍ Writing: level 1 · 1 clean of 1 · due in 1 day');
  await fresh.close();
});
