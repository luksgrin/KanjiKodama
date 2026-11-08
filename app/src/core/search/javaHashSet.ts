/**
 * The iteration order of a Java `HashSet` (a `HashMap` with default capacity 16 and load factor
 * 0.75), for the sets `AdvancedSearchParameters` serializes. Elements iterate by bucket
 * (`(h ^ h >>> 16) & (capacity - 1)`); within a bucket in insertion order, which resizing keeps.
 * (Buckets turn into trees only past 8 colliding entries, which never happens here.)
 */

/** `String.hashCode`. */
export function stringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** `Integer.hashCode`. */
export function integerHash(n: number): number {
  return n | 0;
}

/** Adds `values` in order to an empty `HashSet` and returns its iteration order (duplicates dropped). */
export function hashSetOrder<T>(values: Iterable<T>, hash: (v: T) => number): T[] {
  const unique: T[] = [];
  for (const v of values) if (!unique.includes(v)) unique.push(v);
  let capacity = 16;
  while (unique.length > capacity * 0.75) capacity *= 2;
  const bucket = (v: T): number => {
    const h = hash(v);
    return (h ^ (h >>> 16)) & (capacity - 1);
  };
  return unique.map((v, i) => ({ v, i, b: bucket(v) })).sort((a, b) => a.b - b.b || a.i - b.i).map((e) => e.v);
}
