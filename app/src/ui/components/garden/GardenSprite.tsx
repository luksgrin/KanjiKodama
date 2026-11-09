/**
 * The study garden's pixel sprites (core `stats/garden.ts` levels): soil, sprout, sapling, tree,
 * blossoming tree, 10 × 10 pixels drawn as SVG rects in the theme's colours (garden.css), so they
 * follow light, dark and the custom themes. A day after today is an empty dashed square.
 */
import { GARDEN_LEVEL_NAMES, type GardenLevel } from '../../../core/stats';
import './garden.css';

// S soil, s soil shade, L leaf, l stem, G canopy, g canopy shade, T trunk, P blossom. "." empty.
const SPRITES: readonly (readonly string[])[] = [
  [
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '...s..s...',
    '.SSSSSSSS.',
    'ssssssssss',
  ],
  [
    '..........',
    '..........',
    '..........',
    '..........',
    '...LL.....',
    '....lLL...',
    '....l.....',
    '....l.....',
    '.SSSSSSSS.',
    'ssssssssss',
  ],
  [
    '..........',
    '....LL....',
    '..LLlLL...',
    '...LlL....',
    '.LL.l.LL..',
    '..LLlLL...',
    '....l.....',
    '....l.....',
    '.SSSSSSSS.',
    'ssssssssss',
  ],
  [
    '...GGGG...',
    '..GGGGGG..',
    '.GGgGGGGG.',
    '.GGGGGgGG.',
    '..GgGGGG..',
    '...GGGG...',
    '....TT....',
    '....TT....',
    '.SSSSSSSS.',
    'ssssssssss',
  ],
  [
    '...GPGG...',
    '..GGGGPG..',
    '.GPgGGGGG.',
    '.GGGGPgGP.',
    '..GgGGPG..',
    '...PGGG...',
    '....TT....',
    '....TT....',
    '.SSSSSSSS.',
    'ssssssssss',
  ],
];

const CLASS: Readonly<Record<string, string>> = {
  S: 'soil', s: 'soil-shade', L: 'leaf', l: 'stem', G: 'canopy', g: 'canopy-shade', T: 'trunk', P: 'blossom',
};

/** Horizontal runs of one colour per row: [x, y, width, class]. */
function runs(rows: readonly string[]): [number, number, number, string][] {
  const out: [number, number, number, string][] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const ch = row[x]!;
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) w++;
      if (ch !== '.') out.push([x, y, w, CLASS[ch]!]);
      x += w;
    }
  });
  return out;
}

const RUNS = SPRITES.map(runs);

export function GardenSprite({ level, future = false, size = 32, label }: {
  level: GardenLevel;
  /** A day still to come: drawn as an empty plot. */
  future?: boolean;
  size?: number;
  /** Accessible name; the sprite is decorative without one. */
  label?: string;
}) {
  const a11y = label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };
  return (
    <svg className={`kk-garden-sprite${future ? ' future' : ''}`} viewBox="0 0 10 10" width={size} height={size}
      shapeRendering="crispEdges" data-level={future ? 'future' : level} {...a11y}>
      {future
        ? <rect x="0.5" y="0.5" width="9" height="9" className="kk-gs-future" />
        : RUNS[level]!.map(([x, y, w, c]) => <rect key={`${x},${y}`} x={x} y={y} width={w} height={1} className={`kk-gs-${c}`} />)}
    </svg>
  );
}

/** "Tree" etc. */
export function gardenLevelName(level: GardenLevel): string {
  return GARDEN_LEVEL_NAMES[level]!;
}
