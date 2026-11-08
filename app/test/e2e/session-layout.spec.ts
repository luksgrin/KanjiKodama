/**
 * The session screens' layout, with the keyboard simulated (visual viewport:
 * iOS / Chrome; resize: the Android app's WebView): Don't know | Submit on the keyboard, the question
 * view's own height (~133 px unanswered, ~193 px answered with Next in it), the answered Next focused,
 * and dialogs that leave the focus (and so the keyboard) in the answer field.
 */
import { expect, test } from '@playwright/test';
import { answer, answerField, checkQuickActions, keyboardTopFor, openApp, quiz, restoreFile, settle, simulateKeyboard } from './helpers/app';
import { writeReviewSeed } from './helpers/progress';

test('quiz: placement with the keyboard open, dialogs keep the keyboard', async ({ page }, info) => {
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

  // A session dialog leaves the focus in the answer field (the keyboard stays open).
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

  // Answered: Next in the grown header (focused) and at the bottom.
  await answer(page, 'wrong');
  await expect(quiz(page)).toHaveAttribute('data-answered', 'true');
  await settle(page);
  const next = page.getByTestId('next');
  await expect(next).toBeFocused();
  const header = (await page.getByTestId('question-view').boundingBox())!;
  const nb = (await next.boundingBox())!;
  expect(nb.y + nb.height, 'Next inside the question view').toBeLessThanOrEqual(header.y + header.height + 0.5);
  expect(header.height, 'answered question view height (~193 px)').toBeGreaterThan(180);
  expect(header.height, 'answered question view height (~193 px)').toBeLessThan(210);
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
  // buttons end 8 px above it (owner's request).
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
  // Chromium (Android): a long press beside the field neither focuses the body (its focus change comes
  // without a mousedown) nor puts a caret there (the field would lose the selection and the WebView
  // hides the keyboard with the focus unchanged).
  if (page.context().browser()?.browserType().name() === 'chromium' && touch) {
    const cdp = await page.context().newCDPSession(page);
    for (const target of [page.locator('.kk-quiz-spacer'), page.locator('.kk-quiz-answer')]) {
      const b = (await target.boundingBox())!;
      await cdp.send('Input.synthesizeTapGesture', { x: b.x + 8, y: b.y + b.height / 2, duration: 900, tapCount: 1, gestureSourceType: 'touch' });
      await expect(answerField(page), 'long press: the answer field keeps the focus').toBeFocused();
      expect(await page.evaluate(() => {
        const field = document.activeElement!;
        const sel = document.getSelection()!;
        return sel.rangeCount > 0 && sel.anchorNode !== null && sel.anchorNode.contains(field);
      }), 'long press: the selection stays in the answer field').toBe(true);
    }
    // Nothing selects on the unanswered question (owner's request): a long press on text keeps the keyboard too.
    for (const target of [page.getByTestId('question-type'), page.getByTestId('session-progress'), page.locator('.kk-toolbar-title')]) {
      const t = (await target.boundingBox())!;
      await cdp.send('Input.synthesizeTapGesture', { x: t.x + t.width / 2, y: t.y + t.height / 2, duration: 900, tapCount: 1, gestureSourceType: 'touch' });
      await expect(answerField(page), 'long press on text: the answer field keeps the focus').toBeFocused();
      expect(await page.evaluate(() => document.getSelection()?.type), 'long press on text: nothing selected').not.toBe('Range');
    }
    await cdp.detach();
  }
  // Every engine: nothing but the fields is selectable while the question is unanswered.
  const userSelect = (sel: string) => page.locator(sel).first().evaluate((el) => {
    const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitUserSelect?: string };
    return cs.userSelect || cs.webkitUserSelect;
  });
  for (const sel of ['[data-testid=question-type]', '[data-testid=session-progress]', '.kk-toolbar-title', '.kk-quiz-spacer']) {
    expect(await userSelect(sel), `${sel} not selectable`).toBe('none');
  }
  expect(await userSelect('input.kk-answer'), 'the answer field selects').not.toBe('none');
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

  // Answered: presses beside the buttons are the browser's again (the keyboard may hide).
  const prevented = await page.getByTestId('question-type').evaluate((el) => {
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(prevented, 'answered screen: mousedown beside the buttons not prevented').toBe(false);
});

test('quiz: a correct answer keeps Don\'t know | Submit in their normal look until the next question', async ({ page }, info) => {
  const seed = await writeReviewSeed(info, { radicals: 3 });
  await openApp(page);
  await restoreFile(page, seed.path);
  await page.getByTestId('start-reviews').click();
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  // Every quiz button that turns disabled (the live fragment or its exiting copy) while the answer goes in.
  await page.evaluate(() => {
    const w = window as Window & { __kkDisabled?: string[] };
    w.__kkDisabled = [];
    const look = () => {
      for (const b of document.querySelectorAll<HTMLButtonElement>('section.kk-quiz button.kk-btn')) {
        if (b.disabled || b.matches(':disabled')) w.__kkDisabled!.push(b.textContent ?? '');
      }
    };
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  });
  const r = await answer(page, 'correct');
  expect(r.advanced, 'lightning mode: on to the next question').toBe(true);
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  expect(await page.evaluate(() => (window as Window & { __kkDisabled?: string[] }).__kkDisabled), 'no disabled look between the answer and the next question').toEqual([]);
});
