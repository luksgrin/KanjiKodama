import { describe, expect, it } from 'vitest';
import { contentDb, hasContentDb } from '../../../test/golden/content';
import { markupTagged, markupText, parseWkMarkup, type MarkupElement } from './wkMarkup';

const text = (html: string) => markupText(parseWkMarkup(html));
const tagged = (html: string) => markupTagged(parseWkMarkup(html));

describe('parseWkMarkup', () => {
  it('maps the WaniKani tags and their short forms', () => {
    expect(tagged('<radical>a</radical><rd>b</rd><kanji>c</kanji><kan>d</kan><vocabulary>e</vocabulary><voc>f</voc>')).toEqual([
      ['radical', 'a'],
      ['radical', 'b'],
      ['kanji', 'c'],
      ['kanji', 'd'],
      ['vocabulary', 'e'],
      ['vocabulary', 'f'],
    ]);
    expect(tagged('<kana_vocabulary>g</kana_vocabulary><kanavoc>h</kanavoc><reading>i</reading><ja>日本</ja>')).toEqual([
      ['kana_vocabulary', 'g'],
      ['kana_vocabulary', 'h'],
      ['reading', 'i'],
      ['ja', '日本'],
    ]);
    expect(tagged('<KANJI>x</Kanji>')).toEqual([['kanji', 'x']]);
  });

  it("maps Android Html's inline tags", () => {
    expect(tagged('<b>1</b><strong>2</strong><i>3</i><em>4</em><u>5</u><small>6</small><big>7</big><sup>8</sup><sub>9</sub><s>0</s>')).toEqual([
      ['b', '1'],
      ['b', '2'],
      ['i', '3'],
      ['i', '4'],
      ['u', '5'],
      ['small', '6'],
      ['big', '7'],
      ['sup', '8'],
      ['sub', '9'],
      ['s', '0'],
    ]);
  });

  it('collapses whitespace like Android Html', () => {
    expect(text('  a  \n b\t\tc ')).toBe('a b\t\tc ');
    expect(text('a<br>  b')).toBe('a\nb');
    expect(text('a<br/><br />b')).toBe('a\n\nb');
    expect(text('a  b　c')).toBe('a  b　c');
  });

  it('puts blocks on their own line (compact mode)', () => {
    expect(text('<p>one</p><p>two</p>three')).toBe('one\ntwo\nthree');
    expect(text('a<div>b</div>c')).toBe('a\nb\nc');
  });

  it('decodes entities and keeps a bare < as text', () => {
    expect(text('AT&amp;T &lt;b&gt; &quot;x&quot; &#12354;&#x3044; a < b &bogus; &')).toBe('AT&T <b> "x" あい a < b &bogus; &');
    expect(tagged('&lt;kanji&gt;')).toEqual([]);
  });

  it('drops comments and declarations', () => {
    expect(text('a<!-- <kanji>x</kanji> -->b<!DOCTYPE html>c')).toBe('abc');
  });

  it('repairs unbalanced tags like TagSoup', () => {
    // Real readingMnemonic (subject 607): the reading runs to the end of the text.
    const nodes = parseWkMarkup('<kanji>change</kanji>it into a <reading>car</kanji> (か).');
    expect(markupTagged(nodes)).toEqual([
      ['kanji', 'change'],
      ['reading', 'car (か).'],
    ]);
    // An end tag closes the elements opened after its start tag.
    expect(tagged('<b>a<i>b</b>c')).toEqual([
      ['b', 'ab'],
      ['i', 'b'],
    ]);
    // Stray end tags are ignored; empty elements make no span.
    expect(tagged('x</kanji>y<kanji></kanji>z')).toEqual([]);
    expect(text('x</kanji>y')).toBe('xy');
  });

  it('keeps the text of unknown tags and nests elements', () => {
    expect(tagged('<span class="x"><font color="red">a</font></span>')).toEqual([]);
    expect(text('<span class="x"><font color="red">a</font></span>')).toBe('a');
    const [el] = parseWkMarkup('<vocabulary>big <kanji>dog</kanji></vocabulary>') as [MarkupElement];
    expect(el.tag).toBe('vocabulary');
    expect(el.children).toEqual(['big ', { tag: 'kanji', children: ['dog'] }]);
  });

  it('keeps link hrefs', () => {
    const [, link] = parseWkMarkup('see <a href="https://example.org/x?a=1&amp;b=2" target="_blank">this</a>') as [string, MarkupElement];
    expect(link).toEqual({ tag: 'a', href: 'https://example.org/x?a=1&b=2', children: ['this'] });
    expect(parseWkMarkup('<a>x</a>')).toEqual([{ tag: 'a', href: null, children: ['x'] }]);
  });

  it('never throws on junk', () => {
    for (const s of ['<', '<<', '</', '<a', '<a href="', '&#99999999;', '<b><i><u>', '</b></i>', '<!--', '<p', '&#x;']) {
      expect(() => parseWkMarkup(s)).not.toThrow();
    }
  });
});

describe.skipIf(!hasContentDb())('parseWkMarkup over the content DB', () => {
  it('parses every mnemonic and hint, leaving no tag in the text', async () => {
    const db = await contentDb();
    const res = db.exec('SELECT id, meaningMnemonic, meaningHint, readingMnemonic, readingHint FROM subject');
    const rows = res[0]?.values ?? [];
    expect(rows.length).toBeGreaterThan(9000);
    let tags = 0;
    for (const row of rows) {
      for (const v of row.slice(1)) {
        if (typeof v !== 'string' || v === '') continue;
        const nodes = parseWkMarkup(v);
        const t = markupText(nodes);
        expect(t, `subject ${row[0]}`).not.toMatch(/<\/?(kanji|radical|vocabulary|reading|em|ja|a)\b/);
        tags += markupTagged(nodes).length;
      }
    }
    expect(tags).toBeGreaterThan(35000);
  });

  it('renders real mnemonics as the device does', async () => {
    const db = await contentDb();
    const one = (sql: string): string => String(db.exec(sql)[0]?.values[0]?.[0]);
    const m607 = parseWkMarkup(one('SELECT readingMnemonic FROM subject WHERE id = 607'));
    expect(markupTagged(m607).at(-1)).toEqual(['reading', 'car (か).']);

    const withLink = parseWkMarkup(one("SELECT meaningMnemonic FROM subject WHERE meaningMnemonic LIKE '%<a href=%' ORDER BY id LIMIT 1"));
    const links = markupTagged(withLink).filter(([t]) => t === 'a');
    expect(links.length).toBe(1);

    const withAmp = one("SELECT meaningMnemonic FROM subject WHERE meaningMnemonic LIKE '%AT&amp;T%' LIMIT 1");
    expect(markupText(parseWkMarkup(withAmp))).toContain('AT&T');
  });
});
