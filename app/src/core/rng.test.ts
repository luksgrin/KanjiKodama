import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JavaRandom, shuffleInPlace } from './rng';

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

// Reference values from the JDK: test/rng/RngRef.java writes test/rng/java-random.json.
const ref = JSON.parse(readFileSync(new URL('../../test/rng/java-random.json', import.meta.url), 'utf8')) as {
  cases: RefCase[];
};

describe('JavaRandom matches java.util.Random', () => {
  for (const c of ref.cases) {
    it(`seed ${c.seed}`, () => {
      // One generator for the draws, in the order RngRef made them.
      const r = new JavaRandom(BigInt(c.seed));
      expect(c.nextInt.map(() => r.nextInt())).toEqual(c.nextInt);
      expect(c.nextIntBound.map(([b]) => [b, r.nextInt(b)])).toEqual(c.nextIntBound);
      expect(c.nextLong.map(() => r.nextLong().toString())).toEqual(c.nextLong);
      expect(c.nextBoolean.map(() => r.nextBoolean())).toEqual(c.nextBoolean);
      expect(c.nextDouble.map(() => r.nextDouble())).toEqual(c.nextDouble);
      // Float.toString prints the shortest float text; Math.fround gets the float back.
      expect(c.nextFloat.map(() => r.nextFloat())).toEqual(c.nextFloat.map(Math.fround));

      // Collections.shuffle, chained on a fresh generator.
      const r2 = new JavaRandom(BigInt(c.seed));
      for (const expected of c.shuffle) {
        const list = expected.map((_, i) => i);
        expect(shuffleInPlace(list, r2)).toEqual(expected);
      }
    });
  }
});
