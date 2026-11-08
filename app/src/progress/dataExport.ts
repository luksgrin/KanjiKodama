/**
 * "Data import / export": the search presets and the star ratings, which are not in the progress
 * file, as JSON files (unknown properties ignored on import):
 *
 * - `search_presets.json`: `SearchPresetExport` `{"namedPresets":[{"name","type","data"}…],"selfStudyPreset":{…}|null}`
 *   (the self-study default is the preset named `"\u0000SELF_STUDY_DEFAULT"`);
 * - `star_ratings.json`: `StarRatingsExport` `{"stars1":[ids],…,"stars5":[ids]}`.
 *
 * Imports add to or overwrite what is there and never remove anything (the screen says so).
 * Pure: the screen reads and writes the stores.
 */

export const SEARCH_PRESETS_FILE = 'search_presets.json';
export const STAR_RATINGS_FILE = 'star_ratings.json';
/** The internal preset holding the self-study form. */
export const SELF_STUDY_PRESET_NAME = '\u0000SELF_STUDY_DEFAULT';

export interface PresetData {
  name: string;
  type: number;
  data: string;
}

/** An import file Jackson would not read (the screen shows "Import failed"). */
export class DataImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataImportError';
  }
}

const preset = (p: PresetData): PresetData => ({ name: p.name, type: p.type, data: p.data });

/** `exportSearchPresets`: the named presets (by name) and the self-study default. */
export function searchPresetsExportText(presets: readonly PresetData[]): string {
  const named = presets.filter((p) => !p.name.startsWith('\u0000')).map(preset);
  const self = presets.find((p) => p.name === SELF_STUDY_PRESET_NAME);
  return JSON.stringify({ namedPresets: named, selfStudyPreset: self ? preset(self) : null });
}

function parseObject(text: string): Record<string, unknown> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new DataImportError(e instanceof Error ? e.message : String(e));
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new DataImportError('not a JSON object');
  return json as Record<string, unknown>;
}

/** Jackson's `SearchPreset`: missing fields keep the defaults ("", 0, ""); a wrong type fails. */
function readPreset(v: unknown): PresetData {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new DataImportError('bad preset');
  const o = v as Record<string, unknown>;
  const name = o.name ?? '';
  const type = o.type ?? 0;
  const data = o.data ?? '';
  // Jackson coerces scalars to String and numeric strings to int.
  const str = (x: unknown): string => {
    if (typeof x === 'string') return x;
    if (typeof x === 'number' || typeof x === 'boolean') return String(x);
    throw new DataImportError('bad preset field');
  };
  let t: number;
  if (typeof type === 'number' && Number.isInteger(type)) t = type;
  else if (typeof type === 'string' && /^[+-]?\d+$/.test(type.trim())) t = Number(type.trim());
  else throw new DataImportError('bad preset type');
  return { name: str(name), type: t, data: str(data) };
}

/** `importSearchPresetsResult`: the presets to save (`setPreset` each, in file order). */
export function parseSearchPresetsImport(text: string): PresetData[] {
  const o = parseObject(text);
  const named = o.namedPresets === undefined ? [] : o.namedPresets;
  // The named presets: an explicit null is a NullPointerException.
  if (!Array.isArray(named)) throw new DataImportError('namedPresets is not a list');
  const out = named.map(readPreset);
  if (o.selfStudyPreset !== undefined && o.selfStudyPreset !== null) out.push(readPreset(o.selfStudyPreset));
  return out;
}

/** `exportStarRatings`: the subject ids per star count, ascending (`getStarredSubjectIds`). */
export function starRatingsExportText(ratings: ReadonlyMap<number, number>): string {
  const lists: number[][] = [[], [], [], [], []];
  for (const [id, n] of ratings) if (n >= 1 && n <= 5) lists[n - 1]!.push(id);
  for (const l of lists) l.sort((a, b) => a - b);
  return JSON.stringify({ stars1: lists[0], stars2: lists[1], stars3: lists[2], stars4: lists[3], stars5: lists[4] });
}

/** `[stars, ids]` from 1 to 5 stars, so a later list wins. */
export function parseStarRatingsImport(text: string): [stars: number, ids: number[]][] {
  const o = parseObject(text);
  const out: [number, number[]][] = [];
  for (let n = 1; n <= 5; n++) {
    const v = o[`stars${n}`];
    if (v === undefined) {
      out.push([n, []]);
      continue;
    }
    if (!Array.isArray(v)) throw new DataImportError(`stars${n} is not a list`);
    out.push([n, v.map((id) => {
      const x = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id;
      if (typeof x !== 'number' || !Number.isSafeInteger(x)) throw new DataImportError('bad subject id');
      return x;
    })]);
  }
  return out;
}
