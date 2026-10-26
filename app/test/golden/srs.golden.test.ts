import { describe, expect, it } from 'vitest';
import { fallbackSrsSystems, findSrsSystem, reportSessionItem, srsSystemFromData, type ReportType, type SrsProgress,
  type SrsStage } from '../../src/core/srs';
import { hasContentDb, loadContent } from './content';
import { goldenSuite } from './harness';

const systems = fallbackSrsSystems();

function stageInfo(s: SrsStage) {
  return {
    id: s.id, interval: s.interval, name: s.name, shortName: s.shortName, nameLetter: s.nameLetter,
    advancedSearchTag: s.advancedSearchTag, locked: s.isLocked, initial: s.isInitial, passed: s.isPassed,
    completed: s.isCompleted,
  };
}

goldenSuite<{ systemId: number }, unknown>('srs/systems.json', ({ systemId }) => {
  const sys = findSrsSystem(systems, systemId);
  return {
    id: sys.id, name: sys.name, initialStage: sys.initialStage.id, firstStartedStage: sys.firstStartedStage.id,
    completedStage: sys.completedStage.id, numPrePassedStages: sys.numPrePassedStages,
    numPassedStages: sys.numPassedStages, stages: sys.stages.map(stageInfo),
  };
});

goldenSuite<{ systemId: number; stage: number; numIncorrect: number }, unknown>('srs/new-stage.json', (input) => {
  const n = findSrsSystem(systems, input.systemId).getStage(input.stage).getNewStage(input.numIncorrect);
  return { stage: n.id, interval: n.interval, name: n.name, passed: n.isPassed, completed: n.isCompleted };
});

interface OutcomeInput {
  subject: { id: number; object: string; srsSystemId: number };
  type: ReportType;
  meaningIncorrect: number;
  readingIncorrect: number;
  timestamp: number;
  before: SrsProgress;
}

goldenSuite<OutcomeInput, unknown>('srs/outcome.json', (input) => {
  const outcome = reportSessionItem(findSrsSystem(systems, input.subject.srsSystemId), input.before, input, 0);
  return { after: outcome.progress };
});

describe.skipIf(!hasContentDb())('srs systems from the content DB', () => {
  it('match the fallback stages and intervals (names differ)', async () => {
    const fromDb = (await loadContent()).srsSystems.map(srsSystemFromData);
    expect(fromDb.map((s) => s.id)).toEqual(systems.map((s) => s.id));
    for (const [i, sys] of fromDb.entries()) {
      const strip = (x: typeof sys) => x.stages.map((s) => ({ ...stageInfo(s) }));
      expect(strip(sys)).toEqual(strip(systems[i]!));
    }
  });
});
