// @vitest-environment jsdom
// Item page screen, browse and search: synonyms, burn / resurrect, star ratings, levels, romaji search, presets.
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs, { type Database } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { createMemoryLocation } from '../../src/app/router';
import type { LoadedContent } from '../../src/content/contentFile';
import { makeContent, type ContentSubject } from '../../src/core/content';
import { progressRow, updateProgress } from '../../src/core/progression';
import { extraSearchTargets } from '../../src/core/search';
import { KkDb } from '../../src/storage/db';
import { SCHEMA_SQL } from '../../scripts/content/schema';
import { NO_JLPT, subject } from '../progress-storage/helpers';
import { makeApp, T0, type Harness } from './fixtures';
import { sessionRuntime } from '../../src/ui/components/session';
import { defaultParameters } from '../../src/core/search';
import { levelColumns } from '../../src/ui/screens/browse/BrowseScreen';
import { resultSpans } from '../../src/ui/screens/browse/SearchResultsScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = (meaning: string) => ({ meaning, primary: true, accepted_answer: true });
const r = (reading: string, type: string | null = null) => ({ reading, primary: true, accepted_answer: true, type });

function subjects(): ContentSubject[] {
  return [
    { ...subject(1, 'radical', 1, [], '一'), meanings: [m('Ground')], amalgamationSubjectIds: [10] },
    { ...subject(10, 'kanji', 1, [1], '一'), meanings: [m('One')], readings: [r('いち', 'onyomi')], amalgamationSubjectIds: [100] },
    { ...subject(100, 'vocabulary', 1, [10], '食べる'), meanings: [m('To Eat')], readings: [r('たべる')] },
    { ...subject(3, 'radical', 2, [], '三'), meanings: [m('Three')] },
  ];
}

let db: Database;
let loadedContent: LoadedContent;

beforeAll(async () => {
  // jsdom: no file: import.meta.url, so load the wasm from the package (cwd is app/).
  const SQL = await initSqlJs({ wasmBinary: readFileSync(join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')) as unknown as ArrayBuffer });
  db = new SQL.Database();
  db.run(SCHEMA_SQL);
  // The Parts and sound tables the kanji page reads (empty).
  db.run(`CREATE TABLE kanji_part (literal TEXT, ordinal INTEGER, glyph TEXT, role TEXT, name TEXT);
    CREATE TABLE kanji_sound (literal TEXT, phonetic TEXT, series_reading TEXT, series_id INTEGER, actual_reading TEXT, match TEXT);
    CREATE TABLE series (id INTEGER, reliability TEXT, core_members TEXT);
    CREATE TABLE series_member (series_id INTEGER, literal TEXT, reading TEXT, match TEXT);`);
  // Search by parts: 口 and 亅 have no kanji of this content, so the picker drops them.
  db.run("INSERT INTO radical (ordinal, glyph, strokes, kanji) VALUES (0, '一', 1, '一'), (1, '亅', 1, '了'), (2, '口', 3, '口')");
  for (const s of subjects()) {
    const t = extraSearchTargets(s.characters ?? '', s.meanings, s.readings);
    db.run('INSERT INTO subject (id, object, level, characters, meaningMnemonic, searchTarget, smallSearchTarget) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [s.id, s.object, s.level, s.characters, `Mnemonic of ${s.id}`, t.searchTarget, t.smallSearchTarget]);
  }
  loadedContent = {
    manifest: null, db, content: makeContent(subjects(), []), wkOrder: new Map(), jlptOrder: new Map(), jlptBlocks: [],
    jlptKanji: new Map(NO_JLPT),
  };
});

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

async function render(path: string, opts: { dbName?: string; setup?: (h: Harness) => Promise<void> } = {}) {
  act(() => root?.unmount());
  container?.remove();
  const h = makeApp({ dbName: opts.dbName, content: loadedContent.content, loadContent: async () => loadedContent });
  await h.app.start();
  await opts.setup?.(h);
  container = document.createElement('div');
  document.body.append(container);
  const location = createMemoryLocation(path);
  await act(async () => {
    root = createRoot(container!);
    root.render(<App app={h.app} location={location} />);
  });
  await flush();
  return { ...h, location, el: container };
}

/** Lets Dexie promises and React effects settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
}

function button(el: HTMLElement, text: string | RegExp): HTMLButtonElement {
  const b = [...el.querySelectorAll('button')].find((x) => (typeof text === 'string' ? x.textContent?.trim() === text : text.test(x.textContent ?? '')));
  if (!b) throw new Error(`no button ${String(text)}`);
  return b;
}

async function click(b: Element): Promise<void> {
  await act(async () => { (b as HTMLElement).click(); });
  await flush();
}

async function type(input: HTMLInputElement | HTMLSelectElement, value: string): Promise<void> {
  const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

const openDialog = (el: HTMLElement): HTMLElement => {
  const d = el.ownerDocument.querySelector('dialog[open]');
  if (!d) throw new Error('no open dialog');
  return d as HTMLElement;
};

describe('item page screen', () => {
  it('saves a synonym, which persists and shows after a reload', async () => {
    const { el, app, dbName } = await render('/subject/100');
    expect(el.textContent).toContain('Mnemonic of 100');
    await click(el.querySelector('button[aria-label="Add synonym"]')!);
    const dialog = openDialog(el);
    await type(dialog.querySelector('input')!, 'devour');
    await click(button(dialog, 'Save'));
    expect(String(progressRow(app.requireLearner(), 100).meaningSynonyms)).toContain('devour');
    app.dispose();

    const again = await render('/subject/100', { dbName });
    expect(again.el.querySelector('.kk-synonyms')?.textContent).toContain('devour');
    expect(progressRow(again.app.requireLearner(), 100).studyMaterialPatched).toBe(1);
    again.app.dispose();
  });

  it('resurrects and burns again, with the columns in the exported progress', async () => {
    const { el, app, clock, dbName } = await render('/subject/10', {
      setup: async (h) => {
        await h.app.write((l) => updateProgress(l, 10, { srsStage: 9, unlockedAt: T0 - 100, startedAt: T0 - 90, passedAt: T0 - 50, burnedAt: T0 - 10, availableAt: 0 }));
      },
    });
    expect(() => button(el, 'Burn')).toThrow();
    await click(button(el, 'Resurrect'));
    await click(button(openDialog(el), 'Start'));
    expect(openDialog(el).querySelector('[data-testid="burn-counts"]')?.textContent).toContain('Resurrected: 1');
    await click(button(openDialog(el), 'Close'));
    const now = clock.now();
    const exported = (): Record<string, unknown> => {
      const file = JSON.parse(app.exportProgressFile().text) as { subjects: Record<string, unknown>[] };
      return file.subjects.find((s) => s.id === 10)!;
    };
    expect(exported()).toMatchObject({
      srsStage: 1, unlockedAt: T0 - 100, startedAt: T0 - 90, availableAt: now, passedAt: T0 - 50, burnedAt: 0, resurrectedAt: now, assignmentPatched: 1,
    });

    await click(button(el, 'Burn'));
    await click(button(openDialog(el), 'Start'));
    await click(button(openDialog(el), 'Close'));
    expect(exported()).toMatchObject({ srsStage: 9, availableAt: 0, burnedAt: now, resurrectedAt: 0, assignmentPatched: 1 });
    expect(button(el, 'Resurrect')).toBeTruthy();
    app.dispose();

    // Persisted: the reloaded learner has the burned row.
    const kk = new KkDb(dbName);
    expect(await kk.subjects.get(10)).toMatchObject({ srsStage: 9, burnedAt: now, resurrectedAt: 0 });
    kk.close();
  });

  it('keeps a star rating', async () => {
    const setup = async (h: Harness) => h.app.setPreference('enable_star_ratings', true);
    const { el, app, dbName } = await render('/subject/10', { setup });
    await click(el.querySelector('button[aria-label="3 stars"]')!);
    expect(el.querySelector('button[aria-label="3 stars"]')?.getAttribute('aria-pressed')).toBe('true');
    app.dispose();
    const again = await render('/subject/10', { dbName, setup });
    expect(again.el.querySelector('button[aria-label="3 stars"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(again.el.querySelector('button[aria-label="4 stars"]')?.getAttribute('aria-pressed')).toBe('false');
    // Tapping the current rating clears it.
    await click(again.el.querySelector('button[aria-label="3 stars"]')!);
    expect(again.el.querySelector('button[aria-label="1 star"]')?.getAttribute('aria-pressed')).toBe('false');
    again.app.dispose();
  });
});

async function menu(el: HTMLElement, id: string): Promise<void> {
  await click(el.querySelector('[data-testid="toolbar-overflow"]')!);
  const item = el.querySelector<HTMLButtonElement>(`[data-testid="menu-${id}"]`);
  if (!item) throw new Error(`no menu item ${id}`);
  await click(item);
}

describe('browse and search', () => {
  it('shows the overview: tutorial, flat level grid, keyword and advanced search', async () => {
    const { el, app } = await render('/browse');
    expect(el.querySelector('[data-testid="toolbar"] h1')?.textContent).toBe('Browse / search');
    expect(el.querySelector('[data-testid="browse-tutorial"]')?.textContent).toContain('From this screen you can search the subject database');
    expect([...el.querySelectorAll('.kk-browse-heading')].map((h) => h.textContent)).toEqual(['Choose a level to browse:', 'Search by parts:', 'Keyword search:', 'Advanced search:']);
    expect(el.querySelectorAll('.kk-browse-level')).toHaveLength(2);
    expect(el.querySelector('[data-testid="browse-level-1"]')?.getAttribute('aria-current')).toBe('true');
    await click(button(el.querySelector('[data-testid="browse-tutorial"]')!, 'Dismiss'));
    expect(el.querySelector('[data-testid="browse-tutorial"]')).toBeNull();
    app.dispose();
  });

  it('puts the results actions in the toolbar menu, as res/menu does', async () => {
    const { el, app } = await render('/browse/results?t=0&q=1');
    expect(el.querySelector('[data-testid="results-tutorial"]')).not.toBeNull();
    await click(el.querySelector('[data-testid="toolbar-overflow"]')!);
    const items = [...el.querySelectorAll('[data-testid^="menu-search_result_"]')].map((b) => b.textContent);
    expect(items).toEqual(['Refine search', 'Save preset', 'Start self-study quiz']);
    await click(el.querySelector('[data-testid="menu-search_result_refine"]')!);
    expect(el.querySelector('.kk-results-form .kk-advanced-search')).not.toBeNull();
    app.dispose();
  });

  it('searches by parts: the picker, the result card, the item page', async () => {
    const { el, app, location } = await render('/browse');
    await click(el.querySelector('[data-testid="browse-parts"]')!);
    expect(location.get()).toBe('/browse/parts');
    expect(el.querySelector('[data-testid="toolbar"] h1')?.textContent).toBe('Parts');
    expect([...el.querySelectorAll('[data-testid^="part-"]')].map((b) => b.textContent)).toEqual(['一']);
    expect(el.querySelector('[data-testid="parts-results"]')).toBeNull();
    await click(el.querySelector('[data-testid="part-一"]')!);
    expect(location.get()).toBe(`/browse/parts?p=${encodeURIComponent('一')}`);
    expect(el.querySelector('[data-testid="part-一"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-testid="parts-count"]')?.textContent).toBe('1 kanji');
    // Few enough left: the bar shows the kanji itself.
    expect(el.querySelector('[data-testid="parts-quick-10"]')?.textContent).toBe('一');
    await click(el.querySelector('[data-testid="result-10"]')!);
    expect(location.get()).toBe('/subject/10');
    app.dispose();
  });

  it('computes the grid sizes', () => {
    expect([320, 360, 375, 411, 768].map(levelColumns)).toEqual([5, 5, 5, 10, 10]);
    expect([200, 240, 320, 375, 411, 768].map(resultSpans)).toEqual([2, 2, 3, 4, 4, 8]);
  });

  it('browses a level: grouped by type, stage on the cards, then the item page', async () => {
    const { el, app, location } = await render('/browse');
    await click(el.querySelector('[data-testid="browse-level-1"]')!);
    expect(location.get()).toMatch(/^\/browse\/results\?t=0&q=1/);
    expect(el.querySelector('[data-testid="num-hits"]')?.textContent).toBe('Level 1: 3 subject(s) found');
    const headers = [...el.querySelectorAll('.kk-result-header-title')].map((h) => h.textContent);
    expect(headers).toEqual(['1 Radical', '1 Kanji', '1 Vocabulary']);
    expect(el.querySelector('[data-testid="result-3"]')).toBeNull();
    // Not started: "Initiate" (the stored stage), never "Locked".
    expect(el.querySelector('[data-testid="result-100"] .kk-card-progress')?.textContent).toBe('Initiate');
    expect(el.querySelector('[data-testid="result-10"]')?.textContent).toBe('一OneいちInitiate');
    // Vocabulary spans the whole row.
    expect(el.querySelector<HTMLElement>('[data-testid="result-100"]')!.parentElement!.style.gridColumn).toMatch(/^span \d$/);
    await click(el.querySelector('[data-testid="result-10"]')!);
    expect(location.get()).toBe('/subject/10');
    app.dispose();
  });

  it('starts a self-study quiz from the results ("Start self-study quiz")', async () => {
    const kanjiOnly = `/browse/results?t=2&q=${encodeURIComponent(JSON.stringify({ ...defaultParameters(), itemTypes: ['WANIKANI_KANJI'] }))}`;
    const { el, app, location } = await render(kanjiOnly);
    await menu(el, 'search_result_self_study');
    expect(location.get()).toBe('/self-study/quiz');
    const session = sessionRuntime(app).get().session!;
    expect(session.type).toBe('SELF_STUDY');
    expect(session.items.map((i) => i.id)).toEqual([10]);
    // While it runs, the menu entry just opens it.
    await act(async () => location.navigate(kanjiOnly));
    await flush();
    await menu(el, 'search_result_self_study');
    expect(location.get()).toBe('/self-study/quiz');
    expect(sessionRuntime(app).get().session!.items.map((i) => i.id)).toEqual([10]);
    app.dispose();
  });

  it('labels the self-study form "Start" without a sort order', async () => {
    const { el, app } = await render('/self-study');
    const form = el.querySelector('.kk-advanced-search')!;
    expect([...form.querySelectorAll('button[type="submit"]')].map((b) => b.textContent)).toEqual(['Start', 'Start']);
    expect(form.textContent).not.toContain('Sort order:');
    // Browse keeps both.
    const browse = await render('/browse');
    const form2 = browse.el.querySelector('.kk-advanced-search')!;
    expect(form2.querySelector('button[type="submit"]')?.textContent).toBe('Search');
    expect(form2.textContent).toContain('Sort order:');
    app.dispose();
    browse.app.dispose();
  });

  it('finds a reading typed in romaji', async () => {
    const { el, app } = await render('/browse');
    await type(el.querySelector('input[aria-label="Query"]')!, 'taberu');
    await click(button(el.querySelector('.kk-browse-query')!, 'Search'));
    expect(el.querySelector('[data-testid="num-hits"]')?.textContent).toBe("'taberu': 1 subject(s) found");
    expect(el.querySelector('[data-testid="result-100"]')).not.toBeNull();
    app.dispose();
  });

  it('saves an advanced search as a preset and runs it from browse', async () => {
    const { el, app, location } = await render('/browse');
    const form = el.querySelector('.kk-advanced-search')!;
    await type(form.querySelector('input[aria-label="Min level"]')!, '2');
    await click(form.querySelector('button[type="submit"]')!);
    expect(el.querySelector('[data-testid="num-hits"]')?.textContent).toBe('Advanced search: 1 subject(s) found');
    await menu(el, 'search_result_save_preset');
    await type(openDialog(el).querySelector('input')!, 'Level two up');
    await click(button(openDialog(el), 'Save'));
    expect(document.querySelector('[data-testid="toast"]')?.textContent).toBe("Preset 'Level two up' saved");

    await act(async () => location.navigate('/browse'));
    await flush();
    expect((el.querySelector('select[aria-label="Search preset"]') as HTMLSelectElement).value).toBe('Level two up');
    await click(button(el.querySelector('.kk-browse-presets')!, 'Search'));
    expect(el.querySelector('[data-testid="toolbar"] h1')?.textContent).toBe('Level two up');
    expect(el.querySelector('[data-testid="result-3"]')).not.toBeNull();

    // Delete it.
    await act(async () => location.navigate('/browse'));
    await flush();
    await click(button(el.querySelector('.kk-browse-presets')!, 'Delete'));
    await click(button(openDialog(el), 'Yes'));
    expect(el.querySelector('select[aria-label="Search preset"]')).toBeNull();
    app.dispose();
  });
});
