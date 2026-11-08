/**
 * Romaji → kana in reading answers, the way different keyboards deliver text: key events, insertText
 * input events (Gboard / iOS), IME composition (Samsung Keyboard composes even Latin text; Japanese IMEs
 * compose kana), and Enter / Go submitting.
 */
import { expect, test, type Page } from '@playwright/test';
import { answer, answerAllCorrect, answerField, composeInto, openApp, questionInfo, quiz, restoreFile, submitWith, typeAnswer } from './helpers/app';
import { correctAnswer } from './helpers/content';
import { writeReviewSeed } from './helpers/progress';
import { kanaToRomaji } from './helpers/romaji';

/** Starts a review of one kanji and answers until its reading question shows; returns the expected kana. */
async function toReadingQuestion(page: Page, info: Parameters<typeof writeReviewSeed>[0]): Promise<string> {
  const seed = await writeReviewSeed(info, { kanji: 1 });
  await openApp(page);
  await restoreFile(page, seed.path);
  await page.getByTestId('start-reviews').click();
  for (let i = 0; i < 2; i++) {
    await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
    const q = await questionInfo(page);
    const a = await correctAnswer(q);
    if (a.reading) {
      await expect(answerField(page)).toHaveAttribute('lang', 'ja');
      await expect(answerField(page)).toHaveAttribute('placeholder', '答え');
      return a.answer;
    }
    expect((await answer(page, 'correct')).advanced).toBe(true);
  }
  throw new Error('no reading question');
}

async function submitAndExpectCorrect(page: Page): Promise<void> {
  expect(await submitWith(page, () => page.getByTestId('submit').click())).toBe(true);
  await finishCorrect(page);
}

/** The reading was correct (lightning: on at once); the meaning question may still come; then the summary. */
async function finishCorrect(page: Page): Promise<void> {
  await answerAllCorrect(page);
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('summary-correct-percentage')).toHaveText('100%');
}

test.describe('romaji to kana', () => {
  test('keyboard.type: key events per character', async ({ page }, info) => {
    const kana = await toReadingQuestion(page, info);
    await typeAnswer(page, kanaToRomaji(kana), 'keyboard');
    await expect(answerField(page)).toHaveValue(kana);
    await submitAndExpectCorrect(page);
  });

  test('insertText input events without key events (Gboard, iOS)', async ({ page }, info) => {
    const kana = await toReadingQuestion(page, info);
    await typeAnswer(page, kanaToRomaji(kana), 'insertText');
    await expect(answerField(page)).toHaveValue(kana);
    await submitAndExpectCorrect(page);
  });

  test('IME composition of Latin text (Samsung Keyboard): untouched while composing, kana after', async ({ page }, info) => {
    const kana = await toReadingQuestion(page, info);
    const romaji = kanaToRomaji(kana);
    const field = answerField(page);
    await field.focus();
    // Mid-composition: the field must not be rewritten.
    await field.evaluate((el, r) => {
      const input = el as HTMLInputElement;
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      input.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: r }));
      input.value = r;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: r, inputType: 'insertCompositionText', isComposing: true }));
    }, romaji);
    await expect(field).toHaveValue(romaji);
    await field.evaluate((el, r) => {
      const input = el as HTMLInputElement;
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: r }));
    }, romaji);
    await expect(field).toHaveValue(kana);
    await submitAndExpectCorrect(page);
  });

  test('IME composition step by step (Latin keyboard composing until the end)', async ({ page }, info) => {
    const kana = await toReadingQuestion(page, info);
    await typeAnswer(page, kanaToRomaji(kana), 'composition');
    await expect(answerField(page)).toHaveValue(kana);
    await submitAndExpectCorrect(page);
  });

  test('Japanese IME composing kana directly', async ({ page }, info) => {
    const kana = await toReadingQuestion(page, info);
    await answerField(page).focus();
    await composeInto(answerField(page), kana);
    await expect(answerField(page)).toHaveValue(kana);
    await submitAndExpectCorrect(page);
  });

  test('partial input: a trailing n stays until the next key; Enter submits', async ({ page }, info) => {
    const kana = await toReadingQuestion(page, info);
    const field = answerField(page);
    await field.focus();
    await page.keyboard.type('kan');
    await expect(field).toHaveValue('かn');
    await page.keyboard.type('ji');
    await expect(field).toHaveValue('かんじ');
    await field.fill('');
    await typeAnswer(page, kanaToRomaji(kana), 'keyboard');
    expect(await submitWith(page, () => page.keyboard.press('Enter'))).toBe(true);
    await finishCorrect(page);
  });
});
