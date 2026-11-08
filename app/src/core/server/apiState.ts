/**
 * The API state and the sync schedule plus the task
 * priorities of the `Get*Task`s. Pure: the flags and times come in, decisions go out.
 */

/** `ApiState`. */
export type ApiState = 'API_KEY_MISSING' | 'API_KEY_REJECTED' | 'ERROR' | 'UNKNOWN' | 'EXPIRED' | 'REFRESH_USER_DATA' | 'OK';

export interface ApiFlags {
  hasToken: boolean;
  /** The token was rejected (a 401). */
  rejected: boolean;
  /** Other failures after the retries. */
  inError: boolean;
  /** `last_api_success` (epoch ms, 0 never). */
  lastApiSuccess: number;
  /** `last_user_sync_success`. */
  lastUserSync: number;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** `ApiState.getCurrentApiState` in server mode. */
export function currentApiState(f: ApiFlags, now: number): ApiState {
  if (!f.hasToken) return 'API_KEY_MISSING';
  if (f.rejected) return 'API_KEY_REJECTED';
  if (f.inError) return 'ERROR';
  if (f.lastApiSuccess === 0) return 'UNKNOWN';
  if (now - f.lastApiSuccess > HOUR) return 'EXPIRED';
  if (f.lastUserSync === 0 || now - f.lastUserSync > HOUR) return 'REFRESH_USER_DATA';
  return 'OK';
}

/** `ApiState.canGetUserData`. */
export function canGetUserData(s: ApiState): boolean {
  return s !== 'API_KEY_MISSING' && s !== 'API_KEY_REJECTED' && s !== 'ERROR';
}

/** The collections server mode downloads. */
export type CollectionName =
  | 'spaced_repetition_systems'
  | 'subjects'
  | 'assignments'
  | 'review_statistics'
  | 'study_materials'
  | 'level_progressions';

/** A step of a sync: the user, the upload queue, or a collection. */
export type SyncStep = 'user' | 'uploads' | CollectionName;

/** Step priorities (uploads: results 15, notes 16). */
export const STEP_PRIORITY: Readonly<Record<SyncStep, number>> = {
  user: 2,
  spaced_repetition_systems: 10,
  uploads: 15,
  subjects: 20,
  assignments: 21,
  review_statistics: 22,
  study_materials: 23,
  level_progressions: 26,
};

/** Last successful download of each collection (epoch ms, 0 never). */
export type SyncCursors = Readonly<Partial<Record<CollectionName, number>>>;

/** Collections fetched with `updated_after` (the SRS systems are always fetched whole). */
export const INCREMENTAL: ReadonlySet<CollectionName> = new Set<CollectionName>([
  'subjects', 'assignments', 'review_statistics', 'study_materials', 'level_progressions',
]);

/**
 * `assertRefreshForAllModels`: which steps a sync runs, in task-priority order. The user, the
 * uploads, assignments, review statistics, study materials and level progressions every time;
 * subjects when not fetched in the last hour; SRS systems when not in the last day.
 */
export function syncSteps(cursors: SyncCursors, now: number): SyncStep[] {
  const steps: SyncStep[] = ['user', 'uploads', 'assignments', 'review_statistics', 'study_materials', 'level_progressions'];
  const subjects = cursors.subjects ?? 0;
  if (subjects === 0 || now - subjects > HOUR) steps.push('subjects');
  const srs = cursors.spaced_repetition_systems ?? 0;
  if (srs === 0 || now - srs > DAY) steps.push('spaced_repetition_systems');
  return steps.sort((a, b) => STEP_PRIORITY[a] - STEP_PRIORITY[b]);
}

/**
 * The `updated_after` value: an hour before the
 * last success (clock skew margin), or 0 (fetch everything) when there was none.
 */
export function updatedAfter(cursors: SyncCursors, name: CollectionName): number {
  if (!INCREMENTAL.has(name)) return 0;
  const last = cursors[name] ?? 0;
  if (last === 0) return 0;
  return last >= HOUR ? last - HOUR : last;
}

/** The API path of a collection. */
export function collectionPath(name: CollectionName): string {
  return `/v2/${name}`;
}
