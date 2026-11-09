/**
 * Restoring a progress file, in two steps:
 *
 * 1. `previewImport(text)`: validate (core `describe`: JSON object, format tag, version not newer
 *    than supported, `subjects` a list; unknown keys ignored) and return
 *    the summary "Saved <date>, <order>, level N, M items with progress." for the confirmation.
 * 2. After the user confirms, `importProgress`: in ONE Dexie transaction, read the stored progress,
 *    apply core `restoreIntoDb` (reset, apply the subject fields, insert level progression,
 *    probation and jumps, adopt the curriculum, set the user level, recompute unlocks with
 *    `updateProgression`), write everything back and drop the session. The file's study activity
 *    log (`activity`, optional) is merged into the device's, each count the larger of the two, so
 *    restoring an older file never erases study days. Any failure aborts the transaction and leaves
 *    the database as it was.
 *
 * Local mode only (the screens hide it in server mode).
 */
import type { Content } from '../core/content';
import { TypedError, describe, type DateStyle } from '../core/progressFile';
import { hydrateLearnerDb, readSnapshot, snapshotOf, writeSnapshot } from '../storage/progressRepo';
import { PROGRESS_TABLES, type KkDb } from '../storage/db';
import { restoreIntoDb, type LearnerDb } from '../core/progression';
import { readActivity, type ActivityDay } from '../core/stats';
import { mergeActivityDays } from '../storage/activityRepo';
import { writingFromProgressFile } from '../core/writing';
import { mergeWritingRecords } from './writingStore';

/** A file that can't be restored; `message` is for the user. Nothing was changed. */
export class ProgressImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProgressImportError';
  }
}

export interface ImportPreview {
  /** The file text, to pass to `importProgress` after the confirmation. */
  text: string;
  /** "Saved Oct 17, 2025 12:00 AM, WaniKani order, level 3, 2 items with progress." */
  summary: string;
}

/** The device's time zone; the summary's date is printed in it. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** A user-facing message for a rejected file. */
function messageFor(e: TypedError): string {
  // `describe`'s own checks already have clear messages ("This is not a KanjiKodama progress
  // file.", "…made by a newer KanjiKodama."). JSON syntax and structure errors don't.
  if (e.errorType === 'IllegalArgumentException') return e.message;
  return `This is not a valid KanjiKodama progress file (${e.message}).`;
}

function rethrow(e: unknown): never {
  if (e instanceof TypedError) throw new ProgressImportError(messageFor(e), { cause: e });
  throw e;
}

/** Step 1: validates the file and returns the summary to confirm. Throws `ProgressImportError`. */
export function previewImport(text: string, timeZone: string = deviceTimeZone()): ImportPreview {
  const style: DateStyle = { locale: 'en-US', timeZone };
  try {
    return { text, summary: describe(text, style) };
  } catch (e) {
    rethrow(e);
  }
}

export interface ImportContext {
  content: Content;
  /** The `jlpt-kanji.tsv` data (character → JLPT level), for the curriculum layout. */
  jlptKanji: ReadonlyMap<string, number>;
  /** Epoch ms of the restore (new unlocks and level progression rows get it). */
  now?: number;
}

export interface ImportResult {
  userLevel: number;
  /** "Progress restored, level N." (the Android app's message). */
  message: string;
  /** The restored state, as now stored. */
  learner: LearnerDb;
  /** The study activity log after merging in the file's (`mergeActivity`), as now stored. */
  activity: Map<string, ActivityDay>;
}

/**
 * Step 2: replaces all progress with the file's, in one transaction. Throws `ProgressImportError`
 * for a rejected file (also when `previewImport` was skipped) and rethrows storage
 * errors; in both cases the database is unchanged.
 */
export async function importProgress(kk: KkDb, text: string, ctx: ImportContext): Promise<ImportResult> {
  // Validate before opening the transaction (cheap; the restore validates again).
  previewImport(text, 'UTC');
  const now = ctx.now ?? Date.now();
  let learner: LearnerDb | undefined;
  let activity: Map<string, ActivityDay> | undefined;
  try {
    await kk.transaction('rw', [...PROGRESS_TABLES.map((t) => kk.table(t)), kk.activity], async () => {
      const ldb = hydrateLearnerDb(ctx.content, ctx.jlptKanji, await readSnapshot(kk));
      restoreIntoDb(ldb, text, now); // synchronous; throws before changing anything stored
      await writeSnapshot(kk, snapshotOf(ldb));
      await kk.session.clear();
      activity = await mergeActivityDays(kk, readActivity(text));
      learner = ldb;
    });
  } catch (e) {
    rethrow(e);
  }
  // Writing practice records: merged, not replaced (the later practice of each item wins).
  await mergeWritingRecords(kk, writingFromProgressFile(text, new Set(learner!.table.keys())));
  const userLevel = learner!.progress.userLevel;
  return { userLevel, message: `Progress restored, level ${userLevel}.`, learner: learner!, activity: activity! };
}
