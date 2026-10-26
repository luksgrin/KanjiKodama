/**
 * Restoring a progress file (`ProgressPreferences` "Restore" → `ProgressStore.describe` and
 * `restore`), in two steps like the Android app:
 *
 * 1. `previewImport(text)`: validate (core `describe`: JSON object, format tag, version not newer
 *    than supported, `subjects` a list; unknown keys ignored, exactly the Java acceptance) and return
 *    the summary "Saved <date>, <order>, level N, M items with progress." for the confirmation.
 * 2. After the user confirms, `importProgress`: in ONE Dexie transaction, read the stored progress,
 *    apply core `restoreIntoDb` (reset, apply the subject fields, insert level progression,
 *    probation and jumps, adopt the curriculum, set the user level, recompute unlocks with
 *    `LocalProgression.update`), write everything back and drop the session. Any failure aborts the
 *    transaction and leaves the database as it was.
 *
 * Local mode only, like the Java app (the screens hide it in server mode).
 */
import type { Content } from '../core/content';
import { JavaException, describe, type DateStyle } from '../core/progressFile';
import { hydrateLearnerDb, readSnapshot, snapshotOf, writeSnapshot } from '../storage/progressRepo';
import { PROGRESS_TABLES, type KkDb } from '../storage/db';
import { restoreIntoDb, type LearnerDb } from '../core/progression';

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

/** The device's time zone; the summary's date is printed in it, like Java's default `TimeZone`. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** A user-facing message for a file the Java code rejects. */
function messageFor(e: JavaException): string {
  // `describe`'s own checks already have clear messages ("This is not a KanjiKodama progress
  // file.", "…made by a newer KanjiKodama."). JSON syntax and structure errors don't.
  if (e.javaClass === 'java.lang.IllegalArgumentException') return e.message;
  return `This is not a valid KanjiKodama progress file (${e.message}).`;
}

function rethrow(e: unknown): never {
  if (e instanceof JavaException) throw new ProgressImportError(messageFor(e), { cause: e });
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
}

/**
 * Step 2: replaces all progress with the file's, in one transaction. Throws `ProgressImportError`
 * for a file the Java app would reject (also when `previewImport` was skipped) and rethrows storage
 * errors; in both cases the database is unchanged.
 */
export async function importProgress(kk: KkDb, text: string, ctx: ImportContext): Promise<ImportResult> {
  // Validate before opening the transaction (cheap; the restore validates again).
  previewImport(text, 'UTC');
  const now = ctx.now ?? Date.now();
  let learner: LearnerDb | undefined;
  try {
    await kk.transaction('rw', PROGRESS_TABLES.map((t) => kk.table(t)), async () => {
      const ldb = hydrateLearnerDb(ctx.content, ctx.jlptKanji, await readSnapshot(kk));
      restoreIntoDb(ldb, text, now); // synchronous; throws before changing anything stored
      await writeSnapshot(kk, snapshotOf(ldb));
      await kk.session.clear();
      learner = ldb;
    });
  } catch (e) {
    rethrow(e);
  }
  const userLevel = learner!.progress.userLevel;
  return { userLevel, message: `Progress restored, level ${userLevel}.`, learner: learner! };
}
