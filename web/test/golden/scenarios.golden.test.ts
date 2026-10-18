/**
 * The golden scenarios (`scenarios/*.json`): each fixture replays one scenario step by step on the
 * TypeScript core (see scenario/runner.ts and scenario/README.md). Steps after a failed one are
 * reported as blocked rather than compared against a diverged state.
 */

import { firstDifference, goldenSuite } from './harness';
import { loadContentWithExtras } from './content';
import { actions } from './scenario/actions';
import {
  loadJlptKanji,
  runStep,
  snapshot,
  startScenario,
  type RunnerResources,
  type RunnerState,
  type StartInput,
  type StepInput,
} from './scenario/runner';

let resources: Promise<RunnerResources> | undefined;

function loadResources(): Promise<RunnerResources> {
  resources ??= loadContentWithExtras().then((content) => ({ content, jlptKanji: loadJlptKanji() }));
  return resources;
}

interface ScenarioState {
  rs?: RunnerState;
  failedAt?: string;
}

goldenSuite<StartInput | StepInput, unknown>('scenarios/*.json', async (input, c, ctx) => {
  const st = ctx.state as ScenarioState;
  const name = ctx.file.replace(/^scenarios\//, '').replace(/\.json$/, '');
  try {
    if (c.name === '00-start') {
      st.rs = startScenario(name, input as StartInput, await loadResources(), false);
      return snapshot(st.rs, null);
    }
    if (st.failedAt !== undefined) throw new Error(`blocked by ${st.failedAt}`);
    if (st.rs === undefined) throw new Error('no 00-start case');
    return runStep(st.rs, input as StepInput, actions);
  } catch (e) {
    st.failedAt ??= c.name;
    throw e;
  }
}, {
  needsContent: true,
  maxReported: 3,
  compare: (actual, expected, c, ctx) => {
    const diff = firstDifference(actual, expected);
    if (diff !== null) (ctx.state as ScenarioState).failedAt ??= c.name;
    return diff;
  },
});
