/**
 * The JLPT curriculum order. Port of `local/JlptPlan`.
 *
 * Lays the WaniKani subjects out in JLPT blocks (N5, N4, N3, N2, N1, then Obscure for kanji on no
 * JLPT list):
 * - each block's kanji keep WaniKani's relative order and are split evenly into levels of at least
 *   {@link MIN_KANJI_PER_LEVEL} kanji, so that all blocks fit in {@link MAX_LEVELS} levels;
 * - a radical goes to the level of the first kanji that uses it;
 * - a vocabulary item goes to the level of its last component kanji;
 * - everything else (kana-only vocabulary, unused radicals, hidden subjects) goes to the first level
 *   holding kanji from its WaniKani level.
 *
 * The result depends on the order of `rows` (radicals without a kanji anchor keep row order within a
 * level), exactly as in Java.
 */

export const MAX_LEVELS = 60;
export const MIN_KANJI_PER_LEVEL = 30;
/** Block codes in curriculum order: N5 .. N1, then 0 for Obscure. */
export const BLOCKS: readonly number[] = [5, 4, 3, 2, 1, 0];

/** One subject as the planner sees it (`JlptPlan.Row`). */
export interface JlptPlanRow {
  readonly id: number;
  readonly object: string;
  readonly wkLevel: number;
  readonly wkPosition: number;
  readonly components: readonly number[];
  readonly hidden: boolean;
  readonly characters: string | null;
}

export interface JlptPlan {
  /** `[level, lessonPosition]` per subject id. */
  readonly placement: Map<number, readonly [number, number]>;
  /** `blockOfLevel[level - 1]` is the block code (5 = N5 ... 1 = N1, 0 = Obscure). */
  readonly blockOfLevel: number[];
}

/** `JlptPlan.blockName`: "N5" .. "N1", "Obscure" for 0. */
export function blockName(code: number): string {
  return code === 0 ? 'Obscure' : `N${code}`;
}

const INT_MAX = 2147483647;

/** `Comparator.comparingInt(wkLevel).thenComparingInt(wkPosition).thenComparingLong(id)`. */
function wkOrder(a: JlptPlanRow, b: JlptPlanRow): number {
  return compareNum(a.wkLevel, b.wkLevel) || compareNum(a.wkPosition, b.wkPosition) || compareNum(a.id, b.id);
}

function compareNum(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function ceilDiv(n: number, d: number): number {
  return Math.trunc((n + d - 1) / d);
}

/**
 * `JlptPlan.build`.
 *
 * @param rows every subject
 * @param jlpt kanji character to JLPT level (5 = N5 ... 1 = N1); missing means Obscure
 */
export function buildJlptPlan(rows: readonly JlptPlanRow[], jlpt: ReadonlyMap<string, number>): JlptPlan {
  const placement = new Map<number, readonly [number, number]>();
  const blockOfLevel: number[] = [];

  const kanjiByBlock = new Map<number, JlptPlanRow[]>();
  for (const b of BLOCKS) kanjiByBlock.set(b, []);
  const byId = new Map<number, JlptPlanRow>();
  for (const r of rows) {
    byId.set(r.id, r);
    if (!r.hidden && r.object === 'kanji') {
      const b = r.characters === null ? undefined : jlpt.get(r.characters);
      kanjiByBlock.get(b === undefined ? 0 : b)!.push(r);
    }
  }

  let perLevel = MIN_KANJI_PER_LEVEL;
  while (levelsNeeded(kanjiByBlock, perLevel) > MAX_LEVELS) perLevel++;

  // Kanji: blocks in order, each split evenly into consecutive levels.
  const level = new Map<number, number>();
  const kanjiOfLevel: JlptPlanRow[][] = [];
  for (const b of BLOCKS) {
    const kanji = kanjiByBlock.get(b)!;
    if (kanji.length === 0) continue;
    kanji.sort(wkOrder);
    const n = kanji.length;
    const levels = ceilDiv(n, perLevel);
    let start = 0;
    for (let i = 0; i < levels; i++) {
      const end = start + Math.trunc((n - start) / (levels - i));
      const chunk = kanji.slice(start, end);
      kanjiOfLevel.push(chunk);
      blockOfLevel.push(b);
      for (const r of chunk) level.set(r.id, kanjiOfLevel.length);
      start = end;
    }
  }
  const maxLevel = Math.max(1, kanjiOfLevel.length);

  // First new level holding kanji from each WaniKani level, for subjects without a better anchor.
  const fromWk = new Array<number>(MAX_LEVELS + 2).fill(INT_MAX);
  const clampWk = (wkLevel: number): number => Math.max(0, Math.min(fromWk.length - 1, wkLevel));
  kanjiOfLevel.forEach((chunk, i) => {
    for (const r of chunk) {
      const wl = clampWk(r.wkLevel);
      fromWk[wl] = Math.min(fromWk[wl]!, i + 1);
    }
  });
  let last = 1;
  for (let l = 0; l < fromWk.length; l++) {
    if (fromWk[l] === INT_MAX) fromWk[l] = last;
    last = fromWk[l]!;
  }

  // Radicals: the level of the first kanji using them.
  const radicalsOfLevel = new Map<number, JlptPlanRow[]>();
  const push = (m: Map<number, JlptPlanRow[]>, l: number, r: JlptPlanRow): void => {
    let list = m.get(l);
    if (list === undefined) m.set(l, (list = []));
    list.push(r);
  };
  kanjiOfLevel.forEach((chunk, i) => {
    for (const k of chunk) {
      for (const c of k.components) {
        const comp = byId.get(c);
        if (comp !== undefined && comp.object === 'radical' && !level.has(c)) {
          level.set(c, i + 1);
          push(radicalsOfLevel, i + 1, comp);
        }
      }
    }
  });

  // Everything else.
  const restOfLevel = new Map<number, JlptPlanRow[]>();
  for (const r of rows) {
    if (level.has(r.id)) continue;
    let l = 0;
    if (r.object === 'vocabulary') {
      for (const c of r.components) {
        const kl = level.get(c);
        if (kl !== undefined && byId.get(c)?.object === 'kanji') l = Math.max(l, kl);
      }
    }
    if (l === 0) l = fromWk[clampWk(r.wkLevel)]!;
    l = Math.max(1, Math.min(maxLevel, l));
    level.set(r.id, l);
    push(r.object === 'radical' ? radicalsOfLevel : restOfLevel, l, r);
  }

  // Lesson positions: radicals, then kanji, then vocabulary (in WaniKani order).
  const kanaLast = (r: JlptPlanRow): number => (r.object === 'kana_vocabulary' ? 1 : 0);
  for (let l = 1; l <= maxLevel; l++) {
    let pos = 0;
    for (const r of radicalsOfLevel.get(l) ?? []) placement.set(r.id, [l, ++pos]);
    if (l <= kanjiOfLevel.length) {
      for (const r of kanjiOfLevel[l - 1]!) placement.set(r.id, [l, ++pos]);
    }
    const rest = restOfLevel.get(l) ?? [];
    rest.sort((a, b) => compareNum(kanaLast(a), kanaLast(b)) || wkOrder(a, b));
    for (const r of rest) placement.set(r.id, [l, ++pos]);
  }
  if (blockOfLevel.length === 0) blockOfLevel.push(5);
  return { placement, blockOfLevel };
}

function levelsNeeded(kanjiByBlock: ReadonlyMap<number, readonly JlptPlanRow[]>, perLevel: number): number {
  let total = 0;
  for (const kanji of kanjiByBlock.values()) total += ceilDiv(kanji.length, perLevel);
  return total;
}
