/**
 * `local/ProgressStore.restore` and `export` over a `LearnerDb`: the progress file applied the way
 * the Java app does it (reset, apply, adopt the file's curriculum mode, set the level, recompute
 * unlocks), and the file written from the current state.
 */

import { exportProgress, restoreProgress, type DateStyle } from '../progressFile';
import type { LearnerDb } from './db';
import { adoptCurriculum } from './curriculumDb';
import { afterChange } from './localProgression';

/** The locale and time zone `describe` checks run with; only the summary text depends on them. */
const RESTORE_STYLE: DateStyle = { locale: 'en-US', timeZone: 'UTC' };

/**
 * `ProgressStore.restore`: replace all progress with the file's. Throws the Java exception of a bad
 * file and leaves the state untouched. Any running session must be dropped by the caller (the Java
 * reset deletes the session items).
 */
export function restoreIntoDb(db: LearnerDb, json: string, now: number): void {
  const next = restoreProgress(json, new Set(db.table.keys()), RESTORE_STYLE);
  const mode = next.curriculum;
  next.curriculum = db.progress.curriculum;
  db.progress = next;
  adoptCurriculum(db, mode);
  afterChange(db, now);
}

/** `ProgressStore.export`: the file text at `now` (the `exportedAt`). */
export function exportFromDb(db: LearnerDb, now: number): string {
  return exportProgress(db.progress, now);
}
