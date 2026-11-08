/**
 * A bit-exact port of java.util.Random (the 48-bit linear congruential generator) and of
 * Collections.shuffle, so seeded TypeScript code draws the same numbers as the Java app and the
 * golden fixtures can be replayed.
 *
 * The 48-bit state is kept as two 24-bit halves so every product stays below 2^53 and plain
 * doubles are exact. Only the seed scrambling and nextLong use BigInt.
 */

const TWO_24 = 0x1000000;
// 0x5DEECE66D split into 24-bit halves.
const MULT_HI = 0x5de;
const MULT_LO = 0xece66d;
const ADDEND = 0xb;
const MASK_48 = (1n << 48n) - 1n;

export class JavaRandom {
  private hi = 0;
  private lo = 0;

  /** `new Random(seed)`; the seed is a Java long (a bigint, or an integer number). */
  constructor(seed: bigint | number) {
    this.setSeed(seed);
  }

  /** `Random.setSeed`. */
  setSeed(seed: bigint | number): void {
    const s = (BigInt.asIntN(64, BigInt(seed)) ^ 0x5deece66dn) & MASK_48;
    this.hi = Number(s >> 24n);
    this.lo = Number(s & 0xffffffn);
  }

  /** `Random.next(bits)`: the top `bits` bits of the new state, as a signed 32-bit int. */
  next(bits: number): number {
    // state * 0x5DEECE66D + 0xB mod 2^48, on 24-bit halves (every product < 2^49).
    const oldLo = this.lo;
    const lo = oldLo * MULT_LO + ADDEND;
    this.lo = lo % TWO_24;
    this.hi = (this.hi * MULT_LO + oldLo * MULT_HI + Math.floor(lo / TWO_24)) % TWO_24;
    // state = hi * 2^24 + lo; take state >>> (48 - bits), then (int).
    const shift = 48 - bits;
    const value = shift >= 24
      ? Math.floor(this.hi / 2 ** (shift - 24))
      : this.hi * 2 ** (24 - shift) + Math.floor(this.lo / 2 ** shift);
    return value | 0;
  }

  /** `Random.nextInt()`. */
  nextInt(): number;
  /** `Random.nextInt(bound)`, 0 <= result < bound. */
  nextInt(bound: number): number;
  nextInt(bound?: number): number {
    if (bound === undefined) return this.next(32);
    if (!Number.isInteger(bound) || bound <= 0 || bound > 0x7fffffff) {
      throw new RangeError('bound must be positive');
    }
    let r = this.next(31);
    const m = bound - 1;
    if ((bound & m) === 0) {
      // (int)((bound * (long)r) >> 31); exact, since bound is a power of two.
      return Math.floor((bound * r) / 2 ** 31);
    }
    for (let u = r; ((u - (r = u % bound) + m) | 0) < 0; u = this.next(31)) {
      // rejection loop, as in Java
    }
    return r;
  }

  /** `Random.nextLong()`, as a bigint (a Java long). */
  nextLong(): bigint {
    const hi = BigInt(this.next(32));
    const lo = BigInt(this.next(32));
    return BigInt.asIntN(64, (hi << 32n) + lo);
  }

  /** `Random.nextBoolean()`. */
  nextBoolean(): boolean {
    return this.next(1) !== 0;
  }

  /** `Random.nextFloat()`. */
  nextFloat(): number {
    return this.next(24) / TWO_24;
  }

  /** `Random.nextDouble()`. */
  nextDouble(): number {
    return (this.next(26) * 2 ** 27 + this.next(27)) * 2 ** -53;
  }
}

/** The generator interface core code takes, so tests can pass a seeded JavaRandom. */
export type Rng = Pick<JavaRandom, 'nextInt' | 'nextBoolean' | 'nextDouble'>;

/** `Collections.shuffle(list, rnd)`: shuffles `list` in place and returns it. */
export function shuffleInPlace<T>(list: T[], rnd: Pick<JavaRandom, 'nextInt'>): T[] {
  for (let i = list.length; i > 1; i--) {
    const j = rnd.nextInt(i);
    const tmp = list[i - 1] as T;
    list[i - 1] = list[j] as T;
    list[j] = tmp;
  }
  return list;
}

/**
 * `ObjectSupport.shuffle(list)`: a new list made by repeatedly removing a random element
 * (`todo.remove(random.nextInt(todo.size()))`). Different draws from Collections.shuffle.
 */
export function shuffleByRemoval<T>(list: readonly T[], rnd: Pick<JavaRandom, 'nextInt'>): T[] {
  const todo = [...list];
  const result: T[] = [];
  while (todo.length > 0) {
    result.push(todo.splice(rnd.nextInt(todo.length), 1)[0] as T);
  }
  return result;
}
