/** Fixtures for the session screen tests: synthetic content with answers, an empty content DB, the app. */
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { App } from '../../src/App';
import { createAppController, type AppController } from '../../src/app/appController';
import { manualClock } from '../../src/app/clock';
import { createMemoryLocation, type HashLocation } from '../../src/app/router';
import type { LoadedContent } from '../../src/content/contentFile';
import { makeContent, type ContentSubject, type SubjectObject } from '../../src/core/content';
import { updateProgress } from '../../src/core/progression';
import type { Preferences } from '../../src/core/settings';
import type { Platform } from '../../src/platform';
import { KkDb } from '../../src/storage/db';
import { SCHEMA_SQL } from '../../scripts/content/schema';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { freshName } from '../progress-storage/helpers';
import { setSessionRuntime, SessionRuntime } from '../../src/ui/components/session/runtime';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export const T0 = Date.UTC(2026, 9, 25, 9, 30);
export const HOUR = 3_600_000;

function subj(id: number, object: SubjectObject, level: number, characters: string, meaning: string,
  readings: { reading: string; type?: string }[] = [], components: number[] = []): ContentSubject {
  return {
    id, object, hiddenAt: 0, lessonPosition: id, srsSystemId: 1, level, characters, slug: meaning.toLowerCase(),
    meanings: [{ meaning, primary: true, accepted_answer: true }], auxiliaryMeanings: [],
    readings: readings.map((r, i) => ({ reading: r.reading, primary: i === 0, accepted_answer: true, type: r.type ?? null })),
    componentSubjectIds: components, amalgamationSubjectIds: [], visuallySimilarSubjectIds: [], partsOfSpeech: [],
    frequency: 0, joyoGrade: 0, jlptLevel: 0,
  };
}

/** Level 1: radicals 1 一 Ground, 2 丨 Stick; kanji 10 二 Two (に); vocabulary 100 二つ Two Things (ふたつ). */
export function testSubjects(): ContentSubject[] {
  return [
    subj(1, 'radical', 1, '一', 'Ground'),
    subj(2, 'radical', 1, '丨', 'Stick'),
    subj(10, 'kanji', 1, '二', 'Two', [{ reading: 'に', type: 'onyomi' }], [1]),
    subj(100, 'vocabulary', 1, '二つ', 'Two Things', [{ reading: 'ふたつ' }], [10]),
  ];
}

/** The answers by characters: [meaning, reading]. */
export const ANSWERS: Record<string, [string, string | null]> = {
  一: ['ground', null], 丨: ['stick', null], 二: ['two', 'ni'], 二つ: ['two things', 'futatsu'],
};

let dbPromise: Promise<LoadedContent['db']> | undefined;
async function emptyContentDb(): Promise<LoadedContent['db']> {
  const require = createRequire(`${process.cwd()}/package.json`);
  dbPromise ??= initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) }).then((SQL) => {
    const db = new SQL.Database();
    db.exec(SCHEMA_SQL);
    db.exec(`CREATE TABLE kanji_part (literal TEXT, glyph TEXT, role TEXT, name TEXT, ordinal INTEGER);
      CREATE TABLE kanji_sound (literal TEXT, phonetic TEXT, series_reading TEXT, series_id INTEGER, actual_reading TEXT, match TEXT);
      CREATE TABLE series (id INTEGER, reliability TEXT, core_members TEXT);
      CREATE TABLE series_member (series_id INTEGER, literal TEXT, reading TEXT, match TEXT);`);
    return db;
  });
  return dbPromise;
}

export async function testContent(): Promise<LoadedContent> {
  const content = makeContent(testSubjects(), []);
  return { manifest: null, db: await emptyContentDb(), content, wkOrder: new Map(), jlptOrder: new Map(), jlptBlocks: [], jlptKanji: new Map([['二', 5]]) };
}

export function testPlatform(): Platform & { scheduled: unknown[]; backups: string[]; haptic: string[] } {
  const scheduled: unknown[] = [];
  const backups: string[] = [];
  const haptic: string[] = [];
  return {
    name: 'android',
    capabilities: {
      notifications: true, audio: false, audioPlayback: false, audioDownload: false, haptics: true, backgroundSync: false,
      widget: false, cleartextHttp: false, legacyMigration: false, autoBackup: true,
    },
    storage: { persist: vi.fn(async () => true), persisted: vi.fn(async () => true), estimate: vi.fn(async () => null) },
    notifications: {
      supported: true, permission: vi.fn(async () => 'granted'), requestPermission: vi.fn(async () => true),
      scheduleReviews: vi.fn(async (times: unknown[]) => { scheduled.push(times); return times.length; }),
      cancelAll: vi.fn(async () => undefined), schedule: vi.fn(async () => undefined),
    },
    audio: { supported: false, setCatalog: vi.fn(), play: vi.fn(async () => false), download: vi.fn(), status: vi.fn(), deleteAll: vi.fn() },
    haptics: { supported: true, feedback: (k: string) => { haptic.push(k); } },
    lifecycle: { onResume: () => () => undefined, onPause: () => () => undefined },
    files: {
      saveText: vi.fn(async () => 'saved' as const), openText: vi.fn(async () => null),
      writeAutoBackup: vi.fn(async (text: string) => { backups.push(text); return { name: 'b.json', at: T0 }; }),
    },
    scheduled, backups, haptic,
  } as unknown as Platform & { scheduled: unknown[]; backups: string[]; haptic: string[] };
}

export interface Rendered {
  app: AppController;
  el: HTMLElement;
  location: HashLocation;
  clock: ReturnType<typeof manualClock>;
  platform: ReturnType<typeof testPlatform>;
  dbName: string;
  unmount(): void;
}

const roots: { root: Root; el: HTMLElement; app: AppController }[] = [];

export function cleanup(): void {
  for (const r of roots.splice(0)) {
    act(() => r.root.unmount());
    r.el.remove();
    r.app.dispose();
  }
}

/**
 * A started app at `path` with `prefs` and the progress `setup` writes; the session runtime gets a fixed seed.
 * `dbName` reopens an earlier database (a reload).
 */
export async function renderApp(path: string, opts: {
  prefs?: Preferences;
  setup?: Parameters<AppController['write']>[0];
  dbName?: string;
  at?: number;
} = {}): Promise<Rendered> {
  const dbName = opts.dbName ?? freshName();
  const clock = manualClock(opts.at ?? T0);
  const platform = testPlatform();
  const content = await testContent();
  const app = createAppController({ db: new KkDb(dbName), platform, loadContent: async () => content, clock, tickMs: null });
  await app.start();
  for (const [k, v] of Object.entries(opts.prefs ?? {})) await app.setPreference(k, v);
  if (opts.setup) await app.write(opts.setup);
  setSessionRuntime(app, new SessionRuntime(app, { seed: () => 42, random: () => 0.5 }));
  const el = document.createElement('div');
  document.body.append(el);
  const location = createMemoryLocation(path);
  const root = createRoot(el);
  roots.push({ root, el, app });
  await act(async () => {
    root.render(<App app={app} location={location} />);
  });
  await settle();
  return {
    app, el, location, clock, platform, dbName,
    unmount: () => {
      const i = roots.findIndex((r) => r.el === el);
      if (i >= 0) {
        const [r] = roots.splice(i, 1);
        act(() => r!.root.unmount());
        r!.el.remove();
        r!.app.dispose();
      }
    },
  };
}

/** Lets the pending promises (writes, Dexie, effects) run. */
export async function settle(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

export async function waitFor<T>(f: () => T | null | undefined | false, what = 'condition'): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const v = f();
    if (v) return v;
    await settle(1);
  }
  throw new Error(`timed out waiting for ${what}`);
}

export const q = (el: HTMLElement, testId: string): HTMLElement | null => el.querySelector(`[data-testid="${testId}"]`);

export async function click(el: HTMLElement | null): Promise<void> {
  if (el === null) throw new Error('no element to click');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await settle();
}

/** Types `text` one character at a time (each an `input` event outside composition), like a hardware keyboard. */
export async function typeText(el: HTMLElement, text: string): Promise<void> {
  const input = el.querySelector<HTMLInputElement>('input.kk-answer');
  if (input === null) throw new Error('no answer field');
  for (const c of text) {
    await act(async () => {
      input.value += c;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: c, inputType: 'insertText' }));
    });
  }
}

export function field(el: HTMLElement): HTMLInputElement {
  const input = el.querySelector<HTMLInputElement>('input.kk-answer');
  if (input === null) throw new Error('no answer field');
  return input;
}

/** The current question: its characters and whether it asks the reading. */
export function currentQuestion(el: HTMLElement): { chars: string; reading: boolean } {
  return { chars: q(el, 'question-text')?.textContent ?? '', reading: q(el, 'question-type')?.classList.contains('reading') ?? false };
}

export function rightAnswer(el: HTMLElement): string {
  const { chars, reading } = currentQuestion(el);
  const a = ANSWERS[chars];
  if (a === undefined) throw new Error(`unknown question ${chars}`);
  return reading ? a[1]! : a[0];
}

/** Started lessons for these subjects, due now. */
export function dueReviews(ids: number[]): Parameters<AppController['write']>[0] {
  return (ldb, now) => {
    for (const id of ids) {
      updateProgress(ldb, id, { unlockedAt: now - 10 * HOUR, startedAt: now - 10 * HOUR, srsStage: 1, availableAt: now - HOUR });
    }
  };
}
