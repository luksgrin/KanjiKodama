/** Driving the app: start, navigation, quiz answers, restore, layout checks and screenshots. */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { correctAnswer, type QuestionInfo, type SubjectObject } from './content';
import { SCREENSHOT_DIR } from './paths';
import { kanaToRomaji } from './romaji';

/** Opens the app at a hash route and waits until it is ready (start-up screen gone). */
export async function openApp(page: Page, route = '/'): Promise<void> {
  await page.goto(`./#${route}`);
  await waitReady(page);
}

export async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('.kk-shell')).toBeVisible({ timeout: 60_000 });
}

/** Bottom-nav tab by label (Home, Browse, Study, Settings). */
export async function tab(page: Page, label: 'Home' | 'Browse' | 'Study' | 'Settings'): Promise<void> {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label }).click();
}

export async function dashboardCounts(page: Page): Promise<{ lessons: number; reviews: number }> {
  await expect(page.getByTestId('lessons-count')).toBeVisible();
  return {
    lessons: Number(await page.getByTestId('lessons-count').innerText()),
    reviews: Number(await page.getByTestId('reviews-count').innerText()),
  };
}

// ---- quiz ---------------------------------------------------------------------------------------

export const answerField = (page: Page): Locator => page.locator('input.kk-answer');
export const quiz = (page: Page): Locator => page.locator('section.kk-quiz');

export async function questionInfo(page: Page): Promise<QuestionInfo> {
  const view = page.getByTestId('question-view');
  await expect(view).toBeVisible();
  const cls = (await view.getAttribute('class', { timeout: 10_000 })) ?? '';
  const object = /kk-type--(\w+)/.exec(cls)?.[1] as SubjectObject | undefined;
  if (object === undefined) throw new Error('question view without a subject type class');
  return {
    text: (await page.getByTestId('question-text').innerText({ timeout: 10_000 })).trim(),
    title: (await page.getByTestId('question-type').innerText({ timeout: 10_000 })).trim(),
    object,
  };
}

export type TypingMode = 'keyboard' | 'fill' | 'insertText' | 'composition';

/**
 * Types `text` into the focused answer field the way a keyboard kind would:
 * - keyboard: key events per character (hardware / most Latin soft keyboards);
 * - fill: one value change (paste, autofill);
 * - insertText: `input` events with inputType insertText per character, no key events (Gboard / iOS);
 * - composition: an IME composition (compositionstart, update + composing input per step, compositionend),
 *   as Samsung Keyboard does even for Latin text and Japanese IMEs do for kana.
 */
export async function typeAnswer(page: Page, text: string, mode: TypingMode): Promise<void> {
  const field = answerField(page);
  await field.focus();
  switch (mode) {
    case 'keyboard':
      await page.keyboard.type(text, { delay: 5 });
      break;
    case 'fill':
      await field.fill(text);
      break;
    case 'insertText':
      for (const ch of [...text]) await page.keyboard.insertText(ch);
      break;
    case 'composition':
      await composeInto(field, text);
      break;
  }
}

/** Simulates an IME composing `text` step by step, then committing it. */
export async function composeInto(field: Locator, text: string, steps?: string[]): Promise<void> {
  await field.evaluate((el, { text, steps }) => {
    const input = el as HTMLInputElement;
    const start = input.value;
    const parts = steps ?? [...text].map((_, i) => [...text].slice(0, i + 1).join(''));
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    for (const p of parts) {
      input.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: p }));
      input.value = start + p;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: p, inputType: 'insertCompositionText', isComposing: true }));
    }
    input.value = start + text;
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
    // Chrome fires one more (non-composing) input after compositionend.
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText', isComposing: false }));
  }, { text, steps });
}

export type Outcome = 'correct' | 'wrong' | 'dontknow';

export interface Answered {
  question: QuestionInfo;
  /** Lightning mode (on by default): a correct answer went straight on to the next question / summary. */
  advanced: boolean;
}

/**
 * Answers the current question. Reading answers are typed as romaji. With lightning mode (the default)
 * a correct answer moves on at once; otherwise the answered state (Next) shows.
 */
export async function answer(page: Page, outcome: Outcome, mode: TypingMode = 'keyboard'): Promise<Answered> {
  const q = await questionInfo(page);
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  if (outcome === 'dontknow') {
    return { question: q, advanced: await submitWith(page, () => page.getByTestId('dont-know').click()) };
  }
  const { answer: a, reading } = await correctAnswer(q);
  const typed = outcome === 'correct' ? (reading ? kanaToRomaji(a) : a) : (reading ? 'nunununu' : 'qqxqzz');
  await typeAnswer(page, typed, mode);
  return { question: q, advanced: await submitWith(page, () => page.getByTestId('submit').click()) };
}

/**
 * Runs `act` (a tap on Submit / Don't know, Enter…) and waits until the quiz reacted: the answered state,
 * or (lightning mode) a new question or the summary. Returns true when it moved on.
 */
export async function submitWith(page: Page, act: () => Promise<unknown>): Promise<boolean> {
  // Mark this question's field: a new question remounts the quiz (and the field) without the mark.
  await answerField(page).evaluate((el) => { el.setAttribute('data-e2e-old', '1'); });
  await act();
  const answered = page.locator('section.kk-quiz[data-answered="true"]');
  const moved = page.locator('[data-testid="summary"], input.kk-answer:not([data-e2e-old])');
  await expect(answered.or(moved).first()).toBeVisible();
  return !(await answered.isVisible());
}

export async function next(page: Page): Promise<void> {
  await page.getByTestId('next').click();
}

/** Answers every question correctly until the summary shows; returns how many questions were answered. */
export async function answerAllCorrect(page: Page, max = 200): Promise<number> {
  for (let n = 0; n < max; n++) {
    await expect(page.locator('[data-testid="summary"], section.kk-quiz[data-answered="false"]').first()).toBeVisible();
    if (await page.getByTestId('summary').isVisible()) return n;
    const r = await answer(page, 'correct');
    if (!r.advanced) await next(page);
  }
  throw new Error('quiz did not end');
}

/** The lesson presentation: Next through every item, then Start quiz. Returns the batch size. */
export async function throughPresentation(page: Page, onItem?: (i: number) => Promise<void>): Promise<number> {
  const progress = page.getByTestId('session-progress');
  await expect(progress).toBeVisible();
  const total = Number((await progress.innerText()).split('/')[1]);
  for (let i = 0; i < total; i++) {
    await expect(progress).toHaveText(`${i + 1}/${total}`);
    if (onItem) await onItem(i);
    const btn = page.getByTestId('lesson-next');
    await expect(btn).toHaveText(i === total - 1 ? 'Start quiz' : 'Next');
    await btn.click();
  }
  return total;
}

// ---- progress files -----------------------------------------------------------------------------

/** Settings → Restore progress with `path`; returns the confirmation summary text (not yet confirmed). */
export async function pickRestoreFile(page: Page, path: string): Promise<string> {
  await openApp(page, '/settings');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore progress' }).click();
  await (await chooser).setFiles(path);
  const dialog = page.getByRole('dialog', { name: 'Restore progress?' });
  await expect(dialog).toBeVisible();
  return dialog.locator('.kk-dialog-body p').first().innerText();
}

/** Restores `path` (confirming) and returns to the dashboard. */
export async function restoreFile(page: Page, path: string): Promise<string> {
  const summary = await pickRestoreFile(page, path);
  await page.getByRole('dialog', { name: 'Restore progress?' }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByTestId('progress-status')).toBeVisible();
  await expect(page.getByTestId('progress-status')).not.toHaveClass(/kk-error-text/);
  await tab(page, 'Home');
  return summary;
}

/** Advanced settings on, special button 1 = Undo (retry now). */
export async function enableUndoButton(page: Page): Promise<void> {
  await openApp(page, '/settings/advanced');
  await page.getByTestId('setting-enable_advanced').getByRole('switch').click();
  const dlg = page.getByRole('dialog', { name: 'Enable advanced settings?' });
  await dlg.getByRole('button', { name: 'Yes' }).click();
  const select = page.getByTestId('setting-undo_button').locator('select');
  await select.scrollIntoViewIfNeeded();
  await select.selectOption('UNDO_AND_RETRY_NOW');
  await expect(select).toHaveValue('UNDO_AND_RETRY_NOW');
}

// ---- layout -------------------------------------------------------------------------------------

export async function noHorizontalScroll(page: Page, screen: string): Promise<void> {
  const m = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(m.scroll, `${screen}: page scrolls sideways (scrollWidth ${m.scroll} > innerWidth ${m.inner})`).toBeLessThanOrEqual(m.inner);
}

/** Visible interactive controls smaller than `min` px in both dimensions' required one (height for most, width too). */
export async function smallTapTargets(page: Page, min = 40): Promise<string[]> {
  return page.evaluate((min) => {
    const out: string[] = [];
    const sel = 'button:not([hidden]), [role="button"], [role="switch"], [role="radio"], [role="menuitem"], input:not([type="hidden"]), select, .kk-bottomnav a, a.kk-row, summary';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest('[aria-hidden="true"], [hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      // A checkbox/switch inside a row is tapped through its label row; measure the row then.
      // (or through its wrapping <label>).
      const target = (el.matches('input[type="checkbox"], input[type="radio"]') && (el.closest('label') ?? el.closest('.kk-row'))) as HTMLElement | null;
      const box = target ? target.getBoundingClientRect() : r;
      if (box.height < min || box.width < min) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? el.getAttribute('name') ?? '').trim().slice(0, 30);
        const id = el.getAttribute('data-testid') ?? el.className.toString().split(' ')[0] ?? el.tagName;
        out.push(`${el.tagName.toLowerCase()}[${id}] "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    }
    return out;
  }, min);
}

/** Elements whose text is cut off (overflow hidden/clip/ellipsis with content wider than the box). */
export async function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.kk-shell *'))) {
      if (el.children.length > 0 && el.childNodes.length === el.children.length) continue; // no own text
      const text = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? '').join('').trim();
      if (text === '') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const clipsX = cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis';
      if (clipsX && el.scrollWidth > el.clientWidth + 1) {
        out.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} "${text.slice(0, 20)}…" ${el.scrollWidth}>${el.clientWidth}`);
      }
      // Text running past the right edge of the screen.
      if (r.right > window.innerWidth + 1 && cs.position !== 'fixed') {
        out.push(`${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]} off-screen right ${Math.round(r.right)}>${window.innerWidth}`);
      }
    }
    return out;
  });
}

/**
 * The per-screen checks: screenshot, no sideways scroll (always a failure), tap targets ≥ 40 px and no
 * clipped text. In the flow specs the last two are recorded (annotation + screenshots/<project>/findings.txt);
 * `strict` (layout.spec.ts) makes them soft failures.
 */
export async function checkScreen(page: Page, info: TestInfo, screen: string, opts: { strict?: boolean; fullPage?: boolean } = {}): Promise<void> {
  await page.evaluate(() => document.fonts?.ready);
  await shot(page, info, screen, opts.fullPage);
  await noHorizontalScroll(page, screen);
  const taps = await smallTapTargets(page);
  const clipped = await clippedText(page);
  if (opts.strict) {
    expect.soft(taps, `${screen}: tap targets under 40 px`).toEqual([]);
    expect.soft(clipped, `${screen}: clipped text`).toEqual([]);
  }
  const findings = [...taps.map((t) => `small tap target: ${t}`), ...clipped.map((t) => `clipped: ${t}`)];
  if (findings.length > 0) {
    info.annotations.push({ type: 'layout', description: `${screen}: ${findings.join('; ')}` });
    const dir = join(SCREENSHOT_DIR, info.project.name);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'findings.txt'), findings.map((f) => `${screen}\t${f}\n`).join(''));
  }
}

export async function shot(page: Page, info: TestInfo, screen: string, fullPage = false): Promise<void> {
  const dir = join(SCREENSHOT_DIR, info.project.name);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${screen}.png`), fullPage });
}

/**
 * The quick-action row (Don't know | Submit, or Next) directly under the answer field and inside the
 * viewport; on short phones inside the space left with the keyboard open (`keyboardTop`).
 */
export async function checkQuickActions(page: Page, screen: string, keyboardTop?: number): Promise<void> {
  const frame = await page.getByTestId('answer-frame').boundingBox();
  const row = await page.getByTestId('quick-actions').boundingBox();
  const vp = page.viewportSize();
  if (!frame || !row || !vp) throw new Error(`${screen}: answer field or quick actions not laid out`);
  const gap = row.y - (frame.y + frame.height);
  expect(gap, `${screen}: quick actions not directly under the answer field (gap ${gap}px)`).toBeGreaterThanOrEqual(-1);
  expect(gap, `${screen}: quick actions not directly under the answer field (gap ${gap}px)`).toBeLessThanOrEqual(24);
  expect(row.x, `${screen}: quick actions start left of the screen`).toBeGreaterThanOrEqual(0);
  expect(row.x + row.width, `${screen}: quick actions past the right edge`).toBeLessThanOrEqual(vp.width + 0.5);
  expect(row.y + row.height, `${screen}: quick actions below the viewport`).toBeLessThanOrEqual(vp.height);
  if (keyboardTop !== undefined) {
    expect(row.y + row.height, `${screen}: quick actions hidden by the keyboard (bottom ${Math.round(row.y + row.height)} > ${keyboardTop})`)
      .toBeLessThanOrEqual(keyboardTop);
  }
  const buttons = page.getByTestId('quick-actions').getByRole('button');
  for (let i = 0; i < (await buttons.count()); i++) {
    const b = await buttons.nth(i).boundingBox();
    expect(b?.height ?? 0, `${screen}: quick action button under 40 px high`).toBeGreaterThanOrEqual(40);
  }
}

/** The visible height with the on-screen keyboard open, for the phones the owner named (iPhone SE: ≈410). */
export function keyboardTopFor(info: TestInfo): number | undefined {
  return info.project.name === 'iphone-se' ? 410 : undefined;
}
