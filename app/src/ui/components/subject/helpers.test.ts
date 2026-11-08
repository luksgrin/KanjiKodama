import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LoadedContent } from '../../../content/contentFile';
import type { ContentSubject } from '../../../core/content';
import { HAS_WK_CONTENT, loadBuiltContent } from '../../../../test/subject/contentFile';
import { hasPitchInfo, isDotHigh, moraEnds, parsePitchInfo, pitchBlocks, pitchDots, pitchInfoFor, pitchLabel } from './pitchInfo';
import { classifySound, dbSoundLookup, soundComponentsHtml, soundCore, type SoundLookup } from './soundComponents';
import { StrokeDiagram } from './StrokeDiagram';
import { parseStroke, pointAt, splitCoordinates, strokeDurationMs } from './strokePaths';
import { readPitchInfo, readStrokeData, readSubjectTexts } from './subjectContent';
import { meaningHtml, mnemonicHtml, noteHtml, oneMeaning, oneReading, onYomiHtml, regularReadingHtml, simpleInfoTitle } from './subjectText';
import { WkMarkup } from './WkMarkup';

function subject(partial: Partial<ContentSubject>): ContentSubject {
  return {
    id: 1, object: 'kanji', hiddenAt: 0, lessonPosition: 0, srsSystemId: 1, level: 1, characters: '語', slug: null,
    meanings: [], auxiliaryMeanings: [], readings: [], componentSubjectIds: [], amalgamationSubjectIds: [],
    visuallySimilarSubjectIds: [], partsOfSpeech: [], frequency: 0, joyoGrade: 0, jlptLevel: 0, ...partial,
  };
}

describe('WkMarkup', () => {
  const html = (h: string, highlight = true) => renderToStaticMarkup(createElement(WkMarkup, { html: h, highlight }));

  it('renders subject tags as chips, or bold without highlighting', () => {
    expect(html('a <kanji>b</kanji>')).toBe('<span>a <span class="kk-wk-tag kk-wk-tag--kanji">b</span></span>');
    expect(html('a <kanji>b</kanji>', false)).toBe('<span>a <b>b</b></span>');
    expect(html('<ja>日</ja>')).toBe('<span><span lang="ja" class="kk-ja">日</span></span>');
  });

  it('never passes markup through: script and handlers are text or dropped', () => {
    const out = html('<script>alert(1)</script><img src=x onerror="alert(1)"><b onclick="x()">t</b>&lt;i&gt;');
    expect(out).toBe('<span>alert(1)<b>t</b>&lt;i&gt;</span>');
  });

  it('links only web URLs', () => {
    expect(html('<a href="https://example.org/">x</a>')).toBe('<span><a href="https://example.org/" target="_blank" rel="noopener noreferrer">x</a></span>');
    expect(html('<a href="javascript:alert(1)">x</a>')).toBe('<span><span>x</span></span>');
  });

  it('renders line breaks', () => {
    expect(html(mnemonicHtml('meaning', 'one\ntwo'))).toBe('<span><b>Meaning mnemonic</b>: one<br/>two</span>');
  });
});

describe('subject text lines (Subject.get*RichText)', () => {
  const s = subject({
    meanings: [
      { meaning: 'Language', primary: true, accepted_answer: true },
      { meaning: 'Word', primary: false, accepted_answer: true },
      { meaning: 'Hidden', primary: false, accepted_answer: false },
    ],
    readings: [
      { reading: 'ご', primary: true, accepted_answer: true, type: 'onyomi' },
      { reading: 'かた', primary: false, accepted_answer: false, type: 'kunyomi' },
    ],
  });

  it('builds the info lines', () => {
    expect(simpleInfoTitle('kana_vocabulary', 3)).toBe('Level 3 kana-only vocabulary');
    expect(meaningHtml(s)).toBe('<b>Language</b>, Word');
    expect(meaningHtml(subject({ meanings: [{ meaning: 'a<b', primary: true, accepted_answer: true }] }))).toBe('a&lt;b');
    expect(regularReadingHtml(s, false)).toBe('ご');
    expect(regularReadingHtml(s, true)).toBe('ゴ');
    expect(onYomiHtml(s, true)).toBe("<b>On'yomi:</b> ゴ");
    expect(noteHtml('reading', 'x <y>\nz')).toBe('<b>My reading note</b>: x &lt;y&gt;<br/>z');
    expect(oneMeaning(s)).toBe('Language');
    expect(oneReading(s, true)).toBe('ゴ');
    // No primary → the last accepted one wins over an earlier accepted one only if t isn't accepted.
    expect(oneMeaning(subject({ meanings: [
      { meaning: 'a', primary: false, accepted_answer: false },
      { meaning: 'b', primary: false, accepted_answer: true },
      { meaning: 'c', primary: false, accepted_answer: false },
    ] }))).toBe('b');
  });
});

describe('stroke paths', () => {
  it('splits coordinates like the coordinate regex', () => {
    expect(splitCoordinates('1.25-0.5.5,2')).toEqual([1.25, -0.5, 0.5, 2]);
    expect(splitCoordinates(' 15.50,40.50')).toEqual([15.5, 40.5]);
  });

  it('parses a KanjiVG stroke with its T label', () => {
    const s = parseStroke('M22.25,33.25c1.25,1.25,2,2.88,2.26,4.43C29.46,78.09,29.73,80.6,30,83T1,15.50,40.50');
    expect(s.strokeNumber).toBe(1);
    expect([s.labelX, s.labelY]).toEqual([15.5, 40.5]);
    expect(s.d).toBe('M22.25 33.25C23.5 34.5 24.25 36.13 24.51 37.68C29.46 78.09 29.73 80.6 30 83');
    expect(pointAt(s, 0)).toEqual([22.25, 33.25]);
    const end = pointAt(s, s.length + 10);
    expect(end[0]).toBeCloseTo(30);
    expect(end[1]).toBeCloseTo(83);
    expect(s.length).toBeGreaterThan(Math.hypot(30 - 22.25, 83 - 33.25) - 0.01);
    expect(strokeDurationMs(s)).toBe(Math.trunc(s.length * 5));
  });

  it('handles H, V, L, S, relative commands and Z', () => {
    const s = parseStroke('M10,10h5v5l-5,0zM50,50S60,60,70,50');
    // The instruction regex needs a non-letter after the command: "z" right before "M" is skipped.
    expect(s.d).toBe('M10 10L15 10L15 15L10 15M50 50C50 50 60 60 70 50');
    expect(parseStroke('M10,10h5z m1,1l1,1').d).toBe('M10 10L15 10ZM10 10M11 11L12 12');
    expect(s.length).toBeGreaterThan(20);
    // A missing coordinate stops the parse but keeps what was built.
    expect(parseStroke('M1,1L2,2L3').d).toBe('M1 1L2 2');
  });

  it('renders all strokes and numbers statically', () => {
    const strokes = ['M10,10L90,10T1,5,8', 'M50,10L50,90T2,52,20'];
    const out = renderToStaticMarkup(createElement(StrokeDiagram, { strokes, size: 109, animated: false }));
    expect(out.match(/class="kk-stroke-done"/g)?.length).toBe(2);
    expect(out).not.toContain('kk-stroke-ghost');
    expect(out).toContain('<text x="5" y="8" class="kk-stroke-label-done">1</text>');
    expect(out).toContain('aria-pressed="false"');
    expect(out).toContain('font-size="12"');
  });

  it('starts animated with every stroke a ghost and the first number lit', () => {
    const strokes = ['M10,10L90,10T1,5,8', 'M50,10L50,90T2,52,20'];
    const out = renderToStaticMarkup(createElement(StrokeDiagram, { strokes, size: 250 }));
    expect(out.match(/class="kk-stroke-ghost"/g)?.length).toBe(2);
    expect(out.match(/kk-stroke-label-done/g)?.length).toBe(1);
    expect(out).toContain('width="250"');
  });
});

describe('pitch info', () => {
  it('parses records like PitchInfoDeserializer', () => {
    expect(parsePitchInfo('[["いち",null,2],[null,"名",0],["x",null],[1,2,3]]')).toEqual([
      { reading: 'イチ', partOfSpeech: null, pitchNumber: 2 },
      { reading: null, partOfSpeech: '名', pitchNumber: 0 },
    ]);
    expect(parsePitchInfo(null)).toEqual([]);
    expect(parsePitchInfo('@1700000000000')).toEqual([]);
    expect(parsePitchInfo('nope')).toEqual([]);
  });

  it('matches readings in katakana, else the fallback', () => {
    const infos = parsePitchInfo('[["ヒトツ",null,2],[null,null,0]]');
    expect(pitchInfoFor(infos, 'ひとつ')).toEqual([{ reading: 'ヒトツ', partOfSpeech: null, pitchNumber: 2 }]);
    expect(pitchInfoFor(infos, 'いち')).toEqual([{ reading: null, partOfSpeech: null, pitchNumber: 0 }]);
    const vocab = subject({ object: 'vocabulary', readings: [{ reading: 'ひとつ', primary: true, accepted_answer: true }] });
    expect(hasPitchInfo(vocab, infos)).toBe(true);
    expect(hasPitchInfo({ ...vocab, object: 'kanji' }, infos)).toBe(false);
    expect(pitchBlocks(vocab, infos)).toEqual([{ kana: 'ひとつ', infos: [infos[0]] }]);
  });

  it('splits mora, places dots and labels the pattern', () => {
    expect(moraEnds('きょう')).toEqual([2, 3]);
    expect(moraEnds('がっこう')).toEqual([1, 2, 3, 4]);
    expect(moraEnds('しゃ')).toEqual([2]);
    expect(pitchDots('きょう', 1)).toEqual([
      { x: 1, high: true, hollow: false },
      { x: 2.5, high: false, hollow: false },
      { x: 3.5, high: false, hollow: true },
    ]);
    expect([0, 1, 2, 3].map((m) => isDotHigh(0, m))).toEqual([false, true, true, true]);
    expect([0, 1, 2, 3].map((m) => isDotHigh(2, m))).toEqual([false, true, false, false]);
    expect(pitchLabel({ reading: null, partOfSpeech: null, pitchNumber: 0 }, 3)).toBe('[0] 平板');
    expect(pitchLabel({ reading: null, partOfSpeech: null, pitchNumber: 1 }, 3)).toBe('[1] 頭高');
    expect(pitchLabel({ reading: null, partOfSpeech: '名', pitchNumber: 2 }, 3)).toBe('[2] 中高 (名)');
    expect(pitchLabel({ reading: null, partOfSpeech: null, pitchNumber: 3 }, 3)).toBe('[3] 尾高');
  });
});

describe('Parts and sound (SoundComponents)', () => {
  it('collapses voicing and long vowels', () => {
    expect(soundCore('ごう')).toBe('こ');
    expect(soundCore('せい')).toBe('せ');
    expect(soundCore('ばん')).toBe('はん');
    expect(classifySound('ご', 'ご')).toBe('exact');
    expect(classifySound('こう', 'ご')).toBe('variant');
    expect(classifySound('き', 'ご')).toBe('irregular');
  });

  const fake = (over: Partial<SoundLookup>): SoundLookup => ({
    parts: () => [], sound: () => null, series: () => null, members: () => [], displayName: (_g, f) => f, kanjiLevel: () => 0, ...over,
  });

  it('says so when no part gives the sound', () => {
    const s = subject({ characters: '日' });
    expect(soundComponentsHtml(s, fake({}))).toBeNull();
    expect(soundComponentsHtml(s, fake({ parts: () => [{ glyph: '日', role: 'shape', name: 'sun' }] }))).toBe(
      "<b>Parts:</b> <ja>日</ja> sun<br/>No part of this kanji hints at its on'yomi; learn the reading directly.",
    );
    expect(soundComponentsHtml({ ...s, object: 'vocabulary' }, fake({}))).toBeNull();
  });

  it('builds the full explanation', () => {
    const s = subject({ characters: '語', readings: [{ reading: 'ご', primary: true, accepted_answer: true, type: 'onyomi' }] });
    const html = soundComponentsHtml(s, fake({
      parts: () => [{ glyph: '言', role: 'semantic', name: 'say' }, { glyph: '吾', role: 'phonetic', name: 'I' }],
      displayName: (g, f) => (g === '言' ? 'Say' : f),
      sound: () => ({ phonetic: '吾', seriesId: 7, seriesReading: 'ご', actualReading: 'ご', match: 'exact' }),
      series: () => ({ reliability: 0.665, coreMembers: 3 }),
      members: () => [{ literal: '悟', reading: 'ご', match: 'exact' }, { literal: '梧', reading: 'ご', match: 'exact' }, { literal: '衙', reading: 'が', match: 'irregular' }],
      kanjiLevel: (l) => ({ 悟: 30, 衙: 12 })[l] ?? 0,
    }));
    expect(html).toBe(
      '<b>Parts:</b> <ja>言</ja> Say <i>(meaning)</i> + <ja>吾</ja> I <i>(sound)</i><br/>' +
        "<b>Sound:</b> <ja>吾</ja> gives the on'yomi <ja>ご</ja>. <ja>語</ja> follows it: <ja>ご</ja> ✓<br/>" +
        '67% of the 3 common <ja>吾</ja>-series kanji follow this reading.' +
        '<br/>Also in WaniKani: <ja>衙 が</ja> ✗ <small>L12</small> · <ja>悟 ご</ja> ✓ <small>L30</small>',
    );
  });
});

describe.skipIf(!HAS_WK_CONTENT)('content file lookups', () => {
  let loaded: LoadedContent;
  const byChars = (chars: string, object: string): ContentSubject =>
    loaded.content.subjects.find((s) => s.characters === chars && s.object === object && s.hiddenAt === 0)!;
  beforeAll(async () => {
    loaded = await loadBuiltContent();
  }, 180_000);

  it('reads mnemonics and context sentences', () => {
    const vocab = byChars('大人', 'vocabulary');
    const texts = readSubjectTexts(loaded.db, vocab.id);
    expect(texts.meaningMnemonic).toMatch(/<kanji>/);
    expect(texts.contextSentences.length).toBeGreaterThan(0);
    expect(texts.contextSentences[0]!.ja).toContain('大人');
    expect(readSubjectTexts(loaded.db, -1).contextSentences).toEqual([]);
  });

  it('reads stroke data for a few kanji and makes SVG paths', () => {
    for (const [chars, count] of [['口', 3], ['語', 14], ['一', 1], ['木', 4]] as const) {
      const strokes = readStrokeData(loaded.db, byChars(chars, 'kanji').id);
      expect(strokes.length, chars).toBe(count);
      const parsed = strokes.map(parseStroke);
      expect(parsed.map((p) => p.strokeNumber)).toEqual(Array.from({ length: count }, (_, i) => i + 1));
      for (const p of parsed) {
        expect(p.d).toMatch(/^M[\d.]+ [\d.]+[LC]/);
        expect(p.length).toBeGreaterThan(5);
        expect(p.labelX).toBeGreaterThan(0);
      }
    }
    const out = renderToStaticMarkup(createElement(StrokeDiagram, { strokes: readStrokeData(loaded.db, byChars('口', 'kanji').id), animated: false }));
    expect(out.match(/<path /g)?.length).toBe(3);
  });

  it('reads pitch info for vocabulary', () => {
    const vocab = byChars('一つ', 'vocabulary');
    const infos = readPitchInfo(loaded.db, vocab.id);
    expect(infos.length).toBeGreaterThan(0);
    expect(hasPitchInfo(vocab, infos)).toBe(true);
    expect(pitchBlocks(vocab, infos).length).toBeGreaterThan(0);
  });

  it('builds Parts and sound from the Parts/Sound tables', () => {
    const go = byChars('語', 'kanji');
    const html = soundComponentsHtml(go, dbSoundLookup(loaded.db, loaded.content))!;
    expect(html).toMatch(/^<b>Parts:<\/b> <ja>言<\/ja> \S+ <i>\(meaning\)<\/i> \+ <ja>吾<\/ja> \S+ <i>\(sound\)<\/i><br\/>/);
    expect(html).toContain("<b>Sound:</b> <ja>吾</ja> gives the on'yomi <ja>ご</ja>. <ja>語</ja> follows it: <ja>ご</ja> ✓");
    // Names come from the WaniKani radical/kanji first.
    const lookup = dbSoundLookup(loaded.db, loaded.content);
    expect(lookup.displayName('言', 'fallback')).toBe(byChars('言', 'radical').meanings[0]!.meaning);
    expect(lookup.displayName('\u0000', 'fallback')).toBe('fallback');
    expect(lookup.kanjiLevel('語')).toBe(go.level);
    // Members are in WaniKani level order, at most 12.
    const levels = [...html.matchAll(/<small>L(\d+)<\/small>/g)].map((m) => Number(m[1]));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(levels.length).toBeLessThanOrEqual(12);
  });
});
