/**
 * Writing practice from the test side: a kanji's KanjiVG strokes (from the e2e build's content DB, the
 * file the browser loads) as points, and drawing them on the writing square with the mouse.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import initSqlJs from 'sql.js';
import { parseStroke } from '../../../src/ui/components/subject/strokePaths';
import { DIST_DIR } from './paths';

export type Pt = readonly [number, number];

let table: Promise<Map<number, string[]>> | null = null;

async function load(): Promise<Map<number, string[]>> {
  const manifest = JSON.parse(readFileSync(join(DIST_DIR, 'content', 'content-manifest.json'), 'utf8')) as { file: string };
  const require = createRequire(import.meta.url);
  const SQL = await initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) });
  const d = new SQL.Database(readFileSync(join(DIST_DIR, 'content', manifest.file)));
  try {
    const rows = d.exec('SELECT id, data FROM stroke_data')[0]?.values ?? [];
    return new Map(rows.map((r) => [Number(r[0]), JSON.parse(String(r[1])) as string[]]));
  } finally {
    d.close();
  }
}

/** The subject's strokes as polylines in the 109×109 box. */
export async function strokesOf(id: number): Promise<Pt[][]> {
  table ??= load();
  const paths = (await table).get(id);
  if (paths === undefined) throw new Error(`no stroke data for subject ${id}`);
  return paths.map((d) => parseStroke(d).contours.flat());
}

/** Draws one stroke (box units) on the writing square with the mouse. */
export async function drawStroke(page: Page, points: readonly Pt[]): Promise<void> {
  const box = await page.getByTestId('writing-pad').boundingBox();
  if (box === null) throw new Error('writing square not visible');
  const at = ([x, y]: Pt): [number, number] => [box.x + (x / 109) * box.width, box.y + (y / 109) * box.height];
  const first = at(points[0]!);
  await page.mouse.move(first[0], first[1]);
  await page.mouse.down();
  // Every few points, as pointer events come in.
  for (let i = 1; i < points.length; i += 2) {
    const p = at(points[i]!);
    await page.mouse.move(p[0], p[1]);
  }
  const last = at(points[points.length - 1]!);
  await page.mouse.move(last[0], last[1]);
  await page.mouse.up();
}

/** The current kanji on the writing screen. */
export async function currentWritingId(page: Page): Promise<number> {
  return Number(await page.getByTestId('writing-screen').getAttribute('data-subject-id'));
}

/** Writes every remaining stroke of the current kanji correctly, checking each is accepted. */
export async function writeKanji(page: Page): Promise<void> {
  const strokes = await strokesOf(await currentWritingId(page));
  const pad = page.getByTestId('writing-pad');
  const from = Number(await pad.getAttribute('data-written'));
  for (let i = from; i < strokes.length; i++) {
    await drawStroke(page, strokes[i]!);
    await expect(pad).toHaveAttribute('data-written', String(i + 1));
  }
}
