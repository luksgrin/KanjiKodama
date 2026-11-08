/**
 * Golden test harness: replays the Java app's fixtures (app/test/golden/, see README.md there)
 * against the TypeScript port.
 *
 * A module registers adapters in its own `test/golden/<area>.golden.test.ts`:
 *
 *   goldenSuite<OsaInput, number>('answers/osa.json', (input) => osaDistance(input.a, input.b));
 *
 * Each matching fixture file is one Vitest test that runs every case and reports the failures
 * (case name, path of the first difference, expected vs actual), at most `maxReported` per file
 * with the full counts. Known differences go in `exceptions.json`; an exception that is not needed
 * (its case passes or does not exist) fails the file too. Every run writes a summary per file to
 * `test/golden-results/` for `node test/golden/coverage.mjs`.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, it } from 'vitest';
import type { Database } from 'sql.js';
import type { Content } from '../../src/core/content';
import { NO_CONTENT_DB_MESSAGE, contentDb, hasContentDb, loadContent } from './content';

export const GOLDEN_DIR = fileURLToPath(new URL('.', import.meta.url));
export const RESULTS_DIR = fileURLToPath(new URL('../golden-results/', import.meta.url));
// Files under test/golden that hold no cases: the manifest, the exceptions list, and inputs
// (the owner's phone export and the progress files the TS core wrote, progress/ts-export/).
const NOT_FIXTURES = new Set(['manifest.json', 'exceptions.json', 'progress/android-export.json']);
const INPUT_DIRS = ['progress/ts-export/'];

export interface GoldenCase<I = unknown, O = unknown> {
  name: string;
  input: I;
  output: O;
}

export interface FixtureHeader {
  area: string;
  javaSource?: string;
  description?: string;
}

/** What an adapter gets besides the input. `state` is fresh per file (for stateful replays such as scenarios). */
export interface GoldenContext {
  /** Fixture path relative to test/golden, e.g. `answers/osa.json`. */
  file: string;
  header: FixtureHeader;
  state: Record<string, unknown>;
  /** Set when the suite was registered with `needsContent: true`. */
  content: Content;
  db: Database;
}

export interface GoldenOptions<I, O> {
  /** Skip (with a message) when the private content DB is absent; provides `ctx.content`/`ctx.db`. */
  needsContent?: boolean;
  /** Custom comparison: return null when equal, otherwise a description of the difference. */
  compare?: (actual: unknown, expected: O, c: GoldenCase<I, O>, ctx: GoldenContext) => string | null;
  /** Run only some cases (the others count as skipped in the coverage report). */
  filter?: (c: GoldenCase<I, O>) => boolean;
  /** Failures printed per file (default 20); all are counted. */
  maxReported?: number;
  /** Per-file timeout in ms (default 10 minutes). */
  timeout?: number;
}

export type Adapter<I, O> = (input: I, c: GoldenCase<I, O>, ctx: GoldenContext) => unknown;

/** Fixture files (relative to test/golden, `/`-separated, sorted). */
export function listFixtures(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.jsonl?$/.test(name)) out.push(relative(GOLDEN_DIR, p).split(sep).join('/'));
    }
  };
  walk(GOLDEN_DIR.replace(/\/$/, ''));
  return out.filter((f) => !NOT_FIXTURES.has(f) && !INPUT_DIRS.some((d) => f.startsWith(d)));
}

/** `*` matches within a path segment, `**` across segments, `?` one character. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i] as string;
    if (ch === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
      if (glob[i + 1] === '/') i++;
    } else if (ch === '*') re += '[^/]*';
    else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export function matchFixtures(glob: string): string[] {
  const re = globToRegExp(glob);
  return listFixtures().filter((f) => re.test(f));
}

/** Reads a fixture: header plus cases (a `.json` document's `cases`, or a `.jsonl` file's lines, parsed lazily). */
export function readFixture<I = unknown, O = unknown>(file: string): { header: FixtureHeader; cases: Iterable<GoldenCase<I, O>> } {
  const text = readFileSync(join(GOLDEN_DIR, file), 'utf8');
  if (file.endsWith('.jsonl')) {
    const firstEnd = text.indexOf('\n');
    const header = JSON.parse(text.slice(0, firstEnd)) as FixtureHeader;
    const cases = {
      *[Symbol.iterator](): Iterator<GoldenCase<I, O>> {
        let start = firstEnd + 1;
        while (start < text.length) {
          let end = text.indexOf('\n', start);
          if (end < 0) end = text.length;
          if (end > start) yield JSON.parse(text.slice(start, end)) as GoldenCase<I, O>;
          start = end + 1;
        }
      },
    };
    return { header, cases };
  }
  const doc = JSON.parse(text) as FixtureHeader & { cases?: GoldenCase<I, O>[]; steps?: GoldenCase<I, O>[] };
  const { cases, steps, ...header } = doc;
  const list = cases ?? steps;
  if (!list) throw new Error(`${file}: neither "cases" nor "steps"`);
  return { header, cases: list };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function show(v: unknown): string {
  if (v === undefined) return 'undefined (missing)';
  const s = JSON.stringify(v, (_k, x: unknown) => (typeof x === 'bigint' ? `${x}n` : x));
  return s.length > 300 ? `${s.slice(0, 300)}…` : s;
}

/**
 * The first difference between `actual` and `expected` (JSON semantics: object key order is
 * ignored, a key whose value is `undefined` counts as missing, numbers compare by value), or null.
 */
export function firstDifference(actual: unknown, expected: unknown, path = '$'): string | null {
  if (actual === expected) return null;
  if (typeof expected === 'number' && typeof actual === 'number') {
    return Number.isNaN(expected) && Number.isNaN(actual) ? null : `${path}: expected ${show(expected)}, got ${show(actual)}`;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `${path}: expected array ${show(expected)}, got ${show(actual)}`;
    const n = Math.min(actual.length, expected.length);
    for (let i = 0; i < n; i++) {
      const d = firstDifference(actual[i], expected[i], `${path}[${i}]`);
      if (d) return d;
    }
    if (actual.length !== expected.length) {
      return `${path}: expected length ${expected.length}, got ${actual.length}` +
        (actual.length > expected.length ? `, extra ${show(actual[n])}` : `, missing ${show(expected[n])}`);
    }
    return null;
  }
  if (isObject(expected)) {
    if (!isObject(actual)) return `${path}: expected object ${show(expected)}, got ${show(actual)}`;
    for (const k of Object.keys(expected)) {
      const d = firstDifference(actual[k], expected[k], `${path}.${k}`);
      if (d) return d;
    }
    for (const k of Object.keys(actual)) {
      if (!(k in expected) && actual[k] !== undefined) return `${path}.${k}: unexpected key, got ${show(actual[k])}`;
    }
    return null;
  }
  return `${path}: expected ${show(expected)}, got ${show(actual)}`;
}

/** exceptions.json: `{ "<fixture file>": { "<case name>": "<reason>" } }`. */
type Exceptions = Record<string, Record<string, string>>;
let exceptionsCache: Exceptions | undefined;
export function exceptionsFor(file: string): Record<string, string> {
  exceptionsCache ??= JSON.parse(readFileSync(join(GOLDEN_DIR, 'exceptions.json'), 'utf8')) as Exceptions;
  return exceptionsCache[file] ?? {};
}

export interface FileResult {
  file: string;
  area: string;
  total: number;
  passed: number;
  failed: number;
  excepted: number;
  skipped: number;
  at: string;
}

function writeResult(r: FileResult): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(join(RESULTS_DIR, `${r.file.replace(/\//g, '__')}.json`), `${JSON.stringify(r, null, 2)}\n`);
}

/** Runs every case of one fixture file through `adapter`; throws a readable report if any fails. */
export async function runFixture<I, O>(file: string, adapter: Adapter<I, O>, options: GoldenOptions<I, O> = {},
  extra: Partial<Pick<GoldenContext, 'content' | 'db'>> = {}): Promise<FileResult> {
  const { header, cases } = readFixture<I, O>(file);
  const ctx = { file, header, state: {}, ...extra } as GoldenContext;
  const exceptions = exceptionsFor(file);
  const usedExceptions = new Set<string>();
  const maxReported = options.maxReported ?? 20;
  const failures: string[] = [];
  const seen = new Set<string>();
  const r: FileResult = { file, area: header.area, total: 0, passed: 0, failed: 0, excepted: 0, skipped: 0, at: new Date().toISOString() };

  for (const c of cases) {
    r.total++;
    seen.add(c.name);
    if (options.filter && !options.filter(c)) {
      r.skipped++;
      continue;
    }
    let diff: string | null;
    try {
      let actual = adapter(c.input, c, ctx);
      if (actual instanceof Promise) actual = await actual;
      diff = options.compare ? options.compare(actual, c.output, c, ctx) : firstDifference(actual, c.output);
    } catch (e) {
      diff = `threw ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`;
    }
    if (diff === null) {
      r.passed++;
      if (c.name in exceptions) failures.push(`${c.name}: listed in exceptions.json but passes (remove it)`);
    } else if (c.name in exceptions) {
      r.excepted++;
      usedExceptions.add(c.name);
    } else {
      r.failed++;
      if (failures.length < maxReported) failures.push(`${c.name}: ${diff}`);
    }
  }
  for (const name of Object.keys(exceptions)) {
    if (!seen.has(name)) failures.push(`${name}: listed in exceptions.json but no such case`);
  }
  writeResult(r);
  if (failures.length > 0) {
    const counts = `${r.failed} of ${r.total} cases failed` + (r.excepted ? `, ${r.excepted} excepted` : '') +
      (r.skipped ? `, ${r.skipped} skipped` : '');
    const more = r.failed > maxReported ? `\n  … and ${r.failed - maxReported} more failures` : '';
    throw new Error(`${file} (${header.area}): ${counts}\n  ${failures.join('\n  ')}${more}`);
  }
  return r;
}

/**
 * Registers one Vitest test per fixture file matching `glob` (relative to test/golden). A glob
 * that matches no file fails, so typos don't pass silently.
 */
export function goldenSuite<I = unknown, O = unknown>(glob: string, adapter: Adapter<I, O>,
  options: GoldenOptions<I, O> = {}): void {
  const files = matchFixtures(glob);
  describe(`golden ${glob}`, () => {
    if (files.length === 0) {
      it('matches fixture files', () => {
        throw new Error(`no fixture matches ${glob}`);
      });
      return;
    }
    if (options.needsContent && !hasContentDb()) {
      it.skip(NO_CONTENT_DB_MESSAGE, () => {});
      return;
    }
    const extra: Partial<Pick<GoldenContext, 'content' | 'db'>> = {};
    if (options.needsContent) {
      beforeAll(async () => {
        extra.db = await contentDb();
        extra.content = await loadContent();
      }, 120_000);
    }
    for (const file of files) {
      it(file, async () => {
        await runFixture(file, adapter, options, extra);
      }, options.timeout ?? 600_000);
    }
  });
}
