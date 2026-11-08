import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  describeBlockLevel, describeLevel, formatBlocks, maxLevel, parseBlocks, parseCurriculumMode, parseIds,
  parseJlptKanjiTsv, placeLearner, previewPlacement,
} from '../../src/core/curriculum/curriculum';
import { blockName, buildJlptPlan, type JlptPlan, type JlptPlanRow } from '../../src/core/curriculum/jlptPlan';
import { placementOf } from '../../src/core/curriculum/placement';
import { goldenSuite, readFixture } from './harness';

/** `[id, object, wkLevel, wkPosition, components, hidden, characters]`, see JlptPlanGolden. */
type RowTuple = [number, string, number, number, number[], boolean, string | null];

interface JlptPlanInput {
  rows: RowTuple[];
  jlpt: Record<string, number>;
}

function buildFromInput(input: JlptPlanInput): JlptPlan {
  const rows: JlptPlanRow[] = input.rows.map(([id, object, wkLevel, wkPosition, components, hidden, characters]) => ({
    id, object, wkLevel, wkPosition, components, hidden, characters,
  }));
  return buildJlptPlan(rows, new Map(Object.entries(input.jlpt)));
}

function planOutput(plan: JlptPlan): unknown {
  return {
    blockOfLevel: plan.blockOfLevel,
    blockNames: plan.blockOfLevel.map(blockName),
    placement: [...plan.placement.entries()].sort((a, b) => a[0] - b[0]).map(([id, [l, p]]) => [id, l, p]),
  };
}

goldenSuite<JlptPlanInput, unknown>('curriculum/jlpt-plan-synthetic.json', (input) => planOutput(buildFromInput(input)));

// "wk-content" carries the content rows and the jlpt map; "wk-content-summary" (no rows) summarizes
// the same plan per level.
goldenSuite<Partial<JlptPlanInput>, unknown>('curriculum/jlpt-plan-content.json', (input, _c, ctx) => {
  if (input.rows !== undefined) {
    const plan = buildFromInput(input as JlptPlanInput);
    ctx.state.plan = plan;
    ctx.state.objectOf = new Map(input.rows.map((r) => [r[0], r[1]]));
    return planOutput(plan);
  }
  const plan = ctx.state.plan as JlptPlan;
  const objectOf = ctx.state.objectOf as Map<number, string>;
  const n = plan.blockOfLevel.length;
  const kanji = new Array<number>(n + 1).fill(0);
  const subjects = new Array<number>(n + 1).fill(0);
  for (const [id, [l]] of plan.placement) {
    subjects[l]!++;
    if (objectOf.get(id) === 'kanji') kanji[l]!++;
  }
  return {
    levels: plan.blockOfLevel.map((block, i) => ({ level: i + 1, block, kanji: kanji[i + 1], subjects: subjects[i + 1] })),
  };
});

goldenSuite<{ kanjiTotal: number[]; kanjiPassed: number[] }, unknown>('curriculum/placement.json', (input) =>
  placementOf(input.kanjiTotal, input.kanjiPassed),
);

// --- helpers without their own fixture -----------------------------------------------------------

describe('curriculum helpers', () => {
  it('parses jlpt-kanji.tsv into the map JlptPlanGolden recorded', () => {
    const tsv = readFileSync(new URL('../../../content/inputs/jlpt-kanji.tsv', import.meta.url), 'utf8');
    const content = readFixture('curriculum/jlpt-plan-content.json');
    const first = [...content.cases][0]!.input as JlptPlanInput;
    expect(Object.fromEntries(parseJlptKanjiTsv(tsv))).toEqual(first.jlpt);
  });

  it('describes JLPT levels like Curriculum.describe', () => {
    const blocks = [5, 5, 4, 4, 4, 0];
    expect(describeBlockLevel(blocks, 1)).toBe('N5, level 1 of 2');
    expect(describeBlockLevel(blocks, 4)).toBe('N4, level 2 of 3');
    expect(describeBlockLevel(blocks, 6)).toBe('Obscure, level 1 of 1');
    expect(describeBlockLevel(blocks, 0)).toBeNull();
    expect(describeBlockLevel(blocks, 7)).toBeNull();
    expect(describeLevel('WANIKANI', blocks, 1)).toBeNull();
    expect(maxLevel('JLPT', blocks)).toBe(6);
    expect(maxLevel('JLPT', [])).toBe(60);
    expect(maxLevel('WANIKANI', blocks)).toBe(60);
  });

  it('parses stored state like Curriculum', () => {
    expect(parseIds('[1, 22,333]')).toEqual([1, 22, 333]);
    expect(parseIds('[]')).toEqual([]);
    expect(parseIds(null)).toEqual([]);
    expect(parseBlocks('5,4, 0')).toEqual([5, 4, 0]);
    expect(parseBlocks('')).toEqual([]);
    expect(formatBlocks([5, 4, 0])).toBe('5,4,0');
    expect(parseCurriculumMode('JLPT')).toBe('JLPT');
    expect(parseCurriculumMode('jlpt')).toBe('WANIKANI');
    expect(parseCurriculumMode(null)).toBe('WANIKANI');
  });

  it('places the learner and lists backfill kanji', () => {
    const kanji = [
      { id: 1, level: 1, passed: true, unlocked: true },
      { id: 6, level: 1, passed: true, unlocked: true },
      { id: 2, level: 1, passed: false, unlocked: false },
      { id: 3, level: 2, passed: false, unlocked: false },
      { id: 4, level: 3, passed: false, unlocked: false },
      { id: 5, level: 9, passed: false, unlocked: false },
    ];
    const result = placeLearner(3, kanji);
    expect(result.placement).toEqual({ level: 2, backfill: 1 });
    expect(result.backfillIds).toEqual([2]);
  });

  it('previews a switch from a layout', () => {
    const layout = { placement: new Map<number, readonly [number, number]>([[1, [1, 1]], [2, [1, 2]], [3, [2, 1]]]), blocks: [5, 4] };
    const preview = previewPlacement('JLPT', layout, [
      { id: 1, passed: true },
      { id: 2, passed: true },
      { id: 3, passed: false },
      { id: 99, passed: true },
    ]);
    expect(preview).toEqual({ target: 'JLPT', placement: { level: 2, backfill: 0 }, levelDescription: 'N4, level 1 of 1' });
  });
});
