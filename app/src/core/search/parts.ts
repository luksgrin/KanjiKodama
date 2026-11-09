/**
 * Search by parts (the radical picker): the parts of RADKFILE with their stroke counts and the kanji
 * that contain each one. Picking parts narrows the kanji down to those containing all of them; parts
 * that no longer occur in any of those kanji can't lead to a match.
 */

/** One part: as drawn, its stroke count and the kanji containing it (one string, each kanji once). */
export interface PartEntry {
  glyph: string;
  strokes: number;
  kanji: string;
}

/** The parts of one stroke count, in RADKFILE order. */
export interface PartGroup {
  strokes: number;
  parts: string[];
}

export interface PartIndex {
  /** Parts with at least one kanji, in RADKFILE order. */
  readonly entries: readonly PartEntry[];
  /** Part → the kanji containing it. */
  readonly kanjiOf: ReadonlyMap<string, ReadonlySet<string>>;
  /** Kanji → its parts. */
  readonly partsOf: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface PartSearch {
  /** The kanji containing every selected part, in RADKFILE order (none without a selection; callers sort). */
  kanji: string[];
  /** Parts that still lead to a match together with the selection (the selected ones included). */
  available: ReadonlySet<string>;
}

/**
 * `radicals.tsv` (`content/inputs/`): `#` comments, then `part<TAB>strokes<TAB>kanji` per line.
 * Throws on a malformed line.
 */
export function parseRadicalsTsv(text: string): PartEntry[] {
  const out: PartEntry[] = [];
  for (const [i, line] of text.split('\n').entries()) {
    if (line === '' || line.startsWith('#')) continue;
    const [glyph, strokes, kanji, ...rest] = line.split('\t');
    const n = Number(strokes);
    if (glyph === undefined || glyph === '' || kanji === undefined || rest.length > 0 || !Number.isInteger(n) || n < 1) {
      throw new Error(`radicals.tsv line ${i + 1}: expected part<TAB>strokes<TAB>kanji`);
    }
    out.push({ glyph, strokes: n, kanji });
  }
  return out;
}

/** The index over `entries`, keeping only the kanji `keep` accepts (all by default) and parts left with any. */
export function buildPartIndex(entries: readonly PartEntry[], keep: (kanji: string) => boolean = () => true): PartIndex {
  const kept: PartEntry[] = [];
  const kanjiOf = new Map<string, Set<string>>();
  const partsOf = new Map<string, Set<string>>();
  for (const e of entries) {
    const set = new Set<string>();
    for (const k of e.kanji) {
      if (!keep(k)) continue;
      set.add(k);
      let parts = partsOf.get(k);
      if (parts === undefined) partsOf.set(k, (parts = new Set()));
      parts.add(e.glyph);
    }
    if (set.size === 0) continue;
    const prev = kanjiOf.get(e.glyph);
    if (prev !== undefined) {
      for (const k of set) prev.add(k);
      continue;
    }
    kanjiOf.set(e.glyph, set);
    kept.push({ glyph: e.glyph, strokes: e.strokes, kanji: [...set].join('') });
  }
  return { entries: kept, kanjiOf, partsOf };
}

/** The parts grouped by stroke count, fewest strokes first. */
export function partGroups(index: PartIndex): PartGroup[] {
  const byStrokes = new Map<number, string[]>();
  for (const e of index.entries) {
    const list = byStrokes.get(e.strokes);
    if (list === undefined) byStrokes.set(e.strokes, [e.glyph]);
    else list.push(e.glyph);
  }
  return [...byStrokes.entries()].sort((a, b) => a[0] - b[0]).map(([strokes, parts]) => ({ strokes, parts }));
}

/** The kanji containing every selected part (unknown parts match nothing), and the parts still available. */
export function searchByParts(index: PartIndex, selected: readonly string[]): PartSearch {
  const picked = [...new Set(selected)];
  if (picked.length === 0) return { kanji: [], available: new Set(index.kanjiOf.keys()) };
  const sets = picked.map((p) => index.kanjiOf.get(p) ?? new Set<string>());
  // Walk the smallest set, check the others.
  sets.sort((a, b) => a.size - b.size);
  const [smallest, ...others] = sets;
  const kanji = [...smallest!].filter((k) => others.every((s) => s.has(k)));
  const available = new Set<string>();
  for (const k of kanji) for (const p of index.partsOf.get(k) ?? []) available.add(p);
  return { kanji, available };
}

/** A selection as stored in the URL: the parts one after another (each part is one code point). */
export function formatPartSelection(parts: readonly string[]): string {
  return parts.join('');
}

/** The parts of a stored selection, each once, keeping only parts of `index`. */
export function parsePartSelection(index: PartIndex, text: string): string[] {
  return [...new Set(Array.from(text))].filter((p) => index.kanjiOf.has(p));
}
