/**
 * `progress/ts-roundtrip.json`: progress files the core wrote (`progress/ts-export/`, see
 * progress-ts-inputs.ts), restored and exported again (the reference re-export). It must equal the
 * core's own restore + export of the same file semantically: same keys, same value types (integral
 * number, non-integral number, string, boolean, array, object) and values; key order and the order of
 * id'd rows (subjects in SQLite rowid order) are ignored. `differences` (reference export vs. input)
 * and `textIdentical` must also match.
 */

import { JSONArray, JSONObject, TypedNumber, parseJsonObject, type JsonValue } from '../../src/core/progressFile/androidJson';
import { createLearnerDb, exportFromDb, restoreIntoDb } from '../../src/core/progression';
import { loadContentWithExtras } from './content';
import { firstDifference, goldenSuite } from './harness';
import { T0, loadJlptKanji, readGoldenInput, type RunnerResources } from './scenario/runner';

interface Input {
  file: string;
  clockMs: number;
  from: string;
}

interface Output {
  export: string;
  differences: unknown[];
  textIdentical: boolean;
}

let resources: Promise<RunnerResources> | undefined;

function loadResources(): Promise<RunnerResources> {
  resources ??= loadContentWithExtras().then((content) => ({ content, jlptKanji: loadJlptKanji() }));
  return resources;
}

/** An empty WaniKani-order progress file. */
const EMPTY_FILE = JSON.stringify({
  format: 'kanjikodama-progress', version: 1, exportedAt: T0, userLevel: 1, levelProgression: [], subjects: [],
  curriculum: 'WANIKANI', probation: [], jumps: [],
});

/** An org.json value; JSONArray slots may hold null. */
type Json = JsonValue | null | undefined;

/** Every semantic difference between two org.json trees (paths like the reference diff's). */
function semanticDifferences(a: Json, b: Json, path: string, out: string[]): void {
  const kind = (v: Json): string => {
    if (v === undefined) return 'missing';
    if (v === null) return 'null';
    if (v instanceof TypedNumber) return v.type === 'Double' ? 'double' : 'integral';
    if (v instanceof JSONObject) return 'object';
    if (v instanceof JSONArray) return 'array';
    return typeof v === 'symbol' ? 'null' : typeof v;
  };
  const ka = kind(a);
  const kb = kind(b);
  if (ka !== kb) {
    out.push(`${path}: ${ka} vs ${kb}`);
    return;
  }
  if (a instanceof JSONObject && b instanceof JSONObject) {
    for (const k of [...new Set([...a.map.keys(), ...b.map.keys()])].sort()) {
      semanticDifferences(a.map.get(k), b.map.get(k), `${path}/${k}`, out);
    }
    return;
  }
  if (a instanceof JSONArray && b instanceof JSONArray) {
    const byId = (xs: Json[]): Map<string, Json> | null => {
      const m = new Map<string, Json>();
      for (const x of xs) {
        const id = x instanceof JSONObject ? x.map.get('id') : undefined;
        if (!(id instanceof TypedNumber)) return null;
        m.set(String(id.value), x);
      }
      return m;
    };
    const ma = a.values.length > 0 || b.values.length > 0 ? byId(a.values) : null;
    const mb = ma ? byId(b.values) : null;
    if (ma && mb) {
      for (const id of new Set([...ma.keys(), ...mb.keys()])) semanticDifferences(ma.get(id), mb.get(id), `${path}[id=${id}]`, out);
      return;
    }
    for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
      semanticDifferences(a.values[i], b.values[i], `${path}[${i}]`, out);
    }
    return;
  }
  if (a instanceof TypedNumber && b instanceof TypedNumber) {
    const same = a.type === 'Double' ? a.doubleValue() === b.doubleValue() : a.longValue() === b.longValue();
    if (!same) out.push(`${path}: ${String(a.value)} vs ${String(b.value)}`);
    return;
  }
  if (a !== b) out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}

type Plain = null | boolean | number | string | Plain[] | { [k: string]: Plain };

/** Arrays of objects with an "id" matched by id (plus an order check), others by index. */
function fieldDiff(path: string, a: Plain | undefined, b: Plain | undefined, out: unknown[]): void {
  const type = (v: Plain | undefined): string => (v === undefined ? 'missing' : v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  if (a === undefined || b === undefined || type(a) !== type(b)) {
    if (!(a === undefined && b === undefined)) out.push({ path, input: a ?? null, output: b ?? null });
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const hasId = (v: Plain | undefined): boolean => typeof v === 'object' && v !== null && !Array.isArray(v) && 'id' in v;
    if ((a.length > 0 && hasId(a[0])) || (b.length > 0 && hasId(b[0]))) {
      const ids = (xs: Plain[]): number[] => xs.map((x) => (x as Record<string, number>).id!);
      const [oa, ob] = [ids(a), ids(b)];
      const ma = new Map(a.map((x, i) => [oa[i]!, x]));
      const mb = new Map(b.map((x, i) => [ob[i]!, x]));
      const sameKeys = ma.size === mb.size && [...ma.keys()].every((k) => mb.has(k));
      if (oa.length === ob.length && sameKeys && oa.some((x, i) => x !== ob[i])) out.push({ path, orderDiffers: true });
      for (const id of [...new Set([...ma.keys(), ...mb.keys()])].sort((x, y) => x - y)) {
        fieldDiff(`${path}[id=${id}]`, ma.get(id), mb.get(id), out);
      }
    } else {
      for (let i = 0; i < Math.max(a.length, b.length); i++) fieldDiff(`${path}[${i}]`, a[i], b[i], out);
    }
    return;
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const ra = a as Record<string, Plain>;
    const rb = b as Record<string, Plain>;
    for (const k of [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()) fieldDiff(`${path}/${k}`, ra[k], rb[k], out);
    return;
  }
  if (a !== b) out.push({ path, input: a, output: b });
}

goldenSuite<Input, Output>(
  'progress/ts-roundtrip.json',
  async (input) => {
    const res = await loadResources();
    const text = readGoldenInput(input.file);
    // The base reset (seed 1), then the clock pinned to the file's exportedAt.
    const db = createLearnerDb(res.content, res.jlptKanji);
    restoreIntoDb(db, EMPTY_FILE, T0);
    restoreIntoDb(db, text, input.clockMs);
    const exported = exportFromDb(db, input.clockMs);
    const differences: unknown[] = [];
    fieldDiff('', JSON.parse(text) as Plain, JSON.parse(exported) as Plain, differences);
    return { export: exported, differences, textIdentical: exported === text };
  },
  {
    needsContent: true,
    compare: (actual, expected) => {
      const a = actual as Output;
      const out: string[] = [];
      semanticDifferences(parseJsonObject(expected.export), parseJsonObject(a.export), '', out);
      if (out.length > 0) return `reference export vs core export: ${out.length} differences, first: ${out.slice(0, 5).join('; ')}`;
      return firstDifference(a.differences, expected.differences, '$.differences')
        ?? firstDifference(a.textIdentical, expected.textIdentical, '$.textIdentical');
    },
  },
);
