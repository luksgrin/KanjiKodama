import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SeededRandom, shuffleInPlace } from './rng';

interface RefCase {
  seed: string;
  nextInt: number[];
  nextIntBound: [number, number][];
  nextLong: string[];
  nextBoolean: boolean[];
  nextDouble: number[];
  nextFloat: number[];
  shuffle: number[][];
}

// Recorded reference draws (test/rng/rng-reference.json).
const ref = JSON.parse(readFileSync(new URL('../../test/rng/rng-reference.json', import.meta.url), 'utf8')) as {
  cases: RefCase[];
};

describe('SeededRandom matches the recorded draws', () => {
  for (const c of ref.cases) {
    it(`seed ${c.seed}`, () => {
      // One generator for the draws, in the recorded order.
      const r = new SeededRandom(BigInt(c.seed));
      expect(c.nextInt.map(() => r.nextInt())).toEqual(c.nextInt);
      expect(c.nextIntBound.map(([b]) => [b, r.nextInt(b)])).toEqual(c.nextIntBound);
      expect(c.nextLong.map(() => r.nextLong().toString())).toEqual(c.nextLong);
      expect(c.nextBoolean.map(() => r.nextBoolean())).toEqual(c.nextBoolean);
      expect(c.nextDouble.map(() => r.nextDouble())).toEqual(c.nextDouble);
      // The recorded floats are their shortest text; Math.fround gets the float back.
      expect(c.nextFloat.map(() => r.nextFloat())).toEqual(c.nextFloat.map(Math.fround));

      // shuffleInPlace, chained on a fresh generator.
      const r2 = new SeededRandom(BigInt(c.seed));
      for (const expected of c.shuffle) {
        const list = expected.map((_, i) => i);
        expect(shuffleInPlace(list, r2)).toEqual(expected);
      }
    });
  }
});
