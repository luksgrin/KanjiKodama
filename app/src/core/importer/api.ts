/**
 * The WaniKani API v2 objects the importer reads (unknown properties ignored).
 */

/** A collection item as the API sends it: `{id, object, data}`. */
export interface ApiEnvelope {
  id: number;
  object: string;
  data: Record<string, unknown>;
}

/** The user, the fields the importer uses. */
export interface ApiUser {
  level: number;
  username: string | null;
}

/** An assignment. Times are epoch ms, 0 when absent. */
export interface ApiAssignment {
  id: number;
  subjectId: number;
  srsStageId: number;
  availableAt: number;
  burnedAt: number;
  passedAt: number;
  resurrectedAt: number;
  startedAt: number;
  unlockedAt: number;
}

/** A review statistic. */
export interface ApiReviewStatistic {
  id: number;
  subjectId: number;
  meaningCorrect: number;
  meaningIncorrect: number;
  meaningMaxStreak: number;
  meaningCurrentStreak: number;
  readingCorrect: number;
  readingIncorrect: number;
  readingMaxStreak: number;
  readingCurrentStreak: number;
  percentageCorrect: number;
}

/** A level progression. */
export interface ApiLevelProgression {
  id: number;
  level: number;
  abandonedAt: number;
  completedAt: number;
  createdAt: number;
  passedAt: number;
  startedAt: number;
  unlockedAt: number;
}

const ISO_OFFSET_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2}(?::\d{2})?)$/;

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * An API timestamp (ISO 8601 with an offset) in epoch ms
 * (fractions below a millisecond dropped), 0 for empty or unparseable text.
 */
export function parseTimestampFromApi(text: string | null): number {
  if (text === null || text === '') return 0;
  const m = ISO_OFFSET_DATE_TIME.exec(text);
  if (m === null) return 0;
  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number, number];
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (month < 1 || month > 12 || day < 1 || day > (month === 2 && !leap ? 28 : DAYS_IN_MONTH[month - 1]!)) return 0;
  if (hour > 23 || minute > 59 || second > 59) return 0;
  let offsetSeconds = 0;
  const zone = m[8]!;
  if (zone !== 'Z') {
    const [h, mi, s] = zone.slice(1).split(':').map(Number) as [number, number, number?];
    if (h > 18 || mi > 59 || (s ?? 0) > 59) return 0;
    offsetSeconds = (zone[0] === '-' ? -1 : 1) * (h * 3600 + mi * 60 + (s ?? 0));
    if (Math.abs(offsetSeconds) > 18 * 3600) return 0;
  }
  const millis = m[7] === undefined ? 0 : Math.trunc(Number(m[7].padEnd(9, '0')) / 1e6);
  return Date.UTC(year, month - 1, day, hour, minute, second) - offsetSeconds * 1000 + millis;
}

/** `WaniKaniApiDateDeserializer`: a string is parsed, anything else (null, numbers) is 0. */
function date(v: unknown): number {
  return typeof v === 'string' ? parseTimestampFromApi(v.trim()) : 0;
}

/** Jackson into a primitive `long`/`int` field: numbers truncated, numeric text parsed, null 0. */
function integer(v: unknown): number {
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string' && /^\s*[+-]?\d+\s*$/.test(v)) return Number(v.trim());
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

export function parseApiUser(data: Record<string, unknown>): ApiUser {
  return {
    level: integer(data.level),
    username: data.username === undefined || data.username === null ? null : String(data.username),
  };
}

export function parseApiAssignment(e: ApiEnvelope): ApiAssignment {
  const d = e.data;
  return {
    id: e.id,
    subjectId: integer(d.subject_id),
    srsStageId: integer(d.srs_stage),
    availableAt: date(d.available_at),
    burnedAt: date(d.burned_at),
    passedAt: date(d.passed_at),
    resurrectedAt: date(d.resurrected_at),
    startedAt: date(d.started_at),
    unlockedAt: date(d.unlocked_at),
  };
}

export function parseApiReviewStatistic(e: ApiEnvelope): ApiReviewStatistic {
  const d = e.data;
  return {
    id: e.id,
    subjectId: integer(d.subject_id),
    meaningCorrect: integer(d.meaning_correct),
    meaningIncorrect: integer(d.meaning_incorrect),
    meaningMaxStreak: integer(d.meaning_max_streak),
    meaningCurrentStreak: integer(d.meaning_current_streak),
    readingCorrect: integer(d.reading_correct),
    readingIncorrect: integer(d.reading_incorrect),
    readingMaxStreak: integer(d.reading_max_streak),
    readingCurrentStreak: integer(d.reading_current_streak),
    percentageCorrect: integer(d.percentage_correct),
  };
}

export function parseApiLevelProgression(e: ApiEnvelope): ApiLevelProgression {
  const d = e.data;
  return {
    id: e.id,
    level: integer(d.level),
    abandonedAt: date(d.abandoned_at),
    completedAt: date(d.completed_at),
    createdAt: date(d.created_at),
    passedAt: date(d.passed_at),
    startedAt: date(d.started_at),
    unlockedAt: date(d.unlocked_at),
  };
}
