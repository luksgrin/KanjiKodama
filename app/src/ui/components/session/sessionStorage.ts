/**
 * The current session in the Dexie `session` table (Java keeps it in `session_item` plus the session
 * properties), so an interrupted session resumes after the app is closed or reloaded.
 *
 * Rows (key `subjectId`):
 * - one `item` row per session item: the `SessionItemRow` columns (`state`, `done`, `incorrect`, …);
 * - one `properties` row under key 0 (no subject has id 0): `sessionType`, `sessionOnkun`,
 *   `currentItemId`, `currentQuestionType` (Java's session properties) and what the summary and the
 *   end of the session need: `startedAt`, `startLevel` (level-ups and new unlocks) and `levelTestRound`.
 *
 * A progress restore and the server mode switches clear the table (`PROGRESS_TABLES`), as Java's reset
 * deletes the session items.
 */
import type { QuestionType } from '../../../core/answer/questionType';
import type { SessionItemRow, SessionItemState, SessionType, StoredSession } from '../../../core/session';
import { emptyStoredSession } from '../../../core/session';
import type { KkDb, SessionRecord } from '../../../storage/db';

/** The key of the properties row. */
export const SESSION_PROPERTIES_KEY = 0;

/** What the screens keep about a session beyond Java's properties. */
export interface SessionMeta {
  /** When the session started (epoch ms): unlocks at or after it are the summary's new unlocks. */
  startedAt: number;
  /** The user's level when the session started (the summary's level-ups). */
  startLevel: number;
  /** A level test round (self-study): the end of the session returns to the level test screen. */
  levelTestRound: 0 | 1 | 2;
}

export const NO_META: SessionMeta = { startedAt: 0, startLevel: 0, levelTestRound: 0 };

export interface SessionPropertiesRecord {
  subjectId: typeof SESSION_PROPERTIES_KEY;
  kind: 'properties';
  sessionType: SessionType;
  sessionOnkun: boolean;
  currentItemId: number;
  currentQuestionType: QuestionType | null;
  startedAt: number;
  startLevel: number;
  levelTestRound: 0 | 1 | 2;
}

export interface SessionItemRecord {
  subjectId: number;
  kind: 'item';
  assignmentId: number;
  state: SessionItemState;
  srsStageId: number;
  level: number;
  bucket: number;
  order: number;
  done: [boolean, boolean, boolean, boolean];
  incorrect: [number, number, number, number];
  numAnswers: number;
  lastAnswer: number;
}

const ITEM_STATES: readonly SessionItemState[] = ['ACTIVE', 'PENDING', 'REPORTED', 'ABANDONED'];
const SESSION_TYPES: readonly SessionType[] = ['LESSON', 'REVIEW', 'SELF_STUDY', 'NONE'];

/** The rows for a stored session (nothing when there is no session). */
export function sessionRecords(stored: StoredSession, meta: SessionMeta): (SessionPropertiesRecord | SessionItemRecord)[] {
  if (stored.sessionType === 'NONE' && stored.items.size === 0) return [];
  const out: (SessionPropertiesRecord | SessionItemRecord)[] = [{
    subjectId: SESSION_PROPERTIES_KEY,
    kind: 'properties',
    sessionType: stored.sessionType,
    sessionOnkun: stored.sessionOnkun,
    currentItemId: stored.currentItemId,
    currentQuestionType: stored.currentQuestionType,
    startedAt: meta.startedAt,
    startLevel: meta.startLevel,
    levelTestRound: meta.levelTestRound,
  }];
  for (const r of stored.items.values()) {
    out.push({
      subjectId: r.id, kind: 'item', assignmentId: r.assignmentId, state: r.state, srsStageId: r.srsStageId, level: r.level,
      bucket: r.bucket, order: r.order, done: [...r.done], incorrect: [...r.incorrect], numAnswers: r.numAnswers,
      lastAnswer: r.lastAnswer,
    });
  }
  return out;
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const bools = (v: unknown): [boolean, boolean, boolean, boolean] => {
  const a = Array.isArray(v) ? v : [];
  return [a[0] === true, a[1] === true, a[2] === true, a[3] === true];
};
const nums = (v: unknown): [number, number, number, number] => {
  const a = Array.isArray(v) ? v : [];
  return [num(a[0]), num(a[1]), num(a[2]), num(a[3])];
};

/** The stored session and meta from the rows (unreadable rows are skipped; no properties row: no session). */
export function fromSessionRecords(records: readonly SessionRecord[]): { stored: StoredSession; meta: SessionMeta } {
  const stored = emptyStoredSession();
  const props = records.find((r) => r.subjectId === SESSION_PROPERTIES_KEY && r.kind === 'properties');
  if (props === undefined) return { stored, meta: NO_META };
  const type = props.sessionType;
  stored.sessionType = SESSION_TYPES.includes(type as SessionType) ? (type as SessionType) : 'NONE';
  stored.sessionOnkun = props.sessionOnkun === true;
  stored.currentItemId = num(props.currentItemId);
  stored.currentQuestionType = typeof props.currentQuestionType === 'string' ? (props.currentQuestionType as QuestionType) : null;
  const round = props.levelTestRound;
  const meta: SessionMeta = {
    startedAt: num(props.startedAt),
    startLevel: num(props.startLevel),
    levelTestRound: round === 1 || round === 2 ? round : 0,
  };
  for (const r of records) {
    if (r.kind !== 'item' || r.subjectId === SESSION_PROPERTIES_KEY) continue;
    const state = r.state as SessionItemState;
    if (!ITEM_STATES.includes(state)) continue;
    const row: SessionItemRow = {
      id: r.subjectId, assignmentId: num(r.assignmentId), state, srsStageId: num(r.srsStageId), level: num(r.level),
      bucket: num(r.bucket), order: num(r.order), done: bools(r.done), incorrect: nums(r.incorrect),
      numAnswers: num(r.numAnswers), lastAnswer: num(r.lastAnswer),
    };
    stored.items.set(row.id, row);
  }
  return { stored, meta };
}

/** Replaces the table's rows with this session (one transaction). */
export async function saveSession(kk: KkDb, stored: StoredSession, meta: SessionMeta): Promise<void> {
  const rows = sessionRecords(stored, meta);
  await kk.transaction('rw', kk.session, async () => {
    await kk.session.clear();
    if (rows.length > 0) await kk.session.bulkPut(rows as unknown as SessionRecord[]);
  });
}

export async function loadSession(kk: KkDb): Promise<{ stored: StoredSession; meta: SessionMeta }> {
  return fromSessionRecords(await kk.session.toArray());
}
