/**
 * Which characters a TrueType / OpenType font has glyphs for, read from its `cmap` table. The Java
 * app asks Android (`TextUtil.hasGlyphs` → `Paint.hasGlyph`) before it uses a quiz font for a subject
 * (`SessionItem.tryAddTypefaceConfiguration`); a browser has no such call, so the font file is read
 * here. Handles TTF, OTF and the first font of a TTC; cmap subtable formats 4 and 12.
 */

export type GlyphCoverage = (codePoint: number) => boolean;

interface Group { start: number; end: number; startGlyph: number }

function tableOffset(view: DataView, fontOffset: number, tag: string): number | null {
  const numTables = view.getUint16(fontOffset + 4);
  for (let i = 0; i < numTables; i++) {
    const rec = fontOffset + 12 + i * 16;
    let t = '';
    for (let k = 0; k < 4; k++) t += String.fromCharCode(view.getUint8(rec + k));
    if (t === tag) return view.getUint32(rec + 8);
  }
  return null;
}

function format12(view: DataView, at: number): GlyphCoverage {
  const n = view.getUint32(at + 12);
  const groups: Group[] = [];
  for (let i = 0; i < n; i++) {
    const g = at + 16 + i * 12;
    groups.push({ start: view.getUint32(g), end: view.getUint32(g + 4), startGlyph: view.getUint32(g + 8) });
  }
  return (cp) => {
    let lo = 0;
    let hi = groups.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const g = groups[mid]!;
      if (cp < g.start) hi = mid - 1;
      else if (cp > g.end) lo = mid + 1;
      else return g.startGlyph + (cp - g.start) !== 0;
    }
    return false;
  };
}

function format4(view: DataView, at: number): GlyphCoverage {
  const segCount = view.getUint16(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + segCount * 2 + 2;
  const deltas = starts + segCount * 2;
  const rangeOffsets = deltas + segCount * 2;
  return (cp) => {
    if (cp > 0xFFFF) return false;
    for (let i = 0; i < segCount; i++) {
      const end = view.getUint16(ends + i * 2);
      if (cp > end) continue;
      const start = view.getUint16(starts + i * 2);
      if (cp < start) return false;
      const delta = view.getUint16(deltas + i * 2);
      const ro = view.getUint16(rangeOffsets + i * 2);
      if (ro === 0) return ((cp + delta) & 0xFFFF) !== 0;
      const addr = rangeOffsets + i * 2 + ro + (cp - start) * 2;
      if (addr + 2 > view.byteLength) return false;
      const g = view.getUint16(addr);
      return g !== 0 && ((g + delta) & 0xFFFF) !== 0;
    }
    return false;
  };
}

/** The font's coverage, or null when the file is not a font this can read. */
export function readGlyphCoverage(data: ArrayBuffer): GlyphCoverage | null {
  try {
    const view = new DataView(data);
    let font = 0;
    if (view.getUint32(0) === 0x74746366) font = view.getUint32(12); // 'ttcf': the first font
    const cmap = tableOffset(view, font, 'cmap');
    if (cmap === null) return null;
    const n = view.getUint16(cmap + 2);
    let best4: number | null = null;
    let best12: number | null = null;
    for (let i = 0; i < n; i++) {
      const rec = cmap + 4 + i * 8;
      const platform = view.getUint16(rec);
      const encoding = view.getUint16(rec + 2);
      const sub = cmap + view.getUint32(rec + 4);
      const format = view.getUint16(sub);
      const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
      if (!unicode) continue;
      if (format === 12 && best12 === null) best12 = sub;
      if (format === 4 && best4 === null) best4 = sub;
    }
    if (best12 !== null) return format12(view, best12);
    if (best4 !== null) return format4(view, best4);
    return null;
  } catch {
    return null;
  }
}

/** `TextUtil.hasGlyphs`: every character of `text` (surrogate pairs as one) has a glyph. */
export function hasGlyphs(coverage: GlyphCoverage, text: string): boolean {
  for (const ch of text) {
    if (!coverage(ch.codePointAt(0)!)) return false;
  }
  return true;
}

/**
 * The font's bounding box (`head` yMax / yMin per em): Android's line height for a TextView with
 * `includeFontPadding` (FontMetrics top / bottom). Null when unreadable.
 */
export function readFontBox(data: ArrayBuffer): { ascent: number; descent: number } | null {
  try {
    const view = new DataView(data);
    let font = 0;
    if (view.getUint32(0) === 0x74746366) font = view.getUint32(12);
    const head = tableOffset(view, font, 'head');
    if (head === null) return null;
    const upm = view.getUint16(head + 18);
    if (upm === 0) return null;
    return { ascent: view.getInt16(head + 42) / upm, descent: -view.getInt16(head + 38) / upm };
  } catch {
    return null;
  }
}
