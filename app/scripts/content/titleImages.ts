/**
 * Converts the Java app's radical drawables (`res/drawable/radical_<id>.xml`, Android vector drawables)
 * into the content file's `title_image` rows (`src/content/titleImages.ts`). The drawables are flat:
 * `<path>`s (stroked, transparent fill) at the top level or inside a `<group>` that starts with one
 * `<clip-path>`. Anything else is rejected so a changed drawable is noticed.
 */
import type { TitleImage, TitleImagePath } from '../../src/content/titleImages';

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`android:${name}="([^"]*)"`).exec(tag)?.[1];
}

export function parseVectorDrawable(xml: string, name = 'drawable'): TitleImage {
  const vector = /<vector\b[^>]*>/.exec(xml)?.[0];
  if (vector === undefined) throw new Error(`${name}: no <vector>`);
  const vw = Number(attr(vector, 'viewportWidth'));
  const vh = Number(attr(vector, 'viewportHeight'));
  if (!(vw > 0) || vw !== vh) throw new Error(`${name}: viewport must be square (${vw}×${vh})`);
  const paths: TitleImagePath[] = [];
  let clip: string | undefined;
  let depth = 0;
  for (const m of xml.matchAll(/<(\/?)(group|clip-path|path)\b([^>]*?)(\/?)>/g)) {
    const [, closing, el, body, selfClosing] = m as unknown as [string, string, string, string, string];
    if (el === 'group') {
      if (closing === '/') {
        depth--;
        clip = undefined;
      } else if (selfClosing !== '/') {
        if (depth > 0) throw new Error(`${name}: nested <group>`);
        depth++;
      }
    } else if (el === 'clip-path') {
      if (depth === 0 || clip !== undefined) throw new Error(`${name}: unexpected <clip-path>`);
      clip = attr(body, 'pathData');
    } else {
      const d = attr(body, 'pathData');
      const fill = attr(body, 'fillColor');
      const cap = attr(body, 'strokeLineCap');
      const w = Number(attr(body, 'strokeWidth'));
      if (d === undefined || !(w > 0)) throw new Error(`${name}: path without data or stroke width`);
      if (fill !== undefined && fill !== '#00000000') throw new Error(`${name}: filled path (${fill})`);
      if (cap !== 'square') throw new Error(`${name}: strokeLineCap ${cap}`);
      paths.push(clip === undefined ? { d, w } : { d, w, clip });
    }
  }
  if (paths.length === 0) throw new Error(`${name}: no paths`);
  return { size: vw, paths };
}
