/**
 * The lessons or reviews available at the pinned clock,
 * filtered by `{object, level, ids, exclude, limit}` and ordered like the app's queues. Session
 * actions use it too (`SessionDriver` gets it from the runner).
 */

import { progressRow, sqlAtMost, sqlIsZero, sqlNonZero, type LearnerDb } from '../../../src/core/progression';

/** A `where` filter of the DSL. */
export type Filter = Record<string, unknown> | null | undefined;

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

/** `appendFilter`: object IN, level IN, id IN, id NOT IN (an empty list matches nothing). */
export function matchesFilter(db: LearnerDb, id: number, filter: Filter): boolean {
  if (filter === null || filter === undefined) return true;
  const s = db.content.byId.get(id)!;
  const t = db.table.get(id)!;
  if ('object' in filter && !list(filter.object).map(String).includes(s.object)) return false;
  if ('level' in filter && !list(filter.level).map(Number).includes(t.level)) return false;
  if ('ids' in filter && !list(filter.ids).map(Number).includes(id)) return false;
  if ('exclude' in filter && list(filter.exclude).map(Number).includes(id)) return false;
  return true;
}

/** `LESSON_WHERE`: visible, level ≤ 60, not burned (or resurrected), unlocked, not started. */
export function isLessonRow(db: LearnerDb, id: number): boolean {
  const t = db.table.get(id)!;
  if (t.hiddenAt !== 0 || t.level > 60) return false;
  const row = progressRow(db, id);
  return (sqlNonZero(row.resurrectedAt) || sqlIsZero(row.burnedAt)) && sqlNonZero(row.unlockedAt) && sqlIsZero(row.startedAt);
}

/** `REVIEW_WHERE`: visible, level ≤ 60, with a due time. */
export function isReviewRow(db: LearnerDb, id: number): boolean {
  const t = db.table.get(id)!;
  return t.hiddenAt === 0 && t.level <= 60 && sqlNonZero(progressRow(db, id).availableAt);
}

/** Picks lessons or reviews with a filter. */
export function select(db: LearnerDb, now: number, filter: Filter, lessons: boolean): number[] {
  const rows: { id: number; level: number; pos: number; avail: number }[] = [];
  for (const s of db.content.subjects) {
    if (lessons ? !isLessonRow(db, s.id) : !isReviewRow(db, s.id)) continue;
    const avail = progressRow(db, s.id).availableAt;
    if (!lessons && !sqlAtMost(avail, now)) continue;
    if (!matchesFilter(db, s.id, filter)) continue;
    const t = db.table.get(s.id)!;
    rows.push({ id: s.id, level: t.level, pos: t.lessonPosition, avail: typeof avail === 'number' ? avail : 0 });
  }
  rows.sort((a, b) => (lessons ? 0 : a.avail - b.avail) || a.level - b.level || a.pos - b.pos || a.id - b.id);
  const ids = rows.map((r) => r.id);
  if (filter !== null && filter !== undefined && 'limit' in filter) return ids.slice(0, Math.max(0, Number(filter.limit)));
  return ids;
}
