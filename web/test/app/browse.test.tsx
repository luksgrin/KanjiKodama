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
  // jsdom: no file: import.meta.url, so load the wasm from the package (cwd is web/).
  const SQL = await initSqlJs({ wasmBinary: readFileSync(join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')) as unknown as ArrayBuffer });
  db = new SQL.Database();
  db.run(SCHEMA_SQL);
  // The Parts and sound tables the kanji page reads (empty).
  db.run(`CREATE TABLE kanji_part (literal TEXT, ordinal INTEGER, glyph TEXT, role TEXT, name TEXT);
    CREATE TABLE kanji_sound (literal TEXT, phonetic TEXT, series_reading TEXT, series_id INTEGER, actual_reading TEXT, match TEXT);
    CREATE TABLE series (id INTEGER, reliability TEXT, core_members TEXT);
    CREATE TABLE series_member (series_id INTEGER, literal TEXT, reading TEXT, match TEXT);`);
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

  it('resurrects and burns again, with the Java columns in the exported progress', async () => {
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
    // Tapping the current rating clears it (StarRatingView).
    await click(again.el.querySelector('button[aria-label="3 stars"]')!);
    expect(again.el.querySelector('button[aria-label="1 star"]')?.getAttribute('aria-pressed')).toBe('false');
    again.app.dispose();
  });
});

describe('browse and search', () => {
  it('browses a level: grouped by type, stage on the cards, then the item page', async () => {
    const { el, app, location } = await render('/browse');
    await click(el.querySelector('[data-testid="browse-level-1"]')!);
    expect(location.get()).toMatch(/^\/browse\/results\?t=0&q=1/);
    expect(el.querySelector('[data-testid="num-hits"]')?.textContent).toBe('Level 1: 3 subject(s) found');
    const headers = [...el.querySelectorAll('.kk-result-header-title')].map((h) => h.textContent);
    expect(headers).toEqual(['1 Radical', '1 Kanji', '1 Vocabulary']);
    expect(el.querySelector('[data-testid="result-3"]')).toBeNull();
    // Type filter.
    await click(button(el, 'Kanji'));
    expect(el.querySelector('[data-testid="num-hits"]')?.textContent).toBe('Level 1: 1 subject(s) found');
    await click(el.querySelector('[data-testid="result-10"]')!);
    expect(location.get()).toBe('/subject/10');
    app.dispose();
  });

  it('starts a self-study quiz from the results (Java\'s "Start self-study quiz")', async () => {
    const { el, app, location } = await render('/browse/results?t=0&q=1');
    await click(button(el, 'Kanji'));
    await click(el.querySelector('[data-testid="start-self-study"]')!);
    expect(location.get()).toBe('/self-study/quiz');
    const session = sessionRuntime(app).get().session!;
    expect(session.type).toBe('SELF_STUDY');
    expect(session.items.map((i) => i.id)).toEqual([10]);
    // While it runs, the menu entry just opens it.
    await act(async () => location.navigate('/browse/results?t=0&q=1'));
    await flush();
    await click(el.querySelector('[data-testid="start-self-study"]')!);
    expect(location.get()).toBe('/self-study/quiz');
    expect(sessionRuntime(app).get().session!.items.map((i) => i.id)).toEqual([10]);
    app.dispose();
  });

  it('labels the self-study form "Start" without a sort order, as SelfStudyStartActivity does', async () => {
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
    await click(button(el, 'Save preset'));
    await type(openDialog(el).querySelector('input')!, 'Level two up');
    await click(button(openDialog(el), 'Save'));
    expect(el.textContent).toContain("Preset 'Level two up' saved");

    await act(async () => location.navigate('/browse'));
    await flush();
    expect((el.querySelector('select[aria-label="Search preset"]') as HTMLSelectElement).value).toBe('Level two up');
    await click(button(el.querySelector('.kk-browse-presets')!, 'Search'));
    expect(el.querySelector('.kk-search-results h2')?.textContent).toBe('Level two up');
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
