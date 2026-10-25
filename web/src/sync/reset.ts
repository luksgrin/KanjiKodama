/**
 * `AppDatabase.resetDatabase` in server mode: drop everything downloaded or queued (progress rows,
 * level progressions, the session, the queue, server subjects, `mm_state.*`, sync cursors and
 * flags). The connection (base URL, token), `mode` and `curriculum` stay.
 */
import type { KkDb } from '../storage/db';
import type { ServerStore } from './store';

export async function resetServerData(kk: KkDb, store: ServerStore): Promise<void> {
  await kk.transaction('rw', [kk.subjects, kk.levelProgression, kk.probation, kk.jumps, kk.levelTest, kk.session, kk.tasks, kk.serverSubjects, kk.state], async () => {
    await Promise.all([
      kk.subjects.clear(), kk.levelProgression.clear(), kk.probation.clear(), kk.jumps.clear(), kk.levelTest.clear(),
      kk.session.clear(), kk.tasks.clear(), kk.serverSubjects.clear(),
    ]);
    const mm = await kk.state.where('key').startsWith('mm_state.').primaryKeys();
    await kk.state.bulkDelete(mm);
    await store.clearSyncState();
  });
}
