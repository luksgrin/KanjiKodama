/**
 * The dashboard on every recorded state of `scenarios/real-progress.json`, independent of the session
 * engine: each `dashboard` step's export (rebuilt from the recorded export deltas) is restored into a
 * fresh learner database at the step's clock, and the dashboard computed on it must equal the
 * recorded result. The scenario replay (scenarios.golden.test.ts) checks the same steps in sequence;
 * this one also reaches the steps after the review session while that replay is blocked.
 */

import { describe, expect, it } from 'vitest';
import { createLearnerDb, restoreIntoDb } from '../../src/core/progression';
import { firstDifference, readFixture } from './harness';
import { hasContentDb, loadContentWithExtras } from './content';
import { dashboardActions } from './scenario/actions/dashboard';
import { loadJlptKanji, type RunnerState } from './scenario/runner';

type ExportFile = Record<string, unknown> & { subjects: { id: number }[] };

interface Delta {
  fields: Record<string, unknown>;
  subjectsChanged: { id: number }[];
  subjectsRemoved: number[];
  subjectCount: number;
}

/** Applies a snapshot's export delta to the previous export. */
function applyDelta(before: ExportFile, delta: Delta): ExportFile {
  const rows = new Map(before.subjects.map((r) => [r.id, r]));
  for (const id of delta.subjectsRemoved) rows.delete(id);
  for (const r of delta.subjectsChanged) rows.set(r.id, r);
  const subjects = [...rows.values()].sort((a, b) => a.id - b.id);
  if (subjects.length !== delta.subjectCount) throw new Error(`delta gives ${subjects.length} subjects, recorded ${delta.subjectCount}`);
  return { ...before, ...delta.fields, subjects };
}

describe.skipIf(!hasContentDb())('dashboard on the recorded real-progress states', () => {
  it('matches every dashboard step', async () => {
    const content = await loadContentWithExtras();
    const jlptKanji = loadJlptKanji();
    const { cases } = readFixture('scenarios/real-progress.json');
    let current: ExportFile | null = null;
    let checked = 0;
    for (const c of cases) {
      const out = c.output as Record<string, unknown>;
      if ('export' in out) current = out.export as ExportFile;
      else if ('exportDelta' in out && current !== null) current = applyDelta(current, out.exportDelta as Delta);
      const input = c.input as { action?: string; atMs?: number };
      if (input.action !== 'dashboard' || current === null) continue;
      const db = createLearnerDb(content, jlptKanji);
      const now = out.clockMs as number;
      restoreIntoDb(db, JSON.stringify(current), now);
      const rs = { db, now, ext: {} } as unknown as RunnerState;
      const actual = dashboardActions.dashboard!({ rs, step: { action: 'dashboard' }, resolved: {}, recorded: {} });
      const diff = firstDifference(actual, out.result);
      expect(diff, `${c.name}: ${diff ?? ''}`).toBeNull();
      checked++;
    }
    expect(checked).toBe(5);
  }, 120_000);
});
