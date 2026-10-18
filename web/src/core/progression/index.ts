/**
 * Level-up (ceil(0.9 x kanji) passed) and unlocks, plus the in-memory learner database the local-mode
 * logic works on (content layout, progress, curriculum state) and the operations on it. Java:
 * local/LocalProgression, local/ProgressStore (restore/export), local/Curriculum (database side),
 * jobs/ReportSessionItemJob (local mode). Fixtures: scenarios/*.
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
export { reportLocal, type LocalReport } from './report';
export { exportFromDb, restoreIntoDb } from './store';
