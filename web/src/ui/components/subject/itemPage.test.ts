import { infoTitle } from './subjectText';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LoadedContent } from '../../../content/contentFile';
import type { ContentSubject } from '../../../core/content';
import { HAS_WK_CONTENT, loadBuiltContent } from '../../../../test/subject/contentFile';
import { ItemPage, type ItemPageProps } from './ItemPage';

/** The positions of the labels in the markup, which must be increasing. */
function expectInOrder(html: string, labels: readonly string[]): void {
  const positions = labels.map((l) => {
    const i = html.indexOf(l);
    expect(i, `missing "${l}"`).toBeGreaterThanOrEqual(0);
    return i;
  });
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
}

describe.skipIf(!HAS_WK_CONTENT)('ItemPage', () => {
  let loaded: LoadedContent;
  const find = (pred: (s: ContentSubject) => boolean): ContentSubject => {
    const s = loaded.content.subjects.find((x) => x.hiddenAt === 0 && pred(x));
    if (s === undefined) throw new Error('no such subject');
    return s;
  };
  const render = (subject: ContentSubject, props: Partial<ItemPageProps> = {}): string =>
    renderToStaticMarkup(createElement(ItemPage, { subject, content: loaded, ...props }));

  beforeAll(async () => {
    loaded = await loadBuiltContent();
  }, 180_000);

  it('renders a radical', () => {
    const radical = find((s) => s.object === 'radical' && s.characters === '口');
    const html = render(radical);
    expect(html).toContain('Level 1 radical');
    expect(html).toContain('kk-subject-tile kk-type--radical');
    expectInOrder(html, ['Meaning mnemonic</b>:', 'My synonyms</b>:', 'Used in:', 'SRS System:']);
    expect(html).not.toContain('kk-onyomi');
    expect(html).not.toContain('Reading mnemonic');
    // Stroke order is off by default (show_stroke_order), on with the setting or the prop.
    expect(html).not.toContain('kk-stroke-diagram');
    expect(render(radical, { settings: { show_stroke_order: true } })).toContain('kk-stroke-diagram');
    expect(render(radical, { settings: { show_stroke_order: true }, strokeOrder: false })).not.toContain('kk-stroke-diagram');
  });

  it('renders a radical that only has an image with its slug', () => {
    const radical = find((s) => s.object === 'radical' && s.characters === null);
    expect(render(radical)).toContain(`<span class="kk-ja">${radical.slug}</span>`);
  });

  it("renders a kanji in Java's section order", () => {
    const kanji = find((s) => s.object === 'kanji' && s.characters === '語');
    const html = render(kanji, { settings: { show_stroke_order: true } });
    expectInOrder(html, [
      'kk-headline',
      'yomi:</b> ご',
      'yomi:</b> かた',
      'Used radicals:',
      'Meaning mnemonic</b>:',
      'My synonyms</b>:',
      'Reading mnemonic</b>:',
      'Parts:</b>',
      'Sound:</b>',
      'kk-stroke-diagram',
      'Visually similar:',
      'Used in:',
      'SRS System:',
    ]);
    expect(html).toContain('<span class="kk-wk-tag kk-wk-tag--radical">');
    expect(html).not.toContain('Context sentences:');
  });

  it('swaps "Visually similar" and "Used in", shows katakana on\'yomi and plain bold tags when set', () => {
    const kanji = find((s) => s.object === 'kanji' && s.characters === '語');
    const html = render(kanji, { settings: { swap_similar_amalgamations: true, show_onyomi_in_katakana: true, highlight_subject_tags: false } });
    expectInOrder(html, ['Used in:', 'Visually similar:']);
    expect(html).toContain('On&#x27;yomi:</b> ゴ');
    expect(html).not.toContain('kk-wk-tag');
  });

  it('renders vocabulary with parts of speech, context sentences, notes and pitch accent when asked', () => {
    const vocab = find((s) => s.object === 'vocabulary' && s.characters === '大人');
    const progress = {
      srsStage: 5,
      meaningNote: 'grown-up\n<i>adult</i>',
      readingNote: null,
      meaningSynonyms: '["grownup"]',
      meaningCorrect: 3,
      meaningIncorrect: 1,
      meaningMaxStreak: 3,
      meaningCurrentStreak: 2,
      percentageCorrect: 75,
    };
    const html = render(vocab, { progress, audio: createElement('button', { className: 'test-audio' }, 'play') });
    expectInOrder(html, [
      'Level ',
      'test-audio',
      'Used kanji:',
      'Meaning mnemonic</b>:',
      'My meaning note</b>: grown-up<br/>&lt;i&gt;adult&lt;/i&gt;',
      'My synonyms</b>: grownup',
      'Reading mnemonic</b>:',
      'Part of speech</b>: noun',
      'Context sentences:',
      'SRS Stage:',
      'Guru I',
      'Meaning correct:',
      '75%, max streak 3, current streak 2',
    ]);
    expect(html).not.toContain('Parts:</b>');
    expect(html).not.toContain('kk-pitch');
    expect(render(vocab, { settings: { show_pitch_info: true } })).toContain('kk-pitch-diagram');
    expect(render(vocab, { settings: { show_pitch_info: true }, pitch: false })).not.toContain('kk-pitch');
    // The always_hide_wk_mnemonic setting hides the mnemonics, never the notes.
    const hidden = render(vocab, { progress, settings: { always_hide_wk_mnemonic: true } });
    expect(hidden).not.toContain('Meaning mnemonic');
    expect(hidden).toContain('My meaning note');
  });

  it('follows the info-dump flags', () => {
    const vocab = find((s) => s.object === 'vocabulary' && s.characters === '大人');
    const html = render(vocab, { visibility: { readingAnswers: false, readingRelated: false } });
    expect(html).toContain('Meaning mnemonic');
    expect(html).not.toContain('Reading mnemonic');
    expect(html).not.toContain('kk-headline-reading');
    const none = render(vocab, { visibility: { meaningAnswers: false, readingAnswers: false, meaningRelated: false, readingRelated: false } });
    expect(none).not.toContain('SRS System:');
    expect(none).not.toContain('My synonyms');
  });

  it('renders kana-only vocabulary', () => {
    const kana = find((s) => s.object === 'kana_vocabulary');
    const html = render(kana);
    expect(html).toContain('kana-only vocabulary');
    expect(html).toContain('kk-type--kana_vocabulary');
    expect(html).toContain('Meaning mnemonic');
    expect(html).not.toContain('Used kanji:');
  });

  it('renders an extra kanji (id ≥ 100000)', () => {
    const extra = find((s) => s.id >= 100000 && s.object === 'kanji' && readHasStroke(s.id));
    const html = render(extra, { level: 61, settings: { show_stroke_order: true } });
    expect(html).toContain(`data-subject-id="${extra.id}"`);
    expect(html).toContain('Level 61 kanji');
    expect(html).toContain('kk-stroke-diagram');
    expect(html).toContain('SRS System:');
  });

  it('links subjects only when it can open them', () => {
    const kanji = find((s) => s.object === 'kanji' && s.characters === '語');
    expect(render(kanji)).not.toContain('<button type="button" class="kk-link-button"');
    const html = render(kanji, { onOpenSubject: () => {} });
    expect(html).toContain(`<button type="button" class="kk-link-button" data-subject-id="${kanji.componentSubjectIds[0]}"`);
  });

  it('offers editing only with a save callback', () => {
    const kanji = find((s) => s.object === 'kanji' && s.characters === '語');
    expect(render(kanji)).not.toContain('Add synonym');
    const html = render(kanji, { onSaveStudyMaterial: () => {} });
    expect(html).toContain('aria-label="Add synonym"');
    // Notes: the "My notes..." menu item (NotesDialog), not a button on the page (Java).
    expect(html).not.toContain('Edit notes');
  });

  it('shows the cards\' progress line and Java\'s info title', () => {
    const kanji = find((s) => s.object === 'kanji' && s.characters === '語');
    const html = render(kanji, { cardProgress: () => 'Guru I - 3h' });
    expect(html).toContain('<span class="kk-link-progress">Guru I - 3h</span>');
    expect(infoTitle(kanji, 5)).toBe('語 (level 5 kanji)');
    expect(infoTitle({ ...kanji, object: 'kana_vocabulary' }, 7)).toBe('語 (level 7 Kana-only Vocab)');
  });

  function readHasStroke(id: number): boolean {
    return (loaded.db.exec('SELECT 1 FROM stroke_data WHERE id = ?', [id])[0]?.values.length ?? 0) > 0;
  }
});
