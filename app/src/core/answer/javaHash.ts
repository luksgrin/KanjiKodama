/**
 * Java's `String.hashCode` and the iteration order of a `java.util.HashSet<String>`, so a port can
 * walk a set in the order the Java app did (the first of several equally good answers wins, e.g.
 * `matchedAnswer` in the meaning checks).
 */

/** `String.hashCode`: s[0]*31^(n-1) + ... + s[n-1] over UTF-16 units, in 32-bit int arithmetic. */
export function javaStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * The iteration order of a `new HashSet<String>()` after `add`ing `items` in order (duplicates
 * ignored). HashMap puts a key in bucket `(h ^ (h >>> 16)) & (capacity - 1)`; the table starts at 16
 * and doubles whenever the size exceeds 0.75 × capacity, and resizing keeps each bucket's insertion
 * order, so iteration is by final bucket, then insertion. A null goes to bucket 0. (Buckets turn into trees only with 8+
 * colliding keys in a table of 64+, which word lists here never reach.)
 */
export function javaHashSetOrder<T extends string | null>(items: Iterable<T>): T[] {
  const unique: T[] = [];
  const seen = new Set<T>();
  for (const s of items) {
    if (seen.has(s)) continue;
    seen.add(s);
    unique.push(s);
  }
  let capacity = 16;
  while (unique.length > capacity * 0.75) capacity *= 2;
  const mask = capacity - 1;
  // HashMap.hash(null) is 0.
  const bucket = (s: T): number => {
    const h = s === null ? 0 : javaStringHash(s);
    return (h ^ (h >>> 16)) & mask;
  };
  return unique
    .map((s, i) => ({ s, i, b: bucket(s) }))
    .sort((x, y) => x.b - y.b || x.i - y.i)
    .map((x) => x.s);
}
