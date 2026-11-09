import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStroke } from '../../ui/components/subject/strokePaths';
import { SeededRandom } from '../rng';
import {
  applyVerdict, currentCard, isCardDone, isClean, isFinished, judgeStroke, MAX_MISSES_PER_STROKE, missedCards, nextCard,
  polylineLength, requestHint, resample, selectWritingKanji, startWriting, type Point, type StrokeVerdict,
  type WritingCandidate,
} from './index';

// KanjiVG stroke data, the same file the content build reads.
const STROKES = JSON.parse(readFileSync(join(process.cwd(), '../content/inputs/raw/stroke_data.json'), 'utf8')) as Record<string, string[]>;
const kanji = (c: string): Point[][] => STROKES[c]!.map((d) => parseStroke(d).contours.flat());

/**
 * A stroke as a hand draws it: points every ~2 units (as pointer events come in), shifted, scaled and
 * turned a little, with a slow wobble and some jitter. `amount` 1 is a careful hand.
 */
function handDrawn(reference: readonly Point[], rnd: SeededRandom, amount = 1): Point[] {
  const pts = resample(reference, Math.max(2, Math.round(polylineLength(reference) / 2)));
  const u = (): number => rnd.nextDouble() * 2 - 1;
  const dx = u() * 6 * amount;
  const dy = u() * 6 * amount;
  const scale = 1 + u() * 0.15 * amount;
  const turn = u() * 0.14 * amount;
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const phase = rnd.nextDouble() * 6;
  return pts.map(([x, y], i) => {
    const t = i / pts.length;
    const X = (x - cx) * scale;
    const Y = (y - cy) * scale;
    return [
      cx + X * Math.cos(turn) - Y * Math.sin(turn) + dx + Math.sin(t * 7 + phase) * 1.5 * amount + u() * 0.8,
      cy + X * Math.sin(turn) + Y * Math.cos(turn) + dy + Math.cos(t * 5 + phase) * 1.5 * amount + u() * 0.8,
    ] as Point;
  });
}

const shift = (pts: readonly Point[], dx: number, dy: number): Point[] => pts.map(([x, y]) => [x + dx, y + dy] as Point);

describe('resample', () => {
  it('spaces points evenly and keeps the ends', () => {
    const r = resample([[0, 0], [10, 0], [10, 10]], 5);
    expect(r).toEqual([[0, 0], [5, 0], [10, 0], [10, 5], [10, 10]]);
  });
  it('handles a single point and an empty list', () => {
    expect(resample([[3, 4]], 3)).toEqual([[3, 4], [3, 4], [3, 4]]);
    expect(resample([], 3)).toEqual([]);
  });
});

describe('judgeStroke on real kanji', () => {
  it('accepts each stroke of 右 traced in order', () => {
    const strokes = kanji('右');
    const rnd = new SeededRandom(1);
    strokes.forEach((s, i) => expect(judgeStroke(handDrawn(s, rnd), strokes, i).ok).toBe(true));
  });

  it('says a backwards stroke is reversed', () => {
    const strokes = kanji('一');
    const v = judgeStroke([...strokes[0]!].reverse(), strokes, 0);
    expect(v).toMatchObject({ ok: false, miss: 'reversed' });
  });

  it('says a later stroke drawn first is the wrong order, and which one', () => {
    const strokes = kanji('三');
    expect(judgeStroke(strokes[2]!, strokes, 0)).toMatchObject({ ok: false, miss: 'wrong-order', resembles: 2 });
    const 十 = kanji('十');
    expect(judgeStroke(十[1]!, 十, 0)).toMatchObject({ ok: false, miss: 'wrong-order', resembles: 1 });
  });

  it('says the right shape in the wrong place is misplaced', () => {
    const strokes = kanji('三');
    // The first stroke, drawn far below where any stroke of 三 is.
    const v = judgeStroke(shift(strokes[0]!, 0, -22), strokes, 0);
    expect(v).toMatchObject({ ok: false, miss: 'misplaced' });
  });

  it('rejects a different shape in the right place', () => {
    const strokes = kanji('人');
    // A horizontal line across the first stroke instead of the left-falling sweep.
    const v = judgeStroke([[15, 55], [55, 55]], strokes, 0);
    expect(v.ok).toBe(false);
    expect(v.miss).toBe('wrong-shape');
    // A horizontal line where 十's vertical stroke goes.
    const 十 = kanji('十');
    expect(judgeStroke([[30, 55], [80, 55]], 十, 1).ok).toBe(false);
  });

  it('rejects a tap and a stroke far too short', () => {
    const strokes = kanji('一');
    expect(judgeStroke([[50, 50], [51, 50]], strokes, 0)).toMatchObject({ ok: false, miss: 'too-short' });
    expect(judgeStroke([[11, 54], [30, 53]], strokes, 0)).toMatchObject({ ok: false, miss: 'too-short' });
  });

  it('accepts a dot by its position', () => {
    const strokes = kanji('犬');
    const dot = strokes[strokes.length - 1]!;
    expect(polylineLength(dot)).toBeLessThan(20);
    const v = judgeStroke(handDrawn(dot, new SeededRandom(3), 0.5), strokes, strokes.length - 1);
    expect(v.ok).toBe(true);
  });

  it('positionScale gives a stroke more room', () => {
    const strokes = kanji('一');
    const off = shift(strokes[0]!, 0, 17);
    expect(judgeStroke(off, strokes, 0).ok).toBe(false);
    expect(judgeStroke(off, strokes, 0, { positionScale: 1.5 }).ok).toBe(true);
  });

  // Over a spread of the whole KanjiVG set: careful hands pass, the wrong stroke almost never does.
  it('accepts careful hand-drawn strokes and rejects other strokes across many kanji', () => {
    const rnd = new SeededRandom(7);
    const chars = Object.keys(STROKES).filter((_, i) => i % 25 === 0);
    let strokes = 0;
    let accepted = 0;
    let others = 0;
    let othersAccepted = 0;
    for (const c of chars) {
      const ref = kanji(c);
      for (let i = 0; i < ref.length; i++) {
        strokes++;
        if (judgeStroke(handDrawn(ref[i]!, rnd), ref, i).ok) accepted++;
        if (i + 1 < ref.length) {
          const j = i + 1 + rnd.nextInt(ref.length - i - 1);
          others++;
          if (judgeStroke(handDrawn(ref[j]!, rnd), ref, i).ok) othersAccepted++;
        }
      }
    }
    expect(strokes).toBeGreaterThan(2500);
    expect(accepted / strokes).toBeGreaterThan(0.99);
    expect(othersAccepted / others).toBeLessThan(0.01);
  });
});

const ok: StrokeVerdict = { ok: true, miss: null, resembles: null, comparison: { position: 1, shape: 0, direction: 1, lengthRatio: 1 } };
const miss: StrokeVerdict = { ...ok, ok: false, miss: 'wrong-shape' };

describe('practice round', () => {
  it('walks through the strokes and cards, recording a clean card', () => {
    let s = startWriting([{ id: 1, strokeCount: 2 }, { id: 2, strokeCount: 1 }], 'recall');
    expect(currentCard(s)?.id).toBe(1);
    expect(s.hint).toBe(false);
    s = applyVerdict(s, ok);
    expect(s.stroke).toBe(1);
    expect(isCardDone(s)).toBe(false);
    s = applyVerdict(s, ok);
    expect(isCardDone(s)).toBe(true);
    expect(applyVerdict(s, ok)).toBe(s); // nothing more to draw
    s = nextCard(s);
    expect(currentCard(s)?.id).toBe(2);
    s = nextCard(applyVerdict(s, ok));
    expect(isFinished(s)).toBe(true);
    expect(s.results.map(isClean)).toEqual([true, true]);
    expect(missedCards(s)).toEqual([]);
  });

  it('recall: a miss shows the hint; too many misses write the stroke for you', () => {
    let s = startWriting([{ id: 7, strokeCount: 2 }], 'recall');
    s = applyVerdict(s, miss);
    expect(s).toMatchObject({ stroke: 0, strokeMisses: 1, hint: true, last: miss });
    for (let k = 1; k < MAX_MISSES_PER_STROKE; k++) s = applyVerdict(s, miss);
    expect(s).toMatchObject({ stroke: 1, strokeMisses: 0, hint: false });
    expect(s.current).toEqual({ id: 7, misses: MAX_MISSES_PER_STROKE, hints: 0, revealed: 1 });
    s = nextCard(applyVerdict(s, ok));
    expect(missedCards(s)).toEqual([{ id: 7, strokeCount: 2 }]);
  });

  it('recall: Hint counts once per stroke', () => {
    let s = startWriting([{ id: 7, strokeCount: 2 }], 'recall');
    s = requestHint(requestHint(s));
    expect(s.current.hints).toBe(1);
    s = applyVerdict(s, ok);
    expect(s.hint).toBe(false);
    s = requestHint(s);
    expect(s.current.hints).toBe(2);
  });

  it('study: the hint is always on and Hint counts nothing', () => {
    let s = startWriting([{ id: 7, strokeCount: 2 }], 'study');
    expect(s.hint).toBe(true);
    s = requestHint(s);
    expect(s.current.hints).toBe(0);
    s = applyVerdict(applyVerdict(s, miss), ok);
    expect(s.hint).toBe(true);
  });

  it('drops cards without strokes and stays put at the end', () => {
    const s = startWriting([{ id: 1, strokeCount: 0 }], 'study');
    expect(isFinished(s)).toBe(true);
    expect(nextCard(s)).toBe(s);
    expect(requestHint(s)).toBe(s);
  });

  it('nextCard waits for the card to be done', () => {
    const s = startWriting([{ id: 1, strokeCount: 1 }], 'study');
    expect(nextCard(s)).toBe(s);
  });
});

describe('selectWritingKanji', () => {
  const c = (id: number, level: number, position: number, started: boolean, strokeCount = 3): WritingCandidate =>
    ({ id, level, position, started, strokeCount });
  const all = [c(5, 2, 1, true), c(4, 1, 2, true), c(3, 1, 1, false), c(2, 2, 2, false), c(1, 1, 3, true, 0)];

  it('learned: lesson done and with strokes, in curriculum order', () => {
    expect(selectWritingKanji(all, { kind: 'learned' }, 10, null)).toEqual([4, 5]);
  });
  it('level: every kanji of the level with strokes', () => {
    expect(selectWritingKanji(all, { kind: 'level', level: 1 }, 10, null)).toEqual([3, 4]);
  });
  it('limits and shuffles reproducibly', () => {
    expect(selectWritingKanji(all, { kind: 'level', level: 2 }, 1, null)).toEqual([5]);
    const a = selectWritingKanji(all, { kind: 'learned' }, 10, new SeededRandom(1));
    expect(a).toEqual(selectWritingKanji(all, { kind: 'learned' }, 10, new SeededRandom(1)));
    expect([...a].sort()).toEqual([4, 5]);
  });
});
