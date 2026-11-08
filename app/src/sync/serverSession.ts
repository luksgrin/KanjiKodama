/**
 * Sessions in server mode: each finished lesson or review is predicted locally right away (core
 * `reportServer`: the "patched" assignment and statistic, so counts and the item page move at once)
 * and queued for the server. The server's data replaces the prediction on the next sync.
 *
 * The session's `report` hook runs inside `app.write` (synchronously), so it only collects; the app
 * controller drains the collected reports into the Dexie queue after the write is saved, then sends.
 */
import { reportServer, type ServerReport } from '../core/progression';
import type { SessionHooks } from '../core/session';
import type { KkDb } from '../storage/db';
import { enqueueLessonStart, enqueueReview } from './queue';

export interface ServerReporter {
  /** `base` with the server-mode `report` hook. */
  hooks(base: SessionHooks): SessionHooks;
  /** Reports collected since the last drain, in order. */
  drain(): ServerReport[];
  readonly pending: number;
}

export function createServerReporter(): ServerReporter {
  let collected: ServerReport[] = [];
  return {
    hooks(base) {
      return {
        ...base,
        report(db, report, now) {
          const r = reportServer(db, report, now);
          if (r !== null) collected.push(r);
        },
      };
    },
    drain() {
      const out = collected;
      collected = [];
      return out;
    },
    get pending() {
      return collected.length;
    },
  };
}

/** Queues the reports (`db.assertReportSessionItemTask`); returns how many were queued. */
export async function enqueueReports(kk: KkDb, reports: readonly ServerReport[], now: number = Date.now()): Promise<number> {
  for (const r of reports) {
    if (r.type === 'LESSON') await enqueueLessonStart(kk, { subjectId: r.subjectId, assignmentId: r.assignmentId, at: r.at }, now);
    else if (r.type === 'REVIEW') {
      await enqueueReview(kk, {
        subjectId: r.subjectId, assignmentId: r.assignmentId,
        meaningIncorrect: r.meaningIncorrect, readingIncorrect: r.readingIncorrect, at: r.at, justPassed: r.justPassed,
      }, now);
    }
  }
  return reports.length;
}
