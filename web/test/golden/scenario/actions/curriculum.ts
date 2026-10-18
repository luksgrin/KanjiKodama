/** Curriculum actions: `switchCurriculum`, `previewCurriculum`, `place` (`local/Curriculum`). */

import type { CurriculumMode } from '../../../../src/core/curriculum';
import { placeLearnerInDb, previewCurriculum, switchCurriculum } from '../../../../src/core/progression';
import type { ActionHandler } from '../runner';

function mode(value: unknown): CurriculumMode {
  if (value !== 'WANIKANI' && value !== 'JLPT') throw new Error(`bad mode ${String(value)}`);
  return value;
}

export const curriculumActions: Record<string, ActionHandler> = {
  switchCurriculum: ({ rs, step }) => {
    const p = switchCurriculum(rs.db, mode(step.mode), rs.now);
    return { level: p.level, backfill: p.backfill };
  },
  previewCurriculum: ({ rs, step }) => {
    const p = previewCurriculum(rs.db, mode(step.mode));
    return { target: p.target, level: p.placement.level, backfill: p.placement.backfill, levelDescription: p.levelDescription };
  },
  place: ({ rs }) => {
    const p = placeLearnerInDb(rs.db, rs.now);
    return { level: p.level, backfill: p.backfill };
  },
};
