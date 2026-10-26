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

test('quiz: Don\'t know | Submit 8 px above the keyboard, taps beside the field keep the keyboard', async ({ page }, info) => {
  const seed = await writeReviewSeed(info, { radicals: 2 });
  await openApp(page);
  await restoreFile(page, seed.path);
  await page.getByTestId('start-reviews').click();
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  const vp = page.viewportSize()!;
  const kb = keyboardTopFor(info) ?? Math.round(vp.height * 0.6);
  const bottoms = async () => Promise.all(['dont-know', 'submit'].map(async (id) => {
    const b = (await page.getByTestId(id).boundingBox())!;
    return b.y + b.height;
  }));

  // Keyboard open (over the visual viewport: iOS / Chrome; resizing the window: the Android app): the
  // buttons end 8 px above it (owner's request; Java: a navigation bar height above it).
  for (const how of ['visual', 'resize'] as const) {
    try {
      await simulateKeyboard(page, kb, how, vp);
      await settle(page);
      for (const bottom of await bottoms()) {
        expect(kb - bottom, `gap above the keyboard (${how})`).toBeGreaterThanOrEqual(7.5);
        expect(kb - bottom, `gap above the keyboard (${how})`).toBeLessThanOrEqual(8.5);
      }
    } finally {
      await simulateKeyboard(page, null, how, vp);
    }
  }
  // Keyboard closed: at the bottom as before (4 px; no home indicator inset in the test browsers).
  await settle(page);
  for (const bottom of await bottoms()) expect(vp.height - bottom, 'gap at the bottom, keyboard closed').toBeCloseTo(4, 0);

  // A tap beside the field (question, banner, empty space, toolbar title) leaves the focus (the keyboard) there.
  const touch = info.project.use.hasTouch === true;
  const press = async (target: ReturnType<typeof page.locator>) => (touch ? target.tap() : target.click());
  await answerField(page).focus();
  for (const target of [
    page.getByTestId('question-type'), page.locator('.kk-quiz-spacer'), page.getByTestId('session-progress'), page.locator('.kk-toolbar-title'),
  ]) {
    await press(target);
    await expect(answerField(page), 'answer field keeps the focus').toBeFocused();
  }
  // The question text still takes its tap (the font toggle) and the field keeps the focus.
  const clicks = await page.getByTestId('question-text').evaluate((el) => {
    const w = window as Window & { __kkClicks?: number };
    w.__kkClicks = 0;
    el.addEventListener('click', () => { w.__kkClicks!++; });
    return 0;
  });
  await press(page.getByTestId('question-text'));
  await expect(answerField(page)).toBeFocused();
  expect(await page.evaluate(() => (window as Window & { __kkClicks?: number }).__kkClicks)).toBe(clicks + 1);
  // Buttons, the menu and the session dialogs work by touch as before (the field keeps the focus).
  await press(page.getByTestId('toolbar-overflow'));
  await press(page.getByTestId('menu-wrapup_session'));
  const dialog = page.getByTestId('wrapup-dialog');
  await expect(dialog).toBeVisible();
  await press(dialog.getByRole('button', { name: /^No$/ }));
  await expect(dialog).toHaveCount(0);
  await expect(answerField(page)).toBeFocused();
  await press(page.getByTestId('dont-know'));
  await expect(quiz(page)).toHaveAttribute('data-answered', 'true');

  // Answered: presses beside the buttons are the browser's again (the keyboard may hide, as Java's).
  const prevented = await page.getByTestId('question-type').evaluate((el) => {
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented, 'answered screen: mousedown beside the buttons not prevented').toBe(false);
});
