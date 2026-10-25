/**
 * `tasks/WaniKaniImporter` for local mode: check a WaniKani token (`checkToken`), download the
 * account's progress (`download`: assignments, review statistics, study materials, level
 * progressions), then the screen applies it with core `applyWaniKaniImport` through `app.write`.
 * HTTP goes through the platform's `HttpApi` and the sync client (rate limiter, retries, pages).
 */
import { parseDownload, type ApiEnvelope, type WaniKaniDownload } from '../../../core/importer';
import { WANIKANI_API_BASE_URL, downloadInterruptedMessage, type ServerUser } from '../../../core/server';
import type { HttpApi } from '../../../platform';
import { ApiClient, type Clock, type RateLimiter } from '../../../sync/client';
import { ServerError, checkConnection } from '../../../sync/engine';

export interface ImportTarget {
  http: HttpApi;
  token: string;
  /** Java imports from the configured base URL, which is WaniKani's in local mode. */
  baseUrl?: string;
  appVersion?: string;
  clock?: Clock;
  limiter?: RateLimiter;
  tries?: number;
  retryDelay?: number;
}

const COLLECTIONS = ['assignments', 'review_statistics', 'study_materials', 'level_progressions'] as const;

/**
 * `WaniKaniImporter.checkToken`: the account behind the token, changing nothing.
 * @throws ServerError "WaniKani rejected this API token." / "Could not reach WaniKani. …"
 */
export function checkWaniKaniToken(t: ImportTarget): Promise<ServerUser> {
  return checkConnection({ ...t, baseUrl: t.baseUrl ?? WANIKANI_API_BASE_URL });
}

/**
 * `WaniKaniImporter.download`: everything, changing nothing.
 * @throws ServerError "The download from WaniKani was interrupted. Local progress was not changed."
 */
export async function downloadWaniKani(t: ImportTarget, user: ServerUser): Promise<WaniKaniDownload> {
  const baseUrl = t.baseUrl ?? WANIKANI_API_BASE_URL;
  const client = new ApiClient({ ...t, baseUrl });
  const lists: Partial<Record<(typeof COLLECTIONS)[number], ApiEnvelope[]>> = {};
  for (const name of COLLECTIONS) {
    const items: ApiEnvelope[] = [];
    const r = await client.collection(`/v2/${name}`, (page) => { items.push(...page.items); });
    if (r.kind !== 'ok') throw new ServerError(downloadInterruptedMessage(baseUrl));
    lists[name] = items;
  }
  try {
    return parseDownload({ user: { level: user.level, username: user.username }, ...lists });
  } catch {
    throw new ServerError(downloadInterruptedMessage(baseUrl));
  }
}
