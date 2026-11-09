import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildPartIndex,
  formatPartSelection,
  parsePartSelection,
  parseRadicalsTsv,
  partGroups,
  searchByParts,
  type PartEntry,
} from './parts';

const ENTRIES: PartEntry[] = [
  { glyph: '一', strokes: 1, kanji: '三言語' },
  { glyph: '亻', strokes: 2, kanji: '休体信' },
  { glyph: '口', strokes: 3, kanji: '語言信品' },
  { glyph: '木', strokes: 4, kanji: '休体本' },
  { glyph: '言', strokes: 7, kanji: '語言信' },
  { glyph: '𠆢', strokes: 2, kanji: '今' },
];

describe('search by parts', () => {
  const index = buildPartIndex(ENTRIES);

  it('groups the parts by stroke count, in file order', () => {
    expect(partGroups(index)).toEqual([
      { strokes: 1, parts: ['一'] },
      { strokes: 2, parts: ['亻', '𠆢'] },
      { strokes: 3, parts: ['口'] },
      { strokes: 4, parts: ['木'] },
      { strokes: 7, parts: ['言'] },
    ]);
  });

  it('finds nothing and leaves every part available without a selection', () => {
    const r = searchByParts(index, []);
    expect(r.kanji).toEqual([]);
    expect([...r.available].sort()).toEqual(['一', '亻', '口', '木', '言', '𠆢'].sort());
  });

  it('keeps the kanji containing every selected part', () => {
    expect(searchByParts(index, ['口']).kanji.sort()).toEqual(['信', '品', '言', '語'].sort());
    expect(searchByParts(index, ['口', '亻']).kanji).toEqual(['信']);
    expect(searchByParts(index, ['亻', '木']).kanji.sort()).toEqual(['休', '体'].sort());
    expect(searchByParts(index, ['口', '口']).kanji.length).toBe(4);
  });

  it('leaves available only the parts of the kanji found', () => {
    const r = searchByParts(index, ['亻', '木']);
    expect([...r.available].sort()).toEqual(['亻', '木'].sort());
    const one = searchByParts(index, ['一']);
    expect([...one.available].sort()).toEqual(['一', '口', '言'].sort());
    expect(one.available.has('亻')).toBe(false);
  });

  it('matches nothing for parts that can not occur together or are unknown', () => {
    expect(searchByParts(index, ['𠆢', '木'])).toEqual({ kanji: [], available: new Set() });
    expect(searchByParts(index, ['X']).kanji).toEqual([]);
  });

  it('keeps only accepted kanji and drops parts left without any', () => {
    const small = buildPartIndex(ENTRIES, (k) => k !== '今' && k !== '本');
    expect(small.kanjiOf.has('𠆢')).toBe(false);
    expect(small.entries.find((e) => e.glyph === '木')).toEqual({ glyph: '木', strokes: 4, kanji: '休体' });
    expect(searchByParts(small, ['木']).kanji).toEqual(['休', '体']);
  });

  it('stores a selection as the parts one after another, including astral ones', () => {
    const text = formatPartSelection(['亻', '𠆢']);
    expect(text).toBe('亻𠆢');
    expect(parsePartSelection(index, text)).toEqual(['亻', '𠆢']);
    expect(parsePartSelection(index, '亻亻Xa口')).toEqual(['亻', '口']);
  });
});

describe('radicals.tsv', () => {
  it('parses lines and skips comments', () => {
    expect(parseRadicalsTsv('# header\n一\t1\t三\n亻\t2\t休体\n')).toEqual([
      { glyph: '一', strokes: 1, kanji: '三' },
      { glyph: '亻', strokes: 2, kanji: '休体' },
    ]);
  });

  it('throws on a malformed line', () => {
    expect(() => parseRadicalsTsv('一\t1\n')).toThrow(/line 1/);
    expect(() => parseRadicalsTsv('一\tx\t三\n')).toThrow();
    expect(() => parseRadicalsTsv('\t1\t三\n')).toThrow();
  });

  it('the committed file: about 250 single-character parts, the RADKFILE stand-ins replaced', () => {
    const entries = parseRadicalsTsv(readFileSync(new URL('../../../../content/inputs/radicals.tsv', import.meta.url), 'utf8'));
    expect(entries.length).toBeGreaterThan(240);
    for (const e of entries) expect(Array.from(e.glyph)).toHaveLength(1);
    const glyphs = new Set(entries.map((e) => e.glyph));
    for (const g of ['亻', '辶', '氵', '艹', '忄', '扌']) expect(glyphs.has(g)).toBe(true);
    for (const g of ['化', '込', '汁', '艾']) expect(glyphs.has(g)).toBe(false);
    const index = buildPartIndex(entries);
    expect(searchByParts(index, ['言', '五', '口']).kanji).toContain('語');
    expect(searchByParts(index, ['亻', '木']).kanji).toContain('休');
  });
});
