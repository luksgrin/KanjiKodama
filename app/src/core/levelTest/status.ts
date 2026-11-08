/**
 * The level test's stored status (over `mm_state` and `mm_level_test`).
 * The rounds themselves come with the level-test flow.
 */

import type { LearnerDb } from '../progression/db';

/** `LevelTest.Status`. */
export const LEVEL_TEST_STATUSES = ['NONE', 'ROUND1', 'ROUND1_DONE', 'ROUND2', 'ROUND2_DONE'] as const;
export type LevelTestStatus = (typeof LEVEL_TEST_STATUSES)[number];

/** The "level_test" state; empty, missing or unknown is NONE. */
export function levelTestStatus(db: LearnerDb): LevelTestStatus {
  const s = db.state.get('level_test');
  return (LEVEL_TEST_STATUSES as readonly string[]).includes(s ?? '') ? (s as LevelTestStatus) : 'NONE';
}

/** Stores the status. */
export function setLevelTestStatus(db: LearnerDb, status: LevelTestStatus): void {
  db.state.set('level_test', status === 'NONE' ? '' : status);
}

/** Forget the test (answers, status, the active-round and prompted flags). */
export function discardLevelTest(db: LearnerDb): void {
  db.levelTest.clear();
  setLevelTestStatus(db, 'NONE');
  db.state.set('level_test_round_active', '');
  db.state.set('level_test_prompted', '');
}
