// @vitest-environment jsdom
/** The vector drawable → title image conversion (scripts/content/titleImages.ts) and the SVG it renders as. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { parseVectorDrawable } from '../../scripts/content/titleImages';
import { registerTitleImages, TITLE_IMAGE_IDS } from '../../src/content/titleImages';
import { InfoTitle, SubjectChars, subjectGlyphCount } from '../../src/ui/components/subject/SubjectChars';

const roots: { root: Root; el: HTMLElement }[] = [];
function render(node: ReactNode): { container: HTMLElement; unmount(): void } {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(node));
  roots.push({ root, el });
  return { container: el, unmount: () => act(() => root.unmount()) };
}

// jsdom: no file: import.meta.url, so not scripts/content/inputs.ts (vitest runs from web/).
const DRAWABLE_DIR = join(process.cwd(), '../durtles/app/src/main/res/drawable');

afterEach(() => {
  for (const { root, el } of roots.splice(0)) {
    act(() => root.unmount());
    el.remove();
  }
  registerTitleImages(new Map());
});

const XML = `<vector android:height="24dp" android:viewportHeight="1000" android:viewportWidth="1000" android:width="24dp">
  <path android:fillColor="#00000000" android:pathData="M1,2L3,4" android:strokeColor="#000" android:strokeLineCap="square" android:strokeWidth="68"/>
  <group>
    <clip-path android:pathData="M0,0h10v10z M 0,0"/>
    <path android:fillColor="#00000000" android:pathData="M5,5L6,6" android:strokeColor="#000" android:strokeLineCap="square" android:strokeWidth="68"/>
  </group>
  <path android:fillColor="#00000000" android:pathData="M7,7L8,8" android:strokeColor="#000" android:strokeLineCap="square" android:strokeWidth="50"/>
</vector>`;

describe('parseVectorDrawable', () => {
  it('keeps every path in order with its group clip', () => {
    expect(parseVectorDrawable(XML)).toEqual({
      size: 1000,
      paths: [
        { d: 'M1,2L3,4', w: 68 },
        { d: 'M5,5L6,6', w: 68, clip: 'M0,0h10v10z M 0,0' },
        { d: 'M7,7L8,8', w: 50 },
      ],
    });
  });

  it('rejects what it does not understand', () => {
    expect(() => parseVectorDrawable(XML.replace('#00000000', '#FF000000'))).toThrow(/filled/);
    expect(() => parseVectorDrawable(XML.replace('viewportHeight="1000"', 'viewportHeight="500"'))).toThrow(/square/);
  });

  it('reads every drawable the Java app maps', () => {
    for (const id of TITLE_IMAGE_IDS) {
      const img = parseVectorDrawable(readFileSync(join(DRAWABLE_DIR, `radical_${id}.xml`), 'utf8'), `radical_${id}.xml`);
      expect(img.paths.length, `radical_${id}`).toBeGreaterThan(0);
    }
  });
});

describe('SubjectChars', () => {
  const yurt = { id: 8787, object: 'radical', characters: null, slug: 'yurt' };
  const kanji = { id: 440, object: 'kanji', characters: '一', slug: '一' };

  it('shows the slug without an image, the image (with clip paths) once registered', () => {
    expect(render(<SubjectChars subject={yurt} />).container.textContent).toBe('yurt');
    registerTitleImages(new Map([[8787, parseVectorDrawable(XML)]]));
    const b = render(<SubjectChars subject={yurt} text="ignored" />);
    const svg = b.container.querySelector('svg[role="img"][aria-label="yurt"]')!;
    expect(svg.querySelectorAll('g > path')).toHaveLength(3);
    const clipId = svg.querySelector('clipPath')!.id;
    expect(svg.querySelectorAll('g > path')[1]!.getAttribute('clip-path')).toBe(`url(#${clipId})`);
    expect(subjectGlyphCount(yurt)).toBe(1);
  });

  it('shows characters, or the given text, for other subjects', () => {
    registerTitleImages(new Map([[8787, parseVectorDrawable(XML)]]));
    expect(render(<SubjectChars subject={kanji} text="一つ" />).container.textContent).toBe('一つ');
    expect(subjectGlyphCount(kanji, '一つ')).toBe(2);
    expect(render(<InfoTitle subject={kanji} level={1} prefix="My notes for " suffix=":" />).container.textContent)
      .toBe('My notes for 一 (level 1 kanji):');
  });
});
