/**
 * The session screens laid out as the Java fragments, with the keyboard simulated (visual viewport:
 * iOS / Chrome; resize: the Android app's WebView): Don't know | Submit on the keyboard, the question
 * view's own height (~133 dp unanswered, ~193 dp answered with Next in it), the answered Next focused,
 * and dialogs that leave the focus (and so the keyboard) in the answer field.
 */
import { expect, test } from '@playwright/test';
import { answer, answerField, checkQuickActions, keyboardTopFor, openApp, quiz, restoreFile, settle, simulateKeyboard } from './helpers/app';
import { writeReviewSeed } from './helpers/progress';

test('quiz: Java placement with the keyboard open, dialogs keep the keyboard', async ({ page }, info) => {
  const seed = await writeReviewSeed(info, { radicals: 3, kanji: 1 });
  await openApp(page);
  await restoreFile(page, seed.path);
  await page.getByTestId('start-reviews').click();
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  const vp = page.viewportSize()!;
  const kb = keyboardTopFor(info) ?? Math.round(vp.height * 0.6);

  // The question view keeps its own height (progress line + 104 px text) when there is room.
  await settle(page);
  const qv = (await page.getByTestId('question-view').boundingBox())!;
  expect(qv.height, 'unanswered question view height').toBeGreaterThan(120);
  expect(qv.height, 'unanswered question view height').toBeLessThan(150);
  await checkQuickActions(page, 'review quiz', kb);

  // A session dialog leaves the focus in the answer field (Java: the keyboard stays open).
  await simulateKeyboard(page, kb, 'visual');
  await answerField(page).focus();
  await answerField(page).pressSequentially('abc');
  const typed = await answerField(page).inputValue();
  await page.getByTestId('toolbar-overflow').click();
  await page.getByTestId('menu-wrapup_session').click();
  const dialog = page.getByTestId('wrapup-dialog');
  await expect(dialog).toBeVisible();
  await expect(answerField(page)).toBeFocused();
  const box = (await dialog.boundingBox())!;
  expect(box.y + box.height, 'dialog above the keyboard').toBeLessThanOrEqual(kb + 0.5);
  // Enter in the field doesn't submit while the dialog is open.
  await page.keyboard.press('Enter');
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  await dialog.getByRole('button', { name: /^No$/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(answerField(page)).toBeFocused();
  await expect(answerField(page)).toHaveValue(typed);
  await answerField(page).fill('');
  await simulateKeyboard(page, null, 'visual');

  // Answered: Next in the grown header (focused, Java's highlight) and at the bottom.
  await answer(page, 'wrong');
  await expect(quiz(page)).toHaveAttribute('data-answered', 'true');
  await settle(page);
  const next = page.getByTestId('next');
  await expect(next).toBeFocused();
  const header = (await page.getByTestId('question-view').boundingBox())!;
  const nb = (await next.boundingBox())!;
  expect(nb.y + nb.height, 'Next inside the question view').toBeLessThanOrEqual(header.y + header.height + 0.5);
  expect(header.height, 'answered question view height (Java ~193 dp)').toBeGreaterThan(180);
  expect(header.height, 'answered question view height (Java ~193 dp)').toBeLessThan(210);
  await checkQuickActions(page, 'review quiz answered');
  // Next (the bottom one) leads to the next question with the field focused.
  await page.getByTestId('next-bottom').click();
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  await expect(answerField(page)).toBeFocused();
});
