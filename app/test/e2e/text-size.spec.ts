/**
 * Text size and font (Display settings → "Text size and font", `text_size` / `ui_font`): at the smallest
 * and the largest size, in each of the three fonts, the explanation screens, settings, browse and the
 * dashboard (with its study garden and the Garden screen) keep their layout: no sideways scroll, no clipped text, tap targets ≥ 40 px, no text cut
 * off at the bottom of a fixed-height box and no setting rows / tiles overlapping (strict checks, soft
 * failures). The quiz's question, answer field and buttons keep their sizes; ligatures stay off.
 * Phone widths only (320 to 412 px): the narrowest screens are where a bigger text breaks first.
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { answer, checkScreen, openApp, quiz, restoreFile, tab, throughPresentation } from './helpers/app';
import { subjectsAt } from './helpers/content';
import { writeReviewSeed } from './helpers/progress';

const PHONES = ['android-small-320', 'galaxy-s9plus', 'iphone-se', 'pixel-7', 'firefox-390'];
const SIZES = (process.env.KK_TS_SIZES ?? '85,150').split(',');
const FONTS = ['PIXELIFY_SANS', 'DOTGOTHIC16', 'ZEN_MARU_GOTHIC'] as const;

test.beforeEach(({}, info) => {
  test.skip(!PHONES.includes(info.project.name), 'phone widths only');
});

/** Picks the size and font on the Text size and font screen (the AppearancePicker). */
async function choose(page: Page, size: string, font: string): Promise<void> {
  await openApp(page, '/settings?screen=appearance');
  await page.getByTestId(`text-size-${size}`).click();
  await page.getByTestId(`ui-font-${font}`).click();
  await expect(page.getByTestId(`text-size-${size}`)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId(`ui-font-${font}`)).toHaveAttribute('aria-checked', 'true');
  if (size === '100') await expect(page.locator('html')).not.toHaveAttribute('data-text-size');
  else await expect(page.locator('html')).toHaveAttribute('data-text-size', size);
}

/**
 * Text cut off at the bottom of a box that clips (overflow hidden / clip with content taller than the
 * box), and overlapping siblings among setting rows, dialog items, dashboard tiles, browse cells and
 * cards: what a bigger text breaks besides the width.
 */
async function verticalFindings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${el.className.toString().split(' ')[0]}`;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('.kk-shell *, dialog *'))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (cs.overflowY !== 'hidden' && cs.overflowY !== 'clip') continue;
      if (!(el.textContent ?? '').trim()) continue;
      // The quiz's question view gives up height on purpose (session.css); its glyph fits itself. The
      // card glyphs (not scaled) overflow their line box a little at every size.
      if (el.closest('.kk-quiz-question') || el.matches('.kk-link-chars')) continue;
      if (el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0) out.push(`clipped bottom: ${name(el)} ${el.scrollHeight}>${el.clientHeight}`);
    }
    const groups = ['.kk-prefs > li', '.kk-appearance-list > li', '.kk-srs-tile', '.kk-browse-level', '.kk-card', '.kk-subject-row', '.kk-lp-row', '.kk-available-item', '.kk-garden-cell', '.kk-garden-mini', '.kk-garden-week-day', '.kk-garden-stat'];
    for (const sel of groups) {
      const boxes = Array.from(document.querySelectorAll<HTMLElement>(sel))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (boxes[i]!.el.parentElement !== boxes[j]!.el.parentElement) continue;
          const a = boxes[i]!.r;
          const b = boxes[j]!.r;
          // The level progression rows overlap on purpose (tap areas 8 px above and below the bars).
          const slack = sel === '.kk-lp-row' ? 17 : 1;
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 1 && h > slack) out.push(`overlap: ${sel} #${i} / #${j}`);
        }
      }
    }
    return out;
  });
}

async function check(page: Page, info: TestInfo, screen: string, fullPage = false): Promise<void> {
  await checkScreen(page, info, screen, { strict: true, fullPage });
  // The toolbar's title (and subtitle) inside the 56 px bar, whatever the size and font.
  const bar = await page.evaluate(() => {
    const inner = document.querySelector('.kk-toolbar-inner')?.getBoundingClientRect();
    const title = document.querySelector('.kk-toolbar-title')?.getBoundingClientRect();
    return inner && title ? { top: inner.top, bottom: inner.bottom, titleTop: title.top, titleBottom: title.bottom } : null;
  });
  if (bar) {
    expect.soft(bar.titleTop, `${screen}: toolbar title above the bar`).toBeGreaterThanOrEqual(bar.top - 0.5);
    expect.soft(bar.titleBottom, `${screen}: toolbar title below the bar`).toBeLessThanOrEqual(bar.bottom + 0.5);
  }
  // A phone browser widens the layout viewport to fit content that is too wide (then nothing scrolls
  // sideways, but everything is zoomed out): the page must stay as wide as the screen.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect.soft(width, `${screen}: page wider than the screen`).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect.soft(await verticalFindings(page), `${screen}: cut off / overlapping`).toEqual([]);
}

for (const font of FONTS) {
  for (const size of SIZES) {
    test(`screens at ${size} % in ${font}`, async ({ page }, info) => {
      const seed = await writeReviewSeed(info, { radicals: 2, kanji: 2 });
      await openApp(page);
      await restoreFile(page, seed.path);
      await choose(page, size, font);
      const tag = `T-${size}-${font.toLowerCase()}`;
      await check(page, info, `${tag}-01-appearance`, true);

      await openApp(page, '/');
      // Zen Maru Gothic replaces the toolbar's Silkscreen; DotGothic16 keeps it.
      await expect(page.locator('.kk-toolbar-title h1')).toHaveCSS('font-family', font === 'ZEN_MARU_GOTHIC' ? /^"?Zen Maru Gothic/ : /^"?Silkscreen/);
      await expect(page.getByTestId('study-garden')).toBeVisible();
      await check(page, info, `${tag}-02-dashboard`, true);

      // The study garden: the month calendar, then the year.
      await page.getByTestId('study-garden').click();
      await expect(page.getByTestId('garden-month')).toBeVisible();
      await check(page, info, `${tag}-02b-garden-month`, true);
      await page.getByTestId('garden-view-year').click();
      await expect(page.getByTestId('garden-year')).toBeVisible();
      await check(page, info, `${tag}-02c-garden-year`, true);

      await tab(page, 'Browse');
      await check(page, info, `${tag}-03-browse`, true);
      await page.getByTestId('browse-level-1').click();
      await expect(page.getByTestId('num-hits')).toBeVisible();
      await check(page, info, `${tag}-04-search-results`, true);

      const kanji = (await subjectsAt(1, 'kanji'))[0]!;
      const vocab = (await subjectsAt(1, 'vocabulary')).find((s) => [...(s.characters ?? '')].length >= 2)!;
      await openApp(page, `/subject/${kanji.id}`);
      await check(page, info, `${tag}-05-kanji`, true);
      await openApp(page, `/subject/${vocab.id}`);
      await check(page, info, `${tag}-06-vocab`, true);

      for (const screen of ['display_settings', 'subject_info_settings', 'font_settings', 'other_settings']) {
        await openApp(page, `/settings?screen=${screen}`);
        await check(page, info, `${tag}-07-settings-${screen}`, true);
      }
      await tab(page, 'Settings');
      await check(page, info, `${tag}-08-settings`, true);
      await openApp(page, '/settings/about');
      await expect(page.getByTestId('about-fonts')).toBeVisible();
      await check(page, info, `${tag}-09-about`, true);
      await tab(page, 'Study');
      await expect(page.locator('.kk-self-study, [data-testid="self-study-running"]')).toBeVisible();
      await check(page, info, `${tag}-10-self-study`, true);

      // An answered review: the item info under the answer follows the text size.
      await openApp(page, '/');
      await page.getByTestId('start-reviews').click();
      await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
      await check(page, info, `${tag}-11-quiz`);
      await answer(page, 'wrong');
      await check(page, info, `${tag}-12-quiz-answered`, true);
      await page.getByTestId('toolbar-overflow').click();
      await page.getByTestId('menu-session_log').click();
      await expect(page.getByTestId('session-log')).toBeVisible();
      await check(page, info, `${tag}-13-session-log`, true);
    });
  }
}

/** Computed font sizes of the quiz's fixed parts and of a scaled text. */
async function quizSizes(page: Page) {
  return page.evaluate(() => {
    const size = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).fontSize : null;
    };
    return {
      glyph: size('.kk-quiz-glyph'),
      type: size('.kk-quiz-type'),
      answer: size('input.kk-answer'),
      actions: size('.kk-quiz-actions > .kk-btn'),
      body: getComputedStyle(document.body).fontSize,
    };
  });
}

test('the quiz question, answer field and buttons keep their size; the rest follows the text size', async ({ page }, info) => {
  const seed = await writeReviewSeed(info, { radicals: 2, kanji: 2 });
  await openApp(page);
  await restoreFile(page, seed.path);
  await page.getByTestId('start-reviews').click();
  await expect(quiz(page)).toHaveAttribute('data-answered', 'false');
  const normal = await quizSizes(page);
  expect(normal.glyph).not.toBeNull();
  expect(normal.body).toBe('16px');
  // What the setting does to <html> (app/theme.ts), on the same quiz screen.
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-text-size', '150');
    document.documentElement.setAttribute('data-ui-font', 'DOTGOTHIC16');
  });
  const big = await quizSizes(page);
  expect({ ...big, body: null }).toEqual({ ...normal, body: null });
  expect(big.body).toBe('24px');
});

test('lesson presentation at the largest size', async ({ page }, info) => {
  await openApp(page);
  await choose(page, '150', 'PIXELIFY_SANS');
  await openApp(page, '/');
  await page.getByTestId('start-lessons').click();
  await throughPresentation(page, async (i) => {
    if (i === 0) await check(page, info, 'T-150-lesson-presentation', true);
  });
  // The lesson quiz follows.
  await expect(quiz(page)).toBeVisible();
});

test('no ligatures: "fi" is two glyphs in every body font', async ({ page }) => {
  await openApp(page);
  const widths = await page.evaluate(async () => {
    const out: Record<string, [number, number]> = {};
    for (const family of ['Pixelify Sans', 'DotGothic16', 'Zen Maru Gothic']) {
      await document.fonts.load(`32px '${family}'`, 'fi');
      const span = (text: string) => {
        const s = document.createElement('span');
        // No kerning: the zero-width non-joiner below would also stop the "f" + "i" kerning pair.
        s.style.cssText = `font-family: '${family}'; font-size: 32px; font-kerning: none; white-space: pre; position: absolute;`;
        s.textContent = text;
        document.querySelector('.kk-shell')!.append(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return w;
      };
      // U+200C (zero-width non-joiner) keeps "f" and "i" apart even where ligatures are on.
      out[family] = [span('fififlff'), span('f‌i‌f‌i‌f‌l‌f‌f')];
    }
    return out;
  });
  for (const [family, [joined, apart]] of Object.entries(widths)) {
    expect(Math.abs(joined - apart), `${family}: "fi" drawn as a ligature`).toBeLessThan(0.5);
  }
  await expect(page.locator('.kk-shell')).toHaveCSS('font-variant-ligatures', 'none');
});
