/**
 * The offline upload queue in the Dexie `tasks` table: lesson starts, reviews and study materials,
 * queued while answering (online or not) and sent in `ORDER BY priority, id` order by `flushQueue`.
 * Rows survive restarts; a failed task stays at the head with a backoff, a 401 keeps everything.
 * Decisions (order, requests, outcomes, backoff) are core `server/queue`.
 */
import { parseApiAssignment, parseApiReviewStatistic } from '../core/importer';
import { parseApiStudyMaterial } from '../core/answer/synonyms';
import {
  afterFailure,
  assignmentLookupUri,
  countPending,
  dueNow,
  mergeAssignment,
  mergeReviewStatistic,
  mergeStudyMaterial,
  orderTasks,
  parseEnvelope,
  parseStoredTask,
  reviewResourcesUpdated,
  taskOutcome,
  taskRequest,
  type LessonStartPayload,
  type QueuedTask,
  type ReviewPayload,
  type StudyMaterialPayload,
  type TaskOutcome,
} from '../core/server';
import type { KkDb, TaskRecord } from '../storage/db';
import type { ApiClient, CallResult } from './client';
import { mergeRow } from './rows';

async function enqueue(kk: KkDb, task: QueuedTask, now: number): Promise<number> {
  return (await kk.tasks.add({ kind: task.kind, payload: task.payload, createdAt: now, attempts: 0, nextAttemptAt: 0, lastError: null })) as number;
}

/** A finished lesson. */
export function enqueueLessonStart(kk: KkDb, p: LessonStartPayload, now: number = Date.now()): Promise<number> {
  return enqueue(kk, { kind: 'lessonStart', payload: { ...p } }, now);
}

/** A finished review. */
export function enqueueReview(kk: KkDb, p: ReviewPayload, now: number = Date.now()): Promise<number> {
  return enqueue(kk, { kind: 'review', payload: { ...p } }, now);
}

/** Notes and synonyms. */
export function enqueueStudyMaterial(kk: KkDb, p: StudyMaterialPayload, now: number = Date.now()): Promise<number> {
  return enqueue(kk, { kind: 'studyMaterial', payload: { ...p, meaningSynonyms: [...p.meaningSynonyms] } }, now);
}

/** The number of uploads still to send. */
export async function pendingUploads(kk: KkDb): Promise<number> {
  return countPending(await kk.tasks.toArray());
}

/** The queue as the UI shows it, in send order. */
export async function listQueue(kk: KkDb): Promise<TaskRecord[]> {
  return orderTasks(await kk.tasks.toArray());
}

/** Leaving server mode without sending: the learner confirmed losing these. */
export async function discardQueue(kk: KkDb): Promise<number> {
  const n = await kk.tasks.count();
  await kk.tasks.clear();
  return n;
}

export interface FlushResult {
  sent: number;
  dropped: number;
  remaining: number;
  /** Why the flush stopped early; null when the queue is empty or only not-yet-due tasks remain. */
  stop: null | { reason: 'rejected' } | { reason: 'failed'; message: string } | { reason: 'backoff'; until: number };
  /** A sent review had `justPassed`: sync assignments again. */
  refreshWanted: boolean;
}

function outcomeOf(r: CallResult): TaskOutcome {
  switch (r.kind) {
    case 'ok':
    case 'notModified':
      return taskOutcome('ok');
    case 'unauthorized':
      return taskOutcome('unauthorized');
    case 'unprocessable':
      return taskOutcome('unprocessable');
    case 'failed':
      return taskOutcome('error');
  }
}

function failureMessage(r: CallResult): string {
  return r.kind === 'failed' ? r.message : r.kind;
}

/** Writes what a sent task's response carries. */
async function applyResponse(kk: KkDb, task: QueuedTask, body: unknown): Promise<void> {
  if (task.kind === 'lessonStart') {
    const e = parseEnvelope(body);
    if (e !== null) {
      const a = parseApiAssignment(e);
      await mergeRow(kk, a.subjectId, (row) => mergeAssignment(row, a));
    }
  } else if (task.kind === 'review') {
    const r = reviewResourcesUpdated(body);
    if (r.assignment) {
      const a = parseApiAssignment(r.assignment);
      await mergeRow(kk, a.subjectId, (row) => mergeAssignment(row, a));
    }
    if (r.reviewStatistic) {
      const s = parseApiReviewStatistic(r.reviewStatistic);
      await mergeRow(kk, s.subjectId, (row) => mergeReviewStatistic(row, s));
    }
  } else {
    const e = parseEnvelope(body);
    if (e === null) return;
    let m;
    try {
      m = parseApiStudyMaterial(e);
    } catch {
      return; // an unreadable response still deletes the task
    }
    await mergeRow(kk, m.subjectId, (row) => mergeStudyMaterial(row, m));
  }
}

/** `findAssignmentId`'s API fallback: the last assignment listed for the subject (0 none). */
async function lookupAssignment(client: ApiClient, subjectId: number): Promise<{ id: number } | { failed: CallResult }> {
  let id = 0;
  const r = await client.collection(assignmentLookupUri(subjectId), (page) => {
    for (const item of page.items) id = item.id;
  });
  if (r.kind === 'ok') return { id };
  if (r.kind === 'notModified') return { id: 0 };
  return { failed: r };
}

/**
 * Sends due tasks in order, stopping at the first that fails (it gets a backoff) or at a 401 (all
 * kept). `force` (manual "Sync now") ignores the backoff. The engine records the API state from
 * the result.
 */
export async function flushQueue(kk: KkDb, client: ApiClient, now: () => number, force: boolean): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, dropped: 0, remaining: 0, stop: null, refreshWanted: false };
  for (const row of orderTasks(await kk.tasks.toArray())) {
    const task = parseStoredTask(row);
    if (task === null) continue; // unknown kind: left alone, never blocks the queue
    if (!dueNow(row, now(), force)) {
      result.stop = { reason: 'backoff', until: row.nextAttemptAt ?? 0 };
      break;
    }
    const subject = await kk.subjects.get(task.payload.subjectId);
    let assignmentId = typeof subject?.assignmentId === 'number' ? subject.assignmentId : 0;
    const studyMaterialId = typeof subject?.studyMaterialId === 'number' ? subject.studyMaterialId : 0;
    let r: CallResult | null = null;
    if (task.kind === 'lessonStart' && task.payload.assignmentId <= 0 && assignmentId <= 0) {
      const found = await lookupAssignment(client, task.payload.subjectId);
      if ('failed' in found) r = found.failed;
      else assignmentId = found.id;
    }
    if (r === null) {
      const req = taskRequest(task, { assignmentId, studyMaterialId }, now());
      if (req === null) {
        // No assignment anywhere: the task is deleted without sending.
        await kk.tasks.delete(row.id!);
        result.dropped++;
        continue;
      }
      r = await client.call(req.method, req.uri, req.body);
    }
    const outcome = outcomeOf(r);
    if (outcome === 'done') {
      await kk.transaction('rw', kk.tasks, kk.subjects, async () => {
        await applyResponse(kk, task, r.kind === 'ok' ? r.body : null);
        await kk.tasks.delete(row.id!);
      });
      result.sent++;
      if (task.kind === 'review' && task.payload.justPassed) result.refreshWanted = true;
    } else if (outcome === 'drop') {
      await kk.tasks.delete(row.id!);
      result.dropped++;
    } else if (outcome === 'rejected') {
      result.stop = { reason: 'rejected' };
      break;
    } else {
      const message = failureMessage(r);
      await kk.tasks.put(afterFailure(row, now(), message));
      result.stop = { reason: 'failed', message };
      break;
    }
  }
  result.remaining = await pendingUploads(kk);
  return result;
}
