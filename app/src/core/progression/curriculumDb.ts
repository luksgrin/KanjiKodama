/**
 * The curriculum's database side over a `LearnerDb`: rewriting the subject table into an
 * order, adopting a restored file's mode, switching with placement, and the preview. The pure parts
 * (layouts, placement, descriptions) are in `core/curriculum`.
 */

import {
  WANIKANI_MAX_LEVEL,
  curriculumLayout,
  placeLearner,
  previewPlacement,
  type CurriculumLayout,
  type CurriculumMode,
  type CurriculumPreview,
  type LayoutSubject,
  type Placement,
} from '../curriculum';
import { currentMaxLevel, forceLessonAvailable, progressRow, sqlIsZero, sqlNonZero, type LearnerDb } from './db';
import { afterChange, updateProgression } from './localProgression';

/** The order's level and position of every subject, from the WaniKani order. */
export function layoutFor(db: LearnerDb, target: CurriculumMode): CurriculumLayout {
  const subjects: LayoutSubject[] = db.content.subjects.map((s) => ({
    id: s.id,
    object: s.object,
    characters: s.characters,
    componentSubjectIds: s.componentSubjectIds,
    hidden: db.table.get(s.id)!.hiddenAt !== 0,
  }));
  return curriculumLayout(target, subjects, db.wkOrder, db.jlptKanji);
}

/** Rewrite the table's level and lesson position. Does not move the learner. */
export function applyOrdering(db: LearnerDb, target: CurriculumMode): void {
  const layout = layoutFor(db, target);
  if (layout.placement.size === 0) return;
  for (const [id, [level, position]] of layout.placement) {
    const t = db.table.get(id);
    if (t !== undefined) {
      t.level = level;
      t.lessonPosition = position;
    }
  }
  db.ordering = target;
  db.blocks = [...layout.blocks];
}

/** Take a mode without placing the learner (a restored file carries its own level). */
export function adoptCurriculum(db: LearnerDb, target: CurriculumMode): void {
  if (db.ordering !== target) applyOrdering(db, target);
  db.progress.curriculum = target;
}

/** Where switching to `target` would place the learner; changes nothing. */
export function previewCurriculum(db: LearnerDb, target: CurriculumMode): CurriculumPreview {
  const layout = layoutFor(db, target);
  const kanji = db.content.subjects
    .filter((s) => s.object === 'kanji' && db.table.get(s.id)!.hiddenAt === 0)
    .map((s) => ({ id: s.id, passed: sqlNonZero(progressRow(db, s.id).passedAt) }));
  return previewPlacement(target, layout, kanji);
}

/**
 * Place the learner in the current order, unlock the backfill kanji as lessons,
 * clear the level progression, set the level and update progression.
 */
export function placeLearnerInDb(db: LearnerDb, now: number): Placement {
  const kanji = db.content.subjects
    .filter((s) => s.object === 'kanji' && db.table.get(s.id)!.hiddenAt === 0)
    .map((s) => {
      const row = progressRow(db, s.id);
      return {
        id: s.id,
        level: db.table.get(s.id)!.level,
        passed: sqlNonZero(row.passedAt),
        unlocked: !sqlIsZero(row.unlockedAt),
      };
    });
  const { placement, backfillIds } = placeLearner(currentMaxLevel(db), kanji);
  for (const id of backfillIds) forceLessonAvailable(db, id, now, WANIKANI_MAX_LEVEL);
  db.progress.levelProgression.clear();
  db.progress.userLevel = placement.level;
  updateProgression(db, now);
  return placement;
}

/** Switch order and place the learner. */
export function switchCurriculum(db: LearnerDb, target: CurriculumMode, now: number): Placement {
  applyOrdering(db, target);
  db.progress.curriculum = target;
  const placement = placeLearnerInDb(db, now);
  afterChange(db, now);
  return placement;
}
