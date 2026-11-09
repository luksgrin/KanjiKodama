/**
 * "Reset database": everything the app keeps about the subjects goes, the settings stay.
 *
 * Local mode (a reset means starting over from the bundled content): the subject rows (progress,
 * notes, synonyms, the star ratings and the writing practice records), the level progression and the session are cleared, the
 * level is 1 again, the curriculum stays and `updateProgression` unlocks level 1. The fast-travel
 * jumps, probation, level test and curriculum state are not part of the reset and stay; so do the
 * search presets.
 *
 * Server mode: `resetServerData` (downloads, queue, cursors), the star ratings and the writing records; the next sync
 * downloads everything again (`assertGetSubjectsTask`, `assertRefreshForAllModels`).
 */
import type { Content } from '../core/content';
import { updateProgression } from '../core/progression';
import { emptyProgress } from '../core/progressFile';
import { resetServerData } from '../sync/reset';
import type { ServerStore } from '../sync/store';
import { PROGRESS_TABLES, type KkDb } from '../storage/db';
import { hydrateLearnerDb, readSnapshot, snapshotOf, writeSnapshot } from '../storage/progressRepo';
import { clearWritingRecords } from './writingStore';

/** `meta` key of the star ratings (`ui/components/subject/starRatings.ts`). */
const STAR_RATINGS_META_KEY = 'starRatings';

/** The reset warning (the parts in `<b>` are bold). */
export const RESET_DATABASE_WARNING_PARTS: readonly (string | { b: string })[] = [
  { b: 'Warning:' }, ' Resetting the database will ', { b: 'clear all content' }, ' from'
  + " the app's database except for your settings. Any work in progress will be immediately lost and all data"
  + ' will be re-downloaded from WaniKani. This process may take a little while, depending on your level/device'
  + ' Are you sure you want to reset the database?',
];

export const RESET_DATABASE_WARNING = RESET_DATABASE_WARNING_PARTS.map((p) => (typeof p === 'string' ? p : p.b)).join('');

export interface LocalResetContext {
  content: Content;
  jlptKanji: ReadonlyMap<string, number>;
  now: number;
}

/** Local mode, in one transaction. */
export async function resetLocalDatabase(kk: KkDb, ctx: LocalResetContext): Promise<void> {
  await kk.transaction('rw', [...PROGRESS_TABLES.map((t) => kk.table(t)), kk.meta], async () => {
    const ldb = hydrateLearnerDb(ctx.content, ctx.jlptKanji, await readSnapshot(kk));
    const old = ldb.progress;
    ldb.progress = { ...emptyProgress(old.curriculum), probation: old.probation, jumps: old.jumps };
    updateProgression(ldb, ctx.now);
    await writeSnapshot(kk, snapshotOf(ldb)); // no orphan rows kept: everything goes
    await kk.session.clear();
    await kk.meta.delete(STAR_RATINGS_META_KEY);
  });
  await clearWritingRecords(kk);
}

/** Server mode. */
export async function resetServerDatabase(kk: KkDb, store: ServerStore): Promise<void> {
  await resetServerData(kk, store);
  await kk.meta.delete(STAR_RATINGS_META_KEY);
  await clearWritingRecords(kk);
}
