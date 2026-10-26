/**
 * `util/OptimalStringAlignmentDistance.getDistance`: the optimal string alignment distance
 * (Levenshtein plus adjacent transpositions, no substring edited twice), on UTF-16 code units
 * like Java's `charAt`.
 */
export function osaDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const d: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    row[0] = i;
    d.push(row);
  }
  const d0 = d[0] as number[];
  for (let j = 0; j <= b.length; j++) d0[j] = j;

  for (let i = 0; i < a.length; i++) {
    const prev = d[i] as number[];
    const cur = d[i + 1] as number[];
    for (let j = 0; j < b.length; j++) {
      const cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
      let v = Math.min(Math.min((prev[j + 1] as number) + 1, (cur[j] as number) + 1), (prev[j] as number) + cost);
      if (i > 0 && j > 0 && a.charCodeAt(i) === b.charCodeAt(j - 1) && a.charCodeAt(i - 1) === b.charCodeAt(j)) {
        v = Math.min(v, ((d[i - 1] as number[])[j - 1] as number) + cost);
      }
      cur[j + 1] = v;
    }
  }
  return (d[a.length] as number[])[b.length] as number;
}
