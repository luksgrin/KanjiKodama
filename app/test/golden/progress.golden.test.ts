import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TypedError, optLong, parseJsonObject } from '../../src/core/progressFile/androidJson';
import { describe as describeFile } from '../../src/core/progressFile/describe';
import { exportProgress, restoreProgress } from '../../src/core/progressFile/store';
import { GOLDEN_DIR, goldenSuite } from './harness';

/** The fixtures were made with `Locale.US` and time zone UTC. */
const STYLE = { locale: 'en-US', timeZone: 'UTC' } as const;

const readGolden = (file: string): string => readFileSync(join(GOLDEN_DIR, file), 'utf8');

type DescribeInput = { text: string } | { file: string };

goldenSuite<DescribeInput, unknown>('progress/describe.json', (input) => {
  const text = 'text' in input ? input.text : readGolden(input.file);
  let exportedAt: number | null;
  try {
    exportedAt = Number(optLong(parseJsonObject(text), 'exportedAt'));
  } catch {
    exportedAt = null;
  }
  try {
    return { ok: true, summary: describeFile(text, STYLE), exportedAt };
  } catch (e) {
    if (!(e instanceof TypedError)) throw e;
    return { ok: false, error: e.errorType, message: e.message, exportedAt };
  }
});

type RoundTripInput = { file: string; clockMs: number; from: string } | { of: string; clockMs: number };

/** Every JSON difference between two exports (arrays of objects with an `id` matched by id). */
function differences(a: unknown, b: unknown, path = ''): string[] {
  if (Array.isArray(a) && Array.isArray(b)) {
    const byId = (xs: unknown[]): Map<unknown, unknown> | null =>
      xs.every((x) => typeof x === 'object' && x !== null && 'id' in x) ? new Map(xs.map((x) => [(x as { id: unknown }).id, x])) : null;
    const ma = byId(a);
    const mb = byId(b);
    if (ma && mb) {
      const out: string[] = [];
      for (const k of new Set([...ma.keys(), ...mb.keys()])) out.push(...differences(ma.get(k), mb.get(k), `${path}[id=${String(k)}]`));
      return out;
    }
    const out: string[] = a.length === b.length ? [] : [`${path}: length ${a.length} vs ${b.length}`];
    for (let i = 0; i < Math.min(a.length, b.length); i++) out.push(...differences(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out: string[] = [];
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) out.push(...differences(ra[k], rb[k], `${path}.${k}`));
    return out;
  }
  return a === b ? [] : [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
}

goldenSuite<RoundTripInput, unknown>(
  'progress/android-roundtrip.json',
  (input, _c, ctx) => {
    const state = ctx.state as { text?: string };
    const source = 'file' in input ? readGolden(input.file) : state.text;
    if (source === undefined) throw new Error('no previous round');
    const knownIds = new Set(ctx.content!.subjects.map((s) => s.id));
    // From the empty base state, restore, then export with the clock pinned.
    const restored = restoreProgress(source, knownIds, STYLE);
    const text = exportProgress(restored, input.clockMs);
    state.text = text;
    return {
      differences: differences(JSON.parse(text), JSON.parse(source)),
      textIdentical: text === source,
    };
  },
  { needsContent: true },
);
