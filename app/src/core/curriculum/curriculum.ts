/**
 * The curriculum's pure parts: the two orders, level descriptions, the JLPT kanji list,
 * building the planner rows, and the placement counts behind `preview`/`place`. The database work
 * (rewriting the subject table, unlocking backfill kanji, `switchTo`, `adopt`) is the caller's.
 */

import { buildJlptPlan, blockName, type JlptPlanRow } from './jlptPlan';
import { placementOf, type Placement } from './placement';

/** `Curriculum.Mode`; the stored state uses the names ("WANIKANI", "JLPT"). */
export type CurriculumMode = 'WANIKANI' | 'JLPT';

export const CURRICULUM_MODE_LABEL: Readonly<Record<CurriculumMode, string>> = {
  WANIKANI: 'WaniKani order',
  JLPT: 'JLPT order',
};

/** The number of levels in WaniKani order. */
export const WANIKANI_MAX_LEVEL = 60;

/** Anything but "JLPT" (including null) is WaniKani order. */
export function parseCurriculumMode(s: string | null | undefined): CurriculumMode {
  return s === 'JLPT' ? 'JLPT' : 'WANIKANI';
}

/** The stored "blocks" state, a comma-separated list of block codes. */
export function parseBlocks(csv: string | null | undefined): number[] {
  if (csv === null || csv === undefined || csv === '') return [];
  return csv.split(',').map((s) => parseIntStrict(s.trim()));
}

/** The "blocks" state as `applyOrdering` writes it. */
export function formatBlocks(blocks: readonly number[]): string {
  return blocks.join(',');
}

/** The highest level of the current order. */
export function maxLevel(ordering: CurriculumMode, blocks: readonly number[]): number {
  return ordering === 'JLPT' && blocks.length > 0 ? blocks.length : WANIKANI_MAX_LEVEL;
}

/** "N4, level 2 of 5" in JLPT order, null in WaniKani order. */
export function describeLevel(ordering: CurriculumMode, blocks: readonly number[], level: number): string | null {
  return ordering === 'JLPT' ? describeBlockLevel(blocks, level) : null;
}

/** Null outside 1..blocks.length. */
export function describeBlockLevel(blocks: readonly number[], level: number): string | null {
  if (level < 1 || level > blocks.length) return null;
  const block = blocks[level - 1]!;
  let first = level;
  while (first > 1 && blocks[first - 2] === block) first--;
  let count = 0;
  for (const x of blocks) if (x === block) count++;
  return `${blockName(block)}, level ${level - first + 1} of ${count}`;
}

/**
 * The `jlpt-kanji.tsv`
 * asset, `character<TAB>level` per line; empty lines and `#` comments are skipped, lines without
 * exactly two tab-separated parts are ignored. Later lines win for a repeated character.
 */
export function parseJlptKanjiTsv(text: string): Map<string, number> {
  const out = new Map<string, number>();
  // Lines split on \n, \r and \r\n.
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line === '' || line.startsWith('#')) continue;
    const parts = splitFields(line, '\t');
    if (parts.length === 2) out.set(parts[0]!, parseIntStrict(parts[1]!.trim()));
  }
  return out;
}

/**
 * The stored `componentSubjectIds` JSON (`[1,2,3]`, possibly empty or
 * null), read by stripping the brackets and splitting on commas.
 */
export function parseIds(json: string | null | undefined): number[] {
  const body = (json ?? '').replaceAll('[', '').replaceAll(']', '').trim();
  if (body === '') return [];
  return body.split(',').map((s) => parseIntStrict(s.trim()));
}

/** A subject as the layout reads it from the subject table. */
export interface LayoutSubject {
  readonly id: number;
  readonly object: string;
  readonly characters: string | null;
  readonly componentSubjectIds: readonly number[];
  readonly hidden: boolean;
}

/**
 * The WaniKani order (`mm_wk_order`: `[level, lessonPosition]` per id)
 * gives each subject's WaniKani level and position; a subject missing there is treated as level 60,
 * position 0.
 */
export function layoutRows(
  subjects: readonly LayoutSubject[],
  wkOrder: ReadonlyMap<number, readonly [number, number]>,
): JlptPlanRow[] {
  return subjects.map((s) => {
    const w = wkOrder.get(s.id);
    return {
      id: s.id,
      object: s.object,
      wkLevel: w === undefined ? 60 : w[0],
      wkPosition: w === undefined ? 0 : w[1],
      components: s.componentSubjectIds,
      hidden: s.hidden,
      characters: s.characters,
    };
  });
}

/** The `[level, lessonPosition]` of every subject, plus the JLPT blocks. */
export interface CurriculumLayout {
  readonly placement: ReadonlyMap<number, readonly [number, number]>;
  readonly blocks: readonly number[];
}

/** WaniKani order is the stored order itself, without blocks. */
export function curriculumLayout(
  target: CurriculumMode,
  subjects: readonly LayoutSubject[],
  wkOrder: ReadonlyMap<number, readonly [number, number]>,
  jlpt: ReadonlyMap<string, number>,
): CurriculumLayout {
  if (target === 'WANIKANI') return { placement: wkOrder, blocks: [] };
  const plan = buildJlptPlan(layoutRows(subjects, wkOrder), jlpt);
  return { placement: plan.placement, blocks: plan.blockOfLevel };
}

/** A visible kanji's mastery, for placement (`passedAt != 0`). */
export interface PlacementKanji {
  readonly id: number;
  readonly passed: boolean;
}

/** What `preview` returns. */
export interface CurriculumPreview {
  readonly target: CurriculumMode;
  readonly placement: Placement;
  readonly levelDescription: string | null;
}

/**
 * Where switching to `target` would place the learner, without changing
 * anything. `kanji` are the visible kanji (`object = 'kanji' AND hiddenAt = 0`); a kanji the layout
 * does not place, or places outside the target's levels, is not counted.
 */
export function previewPlacement(
  target: CurriculumMode,
  layout: CurriculumLayout,
  kanji: Iterable<PlacementKanji>,
): CurriculumPreview {
  const levels = target === 'JLPT' ? Math.max(1, layout.blocks.length) : WANIKANI_MAX_LEVEL;
  const total = new Array<number>(levels).fill(0);
  const passed = new Array<number>(levels).fill(0);
  for (const k of kanji) {
    const p = layout.placement.get(k.id);
    if (p !== undefined && p[0] >= 1 && p[0] <= levels) {
      total[p[0] - 1]!++;
      if (k.passed) passed[p[0] - 1]!++;
    }
  }
  const placement = placementOf(total, passed);
  return {
    target,
    placement,
    levelDescription: target === 'JLPT' ? describeBlockLevel(layout.blocks, placement.level) : null,
  };
}

/** A visible kanji in the current order, for `place`. */
export interface PlacedKanji {
  readonly id: number;
  readonly level: number;
  readonly passed: boolean;
  /** `unlockedAt != 0`. */
  readonly unlocked: boolean;
}

/** What `place` decides; the caller applies it (unlock, level, progression). */
export interface PlaceResult {
  readonly placement: Placement;
  /** Locked visible kanji below the new level: unlocked now as lessons (`forceLessonAvailable`). */
  readonly backfillIds: number[];
}

/**
 * Placement, the pure part: count visible kanji per level of the current order (levels
 * outside 1..`levels` are ignored), place the learner, and list the backfill kanji. The caller then
 * makes each backfill kanji available as a lesson at `now`, clears `level_progression`, sets the user
 * level and runs `updateProgression`.
 *
 * @param levels `maxLevel()` of the current order
 * @param kanji the visible kanji, in subject-table order (backfill ids keep it)
 */
export function placeLearner(levels: number, kanji: readonly PlacedKanji[]): PlaceResult {
  const total = new Array<number>(levels).fill(0);
  const passed = new Array<number>(levels).fill(0);
  for (const k of kanji) {
    if (k.level >= 1 && k.level <= levels) {
      total[k.level - 1]!++;
      if (k.passed) passed[k.level - 1]!++;
    }
  }
  const placement = placementOf(total, passed);
  const backfillIds = kanji.filter((k) => !k.unlocked && k.level < placement.level).map((k) => k.id);
  return { placement, backfillIds };
}

/** `String.split(regex)` for a single literal char: trailing empty strings are removed. */
function splitFields(s: string, sep: string): string[] {
  const parts = s.split(sep);
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/** Strict integer parsing for the decimal strings stored here; throws `NumberFormatException`. */
function parseIntStrict(s: string): number {
  if (!/^[+-]?[0-9]+$/.test(s)) throw new Error(`NumberFormatException: For input string: "${s}"`);
  return Number(s);
}
