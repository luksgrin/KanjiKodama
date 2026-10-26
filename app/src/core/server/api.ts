/**
 * WaniKani API v2 request and response shapes for server mode, as `tasks/ApiTask` and the
 * `Get*Task`s use them. Pure: builds URLs and bodies, parses responses; the HTTP lives in
 * `src/sync/`. Java: tasks/ApiTask, api/model/ApiUser, ApiSubscription, ApiStartAssignment,
 * ApiCreateReview, ApiUpdateStudyMaterial, util/TextUtil.formatTimestampForApi.
 */

import { parseTimestampFromApi, type ApiEnvelope } from '../importer/api';

/** `Constants.API_VERSION`: the `Wanikani-Revision` header. */
export const API_REVISION = '20170710';
/** `Identification.APP_NAME_UA`: User-Agent is `KanjiKodama/<version>`. */
export const APP_NAME_UA = 'KanjiKodama';
/** `Constants.NUM_API_TRIES`. */
export const NUM_API_TRIES = 3;
/** `Constants.API_RETRY_DELAY` (5 s). */
export const API_RETRY_DELAY = 5_000;
/** `ApiTask` connect timeout (10 s); read timeout one minute. */
export const API_READ_TIMEOUT = 60_000;
/** `ServerMode.migrate` read timeout: copying a whole account can take minutes. */
export const MIGRATE_READ_TIMEOUT = 10 * 60_000;

/**
 * `TextUtil.formatTimestampForApi`: `ISO_OFFSET_DATE_TIME` in UTC, e.g. `2023-11-14T22:13:20Z`,
 * `2023-11-14T22:13:20.5Z` (fraction only when non-zero, trailing zeros dropped). 0 gives null.
 */
export function formatTimestampForApi(ms: number): string | null {
  if (ms === 0) return null;
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const y = d.getUTCFullYear();
  const year = y >= 0 && y <= 9999 ? p(y, 4) : (y < 0 ? '-' : '+') + p(Math.abs(y), 4);
  let frac = '';
  const millis = d.getUTCMilliseconds();
  if (millis !== 0) frac = '.' + p(millis, 3).replace(/0+$/, '');
  return `${year}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}${frac}Z`;
}

/** `ApiTask.getApiCall`'s URL rule: absolute `http(s)://` URLs as is, else `base + uri`. */
export function apiUrl(baseUrl: string, uri: string): string {
  return uri.startsWith('https://') || uri.startsWith('http://') ? uri : baseUrl + uri;
}

/** A collection path with `?updated_after=` when there is a cursor (`Get*Task.runLocal`). */
export function collectionUri(path: string, updatedAfter: number): string {
  return updatedAfter !== 0 ? `${path}?updated_after=${formatTimestampForApi(updatedAfter)}` : path;
}

/** The request headers of `ApiTask.getApiCall` / `postApiCall`. */
export function apiHeaders(token: string, opts: { userAgent?: string; json?: boolean } = {}): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Wanikani-Revision': API_REVISION,
  };
  if (opts.json) h['Content-Type'] = 'application/json; charset=utf-8';
  if (opts.userAgent !== undefined) h['User-Agent'] = opts.userAgent;
  return h;
}

/** `APP_NAME_UA + "/" + VERSION_NAME`. */
export function userAgent(version: string): string {
  return `${APP_NAME_UA}/${version}`;
}

/** How a response status is handled (`ApiTask.getApiCall` / `postApiCall` catch blocks). */
export type StatusClass = 'ok' | 'notModified' | 'unauthorized' | 'tooManyRequests' | 'unprocessable' | 'error';

export function classifyStatus(status: number): StatusClass {
  if (status === 304) return 'notModified';
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'tooManyRequests';
  if (status === 422) return 'unprocessable';
  return 'error';
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * `ApiTask.parseEntity`'s check: an entity needs `data`, `data_updated_at`, `id` and `object`;
 * otherwise the API is put in error and the entity is dropped (null).
 */
export function parseEnvelope(v: unknown): (ApiEnvelope & { dataUpdatedAt: string | null }) | null {
  if (!isObject(v) || !('data' in v) || !('data_updated_at' in v) || !('id' in v) || !('object' in v)) return null;
  if (!isObject(v.data)) return null;
  const id = typeof v.id === 'number' ? Math.trunc(v.id) : Number.parseInt(String(v.id), 10);
  return {
    id: Number.isFinite(id) ? id : 0,
    object: String(v.object),
    data: v.data,
    dataUpdatedAt: typeof v.data_updated_at === 'string' ? v.data_updated_at : null,
  };
}

/** One page of a collection: its entities and `pages.next_url` (absolute, or null at the end). */
export interface CollectionPage {
  items: Array<ApiEnvelope & { dataUpdatedAt: string | null }>;
  nextUrl: string | null;
  /** Entities that failed `parseEnvelope` (Java sets the API error flag for each). */
  invalid: number;
}

/**
 * `ApiTask.collectionApiCall`, one page: `data` must be present (else null: the call failed);
 * `ApiTask.getNextUrl` reads `pages.next_url`.
 */
export function parseCollectionPage(body: unknown): CollectionPage | null {
  if (!isObject(body) || !('data' in body) || !Array.isArray(body.data)) return null;
  const items: CollectionPage['items'] = [];
  let invalid = 0;
  for (const el of body.data) {
    const e = parseEnvelope(el);
    if (e === null) invalid++;
    else items.push(e);
  }
  const pages = body.pages;
  const next = isObject(pages) && typeof pages.next_url === 'string' && pages.next_url !== '' ? pages.next_url : null;
  return { items, nextUrl: next, invalid };
}

/** `api/model/ApiUser` with the fields server mode uses. */
export interface ServerUser {
  /** The account id (a UUID on WaniKani); null when the server sends none. */
  id: string | null;
  username: string | null;
  level: number;
  /** `GetUserTask`: `subscription.max_level_granted`, or `max_level_granted_by_subscription` without a subscription. */
  maxLevelGranted: number;
  /** `current_vacation_started_at` (epoch ms, 0 none). */
  vacationStartedAt: number;
}

function int(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v)) return Number(v.trim());
  return 0;
}

/** `WaniKaniApiDateDeserializer`. */
function ms(v: unknown): number {
  return typeof v === 'string' ? parseTimestampFromApi(v.trim()) : 0;
}

/** `ApiTask.singleEntityApiCall("/v2/user", ApiUser.class)`: null when `data` is missing. */
export function parseServerUser(body: unknown): ServerUser | null {
  if (!isObject(body) || !isObject(body.data)) return null;
  const d = body.data;
  const sub = isObject(d.subscription) ? d.subscription : null;
  return {
    id: d.id === undefined || d.id === null ? null : String(d.id),
    username: d.username === undefined || d.username === null ? null : String(d.username),
    level: int(d.level),
    maxLevelGranted: sub === null ? int(d.max_level_granted_by_subscription) : int(sub.max_level_granted),
    vacationStartedAt: ms(d.current_vacation_started_at),
  };
}

/** `Constants.MONTH`. */
const MONTH = 30 * 24 * 3600_000;
/** `LocalMode.MAX_LEVEL`. */
export const MAX_LEVEL = 60;

/**
 * `PropertiesDao.getUserMaxLevelGranted` in server mode: the stored value while it was checked less
 * than a month ago, else 3 (the free levels).
 */
export function effectiveMaxLevelGranted(stored: number, checkedAt: number, now: number): number {
  if (checkedAt === 0 || now > checkedAt + MONTH) return 3;
  return stored;
}

/** Levels the subscription allows (`level <= maxLevelGranted`). */
export function levelAccessible(level: number, maxLevelGranted: number): boolean {
  return level <= maxLevelGranted;
}

/** `ApiStartAssignment` / `ApiCreateReview`: a time is only sent when older than 5 minutes. */
const FIVE_MINUTES = 5 * 60_000;
function pastTime(at: number, now: number): string | null {
  return at > 0 && now - at > FIVE_MINUTES ? formatTimestampForApi(at) : null;
}

/** `ReportSessionItemTask` (lesson): `PUT /v2/assignments/:id/start` body. */
export function startAssignmentBody(startedAt: number, now: number): { started_at: string | null } {
  return { started_at: pastTime(startedAt, now) };
}

/** `ReportSessionItemTask` (review): `POST /v2/reviews` body. */
export function createReviewBody(subjectId: number, meaningIncorrect: number, readingIncorrect: number, at: number, now: number) {
  return {
    review: {
      subject_id: subjectId,
      incorrect_meaning_answers: meaningIncorrect,
      incorrect_reading_answers: readingIncorrect,
      created_at: pastTime(at, now),
    },
  };
}

/** `SubmitStudyMaterialTask`: `POST /v2/study_materials` and `PUT /v2/study_materials/:id` body. */
export function studyMaterialBody(subjectId: number, meaningNote: string | null, readingNote: string | null, meaningSynonyms: readonly string[]) {
  return {
    study_material: {
      meaning_note: meaningNote,
      meaning_synonyms: [...meaningSynonyms],
      reading_note: readingNote,
      subject_id: subjectId,
    },
  };
}

/** `ReportSessionItemTask`: entities in a `POST /v2/reviews` response's `resources_updated`. */
export function reviewResourcesUpdated(body: unknown): { assignment: ApiEnvelope | null; reviewStatistic: ApiEnvelope | null } {
  if (!isObject(body) || !('id' in body) || !isObject(body.resources_updated)) return { assignment: null, reviewStatistic: null };
  const r = body.resources_updated;
  return { assignment: parseEnvelope(r.assignment), reviewStatistic: parseEnvelope(r.review_statistic) };
}

/** `ServerMode.migrate`: the token from a `POST /v2/migrate` response, or an error text. */
export function parseMigrateResponse(status: number, body: unknown): { token: string } | { error: string | null } {
  const token = isObject(body) ? body.token : undefined;
  if ((status === 200 || status === 409) && typeof token === 'string' && token !== '') return { token };
  const error = isObject(body) && typeof body.error === 'string' ? body.error : null;
  return { error };
}

/**
 * `GetSubjectsTask`: readings that are empty or "None" are dropped before storing (`Reading.isEmptyOrNone`).
 * Returns a copy of `data`.
 */
export function cleanSubjectData(data: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(data.readings)) return data;
  const readings = data.readings.filter((r) => {
    if (!isObject(r)) return true;
    const reading = r.reading;
    return !(reading === undefined || reading === null || reading === '' || reading === 'None');
  });
  return { ...data, readings };
}
