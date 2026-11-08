/**
 * The dashboard's SRS breakdown: visible subjects per breakdown bucket (0 apprentice, 1 guru,
 * 2 master, 3 enlightened, 4 burned; initial and locked stages are left out).
 */

import { num, progressRow, srsSystemOf, type LearnerDb } from '../progression';

/** The number of breakdown buckets the dashboard shows. */
export const SRS_BREAKDOWN_BUCKETS = 5;

/** `getSrsBreakdownCount(0..4)`. */
export function computeSrsBreakdown(db: LearnerDb): number[] {
  const out = new Array<number>(SRS_BREAKDOWN_BUCKETS).fill(0);
  for (const s of db.content.subjects) {
    if (db.table.get(s.id)!.hiddenAt !== 0) continue;
    const stage = srsSystemOf(db, s.id).getStage(num(progressRow(db, s.id), 'srsStage'));
    if (stage.isInitial) continue;
    const bucket = stage.srsBreakdownBucket;
    if (bucket >= 0 && bucket < SRS_BREAKDOWN_BUCKETS) out[bucket]!++;
  }
  return out;
}

/**
 * The post-60 progression bar's counts (7 shallow or 11 deep buckets): every visible subject, locked
 * and initial ones included.
 */
export function computePost60Breakdown(db: LearnerDb, deep: boolean): number[] {
  const out = new Array<number>(deep ? 11 : 7).fill(0);
  for (const s of db.content.subjects) {
    if (db.table.get(s.id)!.hiddenAt !== 0) continue;
    const stage = srsSystemOf(db, s.id).getStage(num(progressRow(db, s.id), 'srsStage'));
    out[deep ? stage.findPost60DeepBucket() : stage.findPost60ShallowBucket()]!++;
  }
  return out;
}
