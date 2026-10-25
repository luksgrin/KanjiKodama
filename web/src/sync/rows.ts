/** Read-merge-write of progress rows for server data (merges are core `server/merge`). */
import type { SubjectProgressRow } from '../core/progressFile/format';
import type { KkDb, SubjectRecord } from '../storage/db';

function rowOf(rec: SubjectRecord | undefined): SubjectProgressRow | undefined {
  if (rec === undefined) return undefined;
  const { id: _id, ...row } = rec;
  return row;
}

/** One subject's row through `f` (missing rows start from the defaults inside `f`). */
export async function mergeRow(kk: KkDb, subjectId: number, f: (row: SubjectProgressRow | undefined) => SubjectProgressRow): Promise<void> {
  const rec = await kk.subjects.get(subjectId);
  await kk.subjects.put({ ...f(rowOf(rec)), id: subjectId });
}

/** Many items into rows in one pass; later items for the same subject see earlier ones. */
export async function mergeRows<T>(kk: KkDb, items: readonly T[], subjectId: (t: T) => number,
  f: (row: SubjectProgressRow | undefined, t: T) => SubjectProgressRow): Promise<void> {
  if (items.length === 0) return;
  await kk.transaction('rw', kk.subjects, async () => {
    const ids = [...new Set(items.map(subjectId))];
    const recs = await kk.subjects.bulkGet(ids);
    const rows = new Map<number, SubjectProgressRow | undefined>(ids.map((id, i) => [id, rowOf(recs[i])]));
    for (const t of items) rows.set(subjectId(t), f(rows.get(subjectId(t)), t));
    await kk.subjects.bulkPut([...rows].map(([id, row]) => ({ ...row!, id })));
  });
}
