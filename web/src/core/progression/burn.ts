/**
 * Burn and resurrect in local mode: `activities/ResurrectActivity.doInBackground` and
 * `activities/BurnActivity.doInBackground` with `WebClient.resurrect`/`burn` returning true
 * (`LocalMode.isEnabled()`: "the caller patches the local assignment"), and the eligibility checks
 * `db/model/Subject.isResurrectable`/`isBurnable`.
 *
 * Java's eligibility also needs a WaniKani web password (`GlobalSettings.Api.getWebPassword`) and
 * Android 5+; neither means anything offline, so only the stage rules are ported (see the item page).
 */

import { num, patchAssignment, progressRow, srsSystemOf, type LearnerDb } from './db';

/** `Subject.getSrsStage`: the stage of the stored `srsStage` (-999 is Locked). */
function stageOf(db: LearnerDb, id: number) {
  return srsSystemOf(db, id).getStage(num(progressRow(db, id), 'srsStage'));
}

/** `Subject.isResurrectable` (stage part): the subject is burned (`getSrsStage().isCompleted()`). */
export function isResurrectable(db: LearnerDb, id: number): boolean {
  return stageOf(db, id).isCompleted;
}

/** `Subject.isBurnable` (stage part): not burned, and resurrected before (`getResurrectedAt() != 0`). */
export function isBurnable(db: LearnerDb, id: number): boolean {
  return !stageOf(db, id).isCompleted && num(progressRow(db, id), 'resurrectedAt') !== 0;
}

/**
 * `ResurrectActivity.doInBackground` (ResurrectActivity.java:158-161): back to the system's first
 * started stage (Apprentice I), available now, burnedAt 0, resurrectedAt now; unlockedAt, startedAt
 * and passedAt kept; `assignmentPatched` 1 (`SubjectSyncDao.patchAssignment`). Java patches whatever
 * the subject's state (the eligibility check only decides the counters): callers pass eligible ids.
 */
export function resurrectLocal(db: LearnerDb, id: number, now: number): void {
  const row = progressRow(db, id);
  patchAssignment(db, id, srsSystemOf(db, id).firstStartedStage.id, num(row, 'unlockedAt'), num(row, 'startedAt'),
    now, num(row, 'passedAt'), 0, now);
}

/**
 * `BurnActivity.doInBackground` (BurnActivity.java:158-161): to the completed (Burned) stage, no
 * review scheduled (availableAt 0), burnedAt now, resurrectedAt 0; the rest as in `resurrectLocal`.
 */
export function burnLocal(db: LearnerDb, id: number, now: number): void {
  const row = progressRow(db, id);
  patchAssignment(db, id, srsSystemOf(db, id).completedStage.id, num(row, 'unlockedAt'), num(row, 'startedAt'),
    0, num(row, 'passedAt'), now, 0);
}
