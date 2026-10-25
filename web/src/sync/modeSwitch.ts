/**
 * Switching between local mode and server mode (`local/ServerMode`). Each mode has one source of
 * truth, so a switch replaces what is on the device: going to server mode clears local progress and
 * downloads everything; going back to local mode starts over from the bundled content, optionally
 * with the server account's progress imported (the `WaniKaniImporter` path).
 *
 * No silent data loss (plan, step 5c): leaving server mode with unsent uploads throws
 * `ServerError(reason 'pending')` unless the caller passes `discardPendingUploads: true` after the
 * learner confirmed (`switchToLocalQuestion` says how many will be lost). Flush first with
 * `flushBeforeLeaving`. The backup offer before going to server mode is UI: `backupBeforeServerSwitch`
 * is the operation.
 */
import type { Content } from '../core/content';
import {
  applyWaniKaniImport,
  parseDownload,
  type ApiEnvelope,
  type WaniKaniDownload,
} from '../core/importer';
import { adoptCurriculum, afterChange, createLearnerDb } from '../core/progression';
import { emptyProgress } from '../core/progressFile';
import {
  LOCAL_LEVEL_ONE,
  downloadInterruptedMessage,
  noTokenMessage,
  pendingUploadsBlockMessage,
  switchedToLocalMessage,
  switchedToServerMessage,
  type ServerUser,
} from '../core/server';
import type { FilesApi, HttpApi, SaveResult } from '../platform';
import { exportProgressFile } from '../progress/exportFile';
import { saveProgressFile } from '../progress/backup';
import { lastSavedStore, type KkDb } from '../storage/db';
import { readSnapshot, snapshotOf, STATE_KEYS, writeSnapshot } from '../storage/progressRepo';
import { ApiClient, type Clock, type RateLimiter } from './client';
import { checkConnection, ServerError, type SyncEngine } from './engine';
import { pendingUploads } from './queue';
import { resetServerData } from './reset';
import { KEYS, ServerStore, type TokenStore } from './store';

/** Saves the current progress file through the platform (the backup offer before switching). */
export async function backupBeforeServerSwitch(kk: KkDb, files: FilesApi, now: number = Date.now()): Promise<SaveResult> {
  const { name, text } = await exportProgressFile(kk, now);
  return saveProgressFile(files, lastSavedStore(kk), name, text, () => now);
}

/**
 * `ServerMode.switchToServer`: store the connection, clear local progress (the server's comes with
 * the first sync), WaniKani order. `user` is what `checkConnection` returned. The caller then runs
 * `engine.syncNow()`. From server mode to another server, unsent uploads block it like leaving.
 */
export async function switchToServer(kk: KkDb, o: {
  baseUrl: string;
  token: string;
  user: ServerUser;
  discardPendingUploads?: boolean;
  tokens?: TokenStore;
}): Promise<string> {
  const store = new ServerStore(kk, o.tokens);
  if ((await store.mode()) === 'server') {
    const pending = await pendingUploads(kk);
    const oldBase = await store.baseUrl();
    if (pending > 0 && !o.discardPendingUploads) throw new ServerError(pendingUploadsBlockMessage(oldBase ?? o.baseUrl, pending), 'pending');
  }
  await kk.transaction('rw', [kk.subjects, kk.levelProgression, kk.probation, kk.jumps, kk.levelTest, kk.session, kk.tasks, kk.serverSubjects, kk.state], async () => {
    await resetServerData(kk, store);
    // `Curriculum.onServerMode`: the server's levels are WaniKani's.
    await store.putMany({
      [KEYS.mode]: 'server',
      [KEYS.baseUrl]: o.baseUrl,
      // Record the account first, so the first user sync does not see a new account and reset again.
      [KEYS.userId]: o.user.id,
      [KEYS.username]: o.user.username ?? '',
      [STATE_KEYS.userLevel]: Math.max(1, o.user.level),
      [STATE_KEYS.ordering]: 'WANIKANI',
    });
  });
  await store.tokens.set(o.token);
  return switchedToServerMessage(o.baseUrl);
}

/** Sends what can be sent before leaving server mode; returns what is still pending. */
export async function flushBeforeLeaving(engine: SyncEngine): Promise<number> {
  await engine.flushUploads({ manual: true });
  return pendingUploads(engine.store.kk);
}

/**
 * `ServerMode.downloadForLocal`: the server account's progress (assignments, review statistics,
 * study materials, level progressions; never `/v2/reviews`, which OpenKani leaves empty), without
 * changing anything.
 */
export async function downloadForLocal(kk: KkDb, o: {
  http: HttpApi;
  appVersion?: string;
  clock?: Clock;
  limiter?: RateLimiter;
  tokens?: TokenStore;
  tries?: number;
  retryDelay?: number;
}): Promise<WaniKaniDownload> {
  const store = new ServerStore(kk, o.tokens);
  const baseUrl = (await store.baseUrl()) ?? '';
  const token = await store.token();
  if (token === null) throw new ServerError(noTokenMessage(baseUrl));
  const target = { ...o, baseUrl, token };
  const user = await checkConnection(target);
  const client = new ApiClient(target);
  const lists: Record<string, ApiEnvelope[]> = {};
  for (const name of ['assignments', 'review_statistics', 'study_materials', 'level_progressions']) {
    const items: ApiEnvelope[] = [];
    const r = await client.collection(`/v2/${name}`, (page) => { items.push(...page.items); });
    if (r.kind !== 'ok') throw new ServerError(downloadInterruptedMessage(baseUrl));
    lists[name] = items;
  }
  try {
    return parseDownload({
      user: { level: user.level, username: user.username },
      assignments: lists.assignments, review_statistics: lists.review_statistics,
      study_materials: lists.study_materials, level_progressions: lists.level_progressions,
    });
  } catch {
    throw new ServerError(downloadInterruptedMessage(baseUrl));
  }
}

/**
 * `ServerMode.switchToLocal`: local mode, starting over from the bundled content (level 1, the chosen
 * curriculum kept), then `download` applied if given. The queue is dropped only with
 * `discardPendingUploads` (else `ServerError` 'pending' when anything is unsent). The connection
 * (base URL, token) is kept for next time, like Java's `GlobalSettings.Api`.
 */
export async function switchToLocal(kk: KkDb, o: {
  content: Content;
  jlptKanji: ReadonlyMap<string, number>;
  now: number;
  download?: WaniKaniDownload | null;
  discardPendingUploads?: boolean;
  tokens?: TokenStore;
}): Promise<string> {
  const store = new ServerStore(kk, o.tokens);
  const pending = await pendingUploads(kk);
  if (pending > 0 && !o.discardPendingUploads) {
    throw new ServerError(pendingUploadsBlockMessage((await store.baseUrl()) ?? '', pending), 'pending');
  }
  const curriculum = (await readSnapshot(kk)).progress.curriculum;
  const ldb = createLearnerDb(o.content, o.jlptKanji);
  ldb.progress = emptyProgress(curriculum);
  adoptCurriculum(ldb, curriculum);
  let message = LOCAL_LEVEL_ONE;
  if (o.download) message = switchedToLocalMessage(applyWaniKaniImport(ldb, o.download, o.now));
  else afterChange(ldb, o.now);
  await kk.transaction('rw', [kk.subjects, kk.levelProgression, kk.probation, kk.jumps, kk.levelTest, kk.session, kk.tasks, kk.serverSubjects, kk.state], async () => {
    await resetServerData(kk, store);
    await writeSnapshot(kk, snapshotOf(ldb));
    await store.set(KEYS.mode, 'local');
  });
  return message;
}
