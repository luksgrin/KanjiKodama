/**
 * What a quiz question asks for: the kind badge on the question banner (意 meaning, 音 on'yomi,
 * 訓 kun'yomi, 音訓 either, 読 reading) and the hint after a shake ("That's a kun'yomi (訓). We're
 * looking for the on'yomi (音)."). Subjects are picked from the content at run time; nothing of it is
 * written into this file or printed.
 */
import { expect, test, type Page } from '@playwright/test';
import { answerField, checkScreen, next, openApp, questionInfo, quiz, restoreFile, shot, submitWith, typeAnswer } from './helpers/app';
import { correctAnswer, subjects, type Subject } from './helpers/content';
import { writeSubjectsSeed } from './helpers/progress';
import { kanaToRomaji } from './helpers/romaji';

type Reading = Subject['readings'][number];
const visible = (s: Subject) => s.hiddenAt === 0 && s.id < 100000 && s.characters !== null;
const plainKana = (r: Reading) => /^[ぁ-ん]+$/.test(r.reading);
const accepted = (s: Subject, type: string) => s.readings.filter((r) => r.accepted_answer && r.type === type);
const unaccepted = (s: Subject, type: string) => s.readings.filter((r) => !r.accepted_answer && r.type === type && plainKana(r)
  && !s.readings.some((a) => a.accepted_answer && a.reading === r.reading));

/** The first kanji (lesson order) that takes only `want` readings and has an unaccepted plain-kana `other` one. */
async function kanjiTaking(want: 'onyomi' | 'kunyomi'): Promise<{ subject: Subject; wrong: Reading }> {
  const other = want === 'onyomi' ? 'kunyomi' : 'onyomi';
  const s = (await subjects()).find((x) => x.object === 'kanji' && visible(x) && accepted(x, want).length > 0
    && accepted(x, other).length === 0 && unaccepted(x, other).length > 0);
  if (!s) throw new Error(`no kanji taking only ${want}`);
  return { subject: s, wrong: unaccepted(s, other)[0]! };
}

async function startReviews(page: Page, info: Parameters<typeof writeSubjectsSeed>[0], chosen: Subject[], name: string): Promise<void> {
  const seed = await writeSubjectsSeed(info, chosen, name);
  await openApp(page);
  await restoreFile(page, seed.path);
  await page.getByTestId('start-reviews').click();
  await expect(quiz(page)).toBeVisible();
}

const badge = (page: Page) => page.getByTestId('question-type').getByTestId('reading-kind-badge');
const isReading = (title: string) => !/(Meaning|Name)$/.test(title);

/**
 * Answers every question correctly until the summary; `onQuestion` runs first on each (and may type a
 * wrong-kind answer that only shakes). Returns the badge kinds seen per question title.
 */
async function runAll(page: Page, onQuestion: (title: string, kind: string) => Promise<void>): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  for (let n = 0; n < 20; n++) {
    await expect(page.locator('[data-testid="summary"], section.kk-quiz[data-answered="false"]:not(.kk-fragment-exit *)').first()).toBeVisible();
    if (await page.getByTestId('summary').isVisible()) return seen;
    const q = await questionInfo(page);
    const kind = (await badge(page).getAttribute('data-kind')) ?? '';
    seen.set(q.title, kind);
    await onQuestion(q.title, kind);
    const { answer, reading } = await correctAnswer(q);
    await answerField(page).fill('');
    await typeAnswer(page, reading ? kanaToRomaji(answer) : answer, 'keyboard');
    if (!(await submitWith(page, () => page.getByTestId('submit').click()))) await next(page);
  }
  throw new Error('quiz did not end');
}

/** Types `romaji`, submits, and expects a shake with the retry hint `text` (the question stays unanswered). */
async function expectShake(page: Page, romaji: string, text: string): Promise<void> {
  await typeAnswer(page, romaji, 'keyboard');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('quiz-toast-retry')).toHaveText(text);
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
}

test("on'yomi kanji: 音 badge, and a kun'yomi answer shakes with a hint", async ({ page }, info) => {
  const { subject, wrong } = await kanjiTaking('onyomi');
  await startReviews(page, info, [subject], 'onyomi');
  let shook = false;
  const seen = await runAll(page, async (title) => {
    if (!isReading(title) || shook) return;
    shook = true;
    await expect(page.getByTestId('question-title')).toHaveText("Kanji On'yomi");
    await checkScreen(page, info, 'reading-kind-onyomi');
    await expectShake(page, kanaToRomaji(wrong.reading), "That's a kun'yomi (訓). We're looking for the on'yomi (音).");
    await page.waitForTimeout(1000); // the toast faded in, not yet out
    await shot(page, info, 'reading-kind-onyomi-retry');
  });
  expect(shook).toBe(true);
  expect(Object.fromEntries(seen)).toEqual({ 'Kanji Meaning': 'meaning', "Kanji On'yomi": 'onyomi' });
});

test("kun'yomi kanji: 訓 badge, and an on'yomi answer shakes with a hint", async ({ page }, info) => {
  const { subject, wrong } = await kanjiTaking('kunyomi');
  await startReviews(page, info, [subject], 'kunyomi');
  let shook = false;
  const seen = await runAll(page, async (title) => {
    if (!isReading(title) || shook) return;
    shook = true;
    await expectShake(page, kanaToRomaji(wrong.reading), "That's an on'yomi (音). We're looking for the kun'yomi (訓).");
  });
  expect(shook).toBe(true);
  expect(Object.fromEntries(seen)).toEqual({ 'Kanji Meaning': 'meaning', "Kanji Kun'yomi": 'kunyomi' });
});

// No kanji in the content takes both kinds (音訓): the unit tests cover that badge.
test('vocabulary: 読 and 意 badges; a reading typed for the meaning shakes with a hint', async ({ page }, info) => {
  const word = (await subjects()).find((x) => x.object === 'vocabulary' && visible(x) && x.readings.some((r) => r.accepted_answer && plainKana(r)));
  if (!word) throw new Error('no vocabulary for the test');
  await startReviews(page, info, [word], 'vocab');
  let shook = false;
  const seen = await runAll(page, async (title) => {
    if (title !== 'Vocabulary Meaning' || shook) return;
    shook = true;
    const r = word.readings.find((x) => x.accepted_answer && plainKana(x))!;
    await expectShake(page, kanaToRomaji(r.reading), "That's a reading. We're looking for the meaning (意).");
    await page.waitForTimeout(1000);
    await shot(page, info, 'reading-kind-meaning-retry');
  });
  expect(shook).toBe(true);
  expect(Object.fromEntries(seen)).toEqual({ 'Vocabulary Meaning': 'meaning', 'Vocabulary Reading': 'reading' });
});

test('with the setting off a kanji reading question is a plain 読 Reading', async ({ page }, info) => {
  const { subject } = await kanjiTaking('onyomi');
  const seed = await writeSubjectsSeed(info, [subject], 'off');
  await openApp(page);
  await restoreFile(page, seed.path);
  await openApp(page, '/settings?screen=review_settings');
  const row = page.getByTestId('setting-indicate_kanji_reading_type');
  await expect(row).toHaveAttribute('aria-checked', 'true');
  await row.click();
  await expect(row).toHaveAttribute('aria-checked', 'false');
  await openApp(page, '/');
  await page.getByTestId('start-reviews').click();
  await expect(quiz(page)).toBeVisible();
  const seen = await runAll(page, async () => undefined);
  expect(Object.fromEntries(seen)).toEqual({ 'Kanji Meaning': 'meaning', 'Kanji Reading': 'reading' });
});
