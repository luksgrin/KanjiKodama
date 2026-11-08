/**
 * Level-up (ceil(0.9 x kanji) passed) and unlocks, plus the in-memory learner database the local-mode
 * logic works on (content layout, progress, curriculum state) and the operations on it: restore and
 * export, the curriculum's database side, lesson and review results, burn and resurrect. Fixtures:
 * scenarios/*.
 */
export * from './db';
export { afterChange, isPassed, updateProgression } from './localProgression';
export {
  adoptCurriculum,
  applyOrdering,
  layoutFor,
  placeLearnerInDb,
  previewCurriculum,
  switchCurriculum,
} from './curriculumDb';
export { reportLocal, reportServer, type LocalReport, type ServerReport } from './report';
export { burnLocal, isBurnable, isResurrectable, resurrectLocal } from './burn';
export { exportFromDb, restoreIntoDb } from './store';
