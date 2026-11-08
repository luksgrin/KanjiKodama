/**
 * The dashboard's level progress bars: per level and subject type, the subjects by SRS bucket.
 * Kana-only vocabulary is counted in the vocabulary bar.
 */

import { SUBJECT_TYPE_BY_OBJECT, type SubjectTypeName } from '../content';
import { num, progressRow, sqlNonZero, srsSystemOf, type LearnerDb } from '../progression';

export interface LevelProgressOptions {
  /** `show_over_level_progression`: bars up to the max level granted instead of the user's level. */
  showOverLevelProgression: boolean;
  /** `previous_level_progression_limit`: drop bars more than `limitAmount` levels below the user's. */
  limitPreviousLevelProgression: boolean;
  /** `previous_level_progression_limit_amount`. */
  limitAmount: number;
  /** The highest level granted (60 in local mode). */
  maxLevelGranted: number;
}

/**
 * `LevelProgress.BarEntry`. Buckets: 0 passed, 1..7 apprentice stages (7 = first), 8 initiate,
 * 9 locked.
 */
export interface LevelProgressBar {
  level: number;
  type: SubjectTypeName;
  buckets: number[];
}

/** Bar types in `SubjectType` order, without the kana-only vocabulary that folds into vocabulary. */
const BAR_TYPES: readonly SubjectTypeName[] = ['WANIKANI_RADICAL', 'WANIKANI_KANJI', 'WANIKANI_VOCAB'];

/** The bar a subject type counts in. */
function barType(type: SubjectTypeName): SubjectTypeName {
  return type === 'WANIKANI_KANA_VOCAB' ? 'WANIKANI_VOCAB' : type;
}

/** The level progress bars. */
export function computeLevelProgress(db: LearnerDb, options: LevelProgressOptions): LevelProgressBar[] {
  const userLevel = db.progress.userLevel;
  const maxLevel = options.showOverLevelProgression ? options.maxLevelGranted : userLevel;

  interface Entry extends LevelProgressBar {
    total: number;
    passed: number;
  }
  const entries: Entry[] = [];
  const byKey = new Map<string, Entry>();
  for (let level = 1; level <= maxLevel; level++) {
    for (const type of BAR_TYPES) {
      const e: Entry = { level, type, buckets: new Array<number>(10).fill(0), total: 0, passed: 0 };
      entries.push(e);
      byKey.set(`${level}/${type}`, e);
    }
  }

  // getLevelProgressTotalItems / PassedItems, added up per bar (setTotalCount/setNumPassed add).
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id)!;
    if (t.hiddenAt !== 0) continue;
    const e = byKey.get(`${t.level}/${barType(SUBJECT_TYPE_BY_OBJECT[s.object])}`);
    if (e === undefined) continue;
    e.total++;
    if (sqlNonZero(progressRow(db, s.id).passedAt)) e.passed++;
  }

  // numLocked is never set, so the "locked above the user's level" rule never removes a bar.
  const kept = entries.filter((e) => !(e.total === 0
    || e.passed >= e.total
    || (options.limitPreviousLevelProgression && e.level < userLevel - options.limitAmount)));

  const keptByKey = new Map(kept.map((e) => [`${e.level}/${e.type}`, e]));
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id)!;
    if (t.hiddenAt !== 0) continue;
    const e = keptByKey.get(`${t.level}/${barType(SUBJECT_TYPE_BY_OBJECT[s.object])}`);
    if (e === undefined) continue;
    e.buckets[levelProgressBucket(db, s.id)]!++;
  }

  return kept.map(({ level, type, buckets }) => ({ level, type, buckets }));
}

/** `BarEntry.addSubject`: locked 9, passed 0, else the stage's level-progress bucket. */
function levelProgressBucket(db: LearnerDb, id: number): number {
  const row = progressRow(db, id);
  if (num(row, 'unlockedAt') === 0) return 9;
  if (num(row, 'passedAt') !== 0) return 0;
  return srsSystemOf(db, id).getStage(num(row, 'srsStage')).levelProgressBucket;
}
