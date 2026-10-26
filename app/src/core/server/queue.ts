/**
 * The server-mode upload queue: what a queued task sends and what to do with the answer.
 * Java: tasks/ReportSessionItemTask (lesson start, review), tasks/SubmitStudyMaterialTask, the
 * `task_definition` order (`ORDER BY priority, id`) and `ApiTask.postApiCall`'s status handling.
 *
 * Differences from Java, on purpose:
 * - A study material that failed to send stays queued (Java drops it after the retries).
 * - The queue stops at the first task that still fails after the retries and backs off
 *   (`backoffDelay`), so later tasks never overtake it. Java stops the same way (the API goes into
 *   the error state) but then waits for the next sync or the learner's retry; the backoff only adds
 *   a floor between automatic attempts.
 */

import {
  createReviewBody,
  startAssignmentBody,
  studyMaterialBody,
  type StatusClass,
} from './api';
import type { HttpMethod } from './types';

export interface LessonStartPayload {
  subjectId: number;
  /** 0 when unknown: looked up when sending (`ReportSessionItemTask.findAssignmentId`). */
  assignmentId: number;
  /** When the lesson was done (epoch ms). */
  at: number;
}

export interface ReviewPayload {
  subjectId: number;
  assignmentId: number;
  meaningIncorrect: number;
  readingIncorrect: number;
  at: number;
  /** `justPassed`: Java then forces a late refresh (here: the caller syncs right after). */
  justPassed: boolean;
}

export interface StudyMaterialPayload {
  subjectId: number;
  meaningNote: string | null;
  readingNote: string | null;
  meaningSynonyms: string[];
}

export type QueuedTask =
  | { kind: 'lessonStart'; payload: LessonStartPayload }
  | { kind: 'review'; payload: ReviewPayload }
  | { kind: 'studyMaterial'; payload: StudyMaterialPayload };

export type TaskKind = QueuedTask['kind'];

/** A stored task (the Dexie `tasks` row shape). */
export interface StoredTask {
  id?: number;
  kind: string;
  payload: unknown;
  createdAt: number;
  /** Failed send attempts so far (each after `NUM_API_TRIES` tries). */
  attempts?: number;
  /** No automatic attempt before this time (epoch ms). */
  nextAttemptAt?: number;
  lastError?: string | null;
}

export const TASK_PRIORITY: Readonly<Record<TaskKind, number>> = {
  lessonStart: 15,
  review: 15,
  studyMaterial: 16,
};

export function isTaskKind(k: string): k is TaskKind {
  return k === 'lessonStart' || k === 'review' || k === 'studyMaterial';
}

/** `ORDER BY priority, id`: the order tasks are sent in. Unknown kinds go last (and are skipped). */
export function orderTasks<T extends StoredTask>(tasks: readonly T[]): T[] {
  const prio = (t: T) => (isTaskKind(t.kind) ? TASK_PRIORITY[t.kind] : 1000);
  return [...tasks].sort((a, b) => prio(a) - prio(b) || (a.id ?? 0) - (b.id ?? 0));
}

/** Pause after the n-th failed attempt: 30 s, 1, 2, 4 … minutes, at most an hour. */
export function backoffDelay(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(30_000 * 2 ** (attempts - 1), 3600_000);
}

/** Whether an automatic flush may try this task now (a manual "Sync now" ignores the backoff). */
export function dueNow(t: StoredTask, now: number, force: boolean): boolean {
  return force || (t.nextAttemptAt ?? 0) <= now;
}

/** One HTTP call of a task. */
export interface TaskRequest {
  method: HttpMethod;
  uri: string;
  body: unknown;
}

/**
 * What to send for a task. `studyMaterialId` and `assignmentId` are the current stored values for
 * the subject (0 none). Null: nothing can be sent (a lesson whose assignment is still unknown after
 * the lookup); Java then deletes the task.
 */
export function taskRequest(t: QueuedTask, stored: { assignmentId: number; studyMaterialId: number }, now: number): TaskRequest | null {
  switch (t.kind) {
    case 'lessonStart': {
      const id = t.payload.assignmentId > 0 ? t.payload.assignmentId : stored.assignmentId;
      if (id <= 0) return null;
      return { method: 'PUT', uri: `/v2/assignments/${id}/start`, body: startAssignmentBody(t.payload.at, now) };
    }
    case 'review': {
      const p = t.payload;
      return { method: 'POST', uri: '/v2/reviews', body: createReviewBody(p.subjectId, p.meaningIncorrect, p.readingIncorrect, p.at, now) };
    }
    case 'studyMaterial': {
      const p = t.payload;
      const body = studyMaterialBody(p.subjectId, p.meaningNote, p.readingNote, p.meaningSynonyms);
      return stored.studyMaterialId === 0
        ? { method: 'POST', uri: '/v2/study_materials', body }
        : { method: 'PUT', uri: `/v2/study_materials/${stored.studyMaterialId}`, body };
    }
  }
}

/** `ReportSessionItemTask.findAssignmentId`'s fallback lookup. */
export function assignmentLookupUri(subjectId: number): string {
  return `/v2/assignments?subject_ids=${subjectId}`;
}

/**
 * What happens to a task after its call (with the retries done):
 * - `done`: sent; delete it.
 * - `drop`: the server refused it (422, `postApiCall` returns `NullNode`); delete it.
 * - `rejected`: 401; keep it and stop everything until a new token.
 * - `retryLater`: anything else (network, 5xx, 429 after the retries); keep it, stop the flush.
 */
export type TaskOutcome = 'done' | 'drop' | 'rejected' | 'retryLater';

export function taskOutcome(status: StatusClass | 'network'): TaskOutcome {
  switch (status) {
    case 'ok':
    case 'notModified':
      return 'done';
    case 'unprocessable':
      return 'drop';
    case 'unauthorized':
      return 'rejected';
    default:
      return 'retryLater';
  }
}

/** The stored task after a failed attempt. */
export function afterFailure<T extends StoredTask>(t: T, now: number, error: string): T {
  const attempts = (t.attempts ?? 0) + 1;
  return { ...t, attempts, nextAttemptAt: now + backoffDelay(attempts), lastError: error };
}

/** Parses a stored task; null for rows of unknown kinds or malformed payloads. */
export function parseStoredTask(t: StoredTask): QueuedTask | null {
  if (!isTaskKind(t.kind) || typeof t.payload !== 'object' || t.payload === null) return null;
  const p = t.payload as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  if (typeof p.subjectId !== 'number') return null;
  switch (t.kind) {
    case 'lessonStart':
      return { kind: 'lessonStart', payload: { subjectId: p.subjectId, assignmentId: n(p.assignmentId), at: n(p.at) } };
    case 'review':
      return {
        kind: 'review',
        payload: {
          subjectId: p.subjectId, assignmentId: n(p.assignmentId), meaningIncorrect: n(p.meaningIncorrect),
          readingIncorrect: n(p.readingIncorrect), at: n(p.at), justPassed: p.justPassed === true,
        },
      };
    case 'studyMaterial': {
      const text = (v: unknown) => (typeof v === 'string' ? v : null);
      const syn = Array.isArray(p.meaningSynonyms) ? p.meaningSynonyms.filter((s): s is string => typeof s === 'string') : [];
      return { kind: 'studyMaterial', payload: { subjectId: p.subjectId, meaningNote: text(p.meaningNote), readingNote: text(p.readingNote), meaningSynonyms: syn } };
    }
  }
}

/** `ServerMode.pendingUploads`: answers, lesson starts and notes still to send. */
export function countPending(tasks: readonly StoredTask[]): number {
  return tasks.filter((t) => isTaskKind(t.kind)).length;
}
