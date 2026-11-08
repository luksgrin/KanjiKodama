/**
 * The order a session puts its subjects in: the lesson/review/self-study order setting, reversed,
 * overdue first and the priority setting, combined into one comparator the way
 * `Session.startNew*Session` does. Equal subjects (comparator 0) share a bucket; the session picks
 * questions at random within the first bucket (see `orderQuestions.ts`).
 *
 * Java: `enums/LessonOrder`, `enums/ReviewOrder`, `enums/SessionPriority`, `Subject.isOverdue`,
 * `SubjectCollectionsDao.getLevelUpIds`, `Session.startNew*Session`.
 */

import type { SubjectObject } from '../content';
import { contentSubject, num, progressRow, srsSystemOf, tableRow, type LearnerDb } from '../progression';
import {
  LESSON_ORDERS,
  lessonOrder,
  orderOverdueFirst,
  orderPriority,
  orderReversed,
  overdueThreshold,
  reviewOrder,
  type LessonOrder,
  type Preferences,
  type ReviewOrder,
  type SessionPriority,
} from '../settings';
import type { SrsStage } from '../srs';

/** A session's type when it starts. */
export type StartType = 'LESSON' | 'REVIEW' | 'SELF_STUDY';

/** What the order comparators read of a subject (`Subject` getters), taken when the session starts. */
export interface OrderSubject {
  readonly id: number;
  readonly object: SubjectObject;
  /** `Subject.getLevel`: the level in the current curriculum order. */
  readonly level: number;
  /** `Subject.getTypeOrder`: radical 10, kanji 20, vocabulary and kana-only vocabulary 30. */
  readonly typeOrder: number;
  readonly srsStage: SrsStage;
  /** `Subject.isPassed`: passedAt != 0. */
  readonly passed: boolean;
  /** `Subject.isOverdue` at the session start. */
  readonly overdue: boolean;
}

/** `java.util.Comparator<Subject>`: negative, zero or positive. */
export type SubjectComparator = (a: OrderSubject, b: OrderSubject) => number;

/** `SubjectType.getOrder`. */
export const TYPE_ORDER: Readonly<Record<SubjectObject, number>> = {
  radical: 10,
  kanji: 20,
  vocabulary: 30,
  kana_vocabulary: 30,
};

/** `LocalMode.MAX_LEVEL`: `PropertiesDao.getUserMaxLevelGranted` in local mode, whatever the curriculum. */
export const LOCAL_MAX_LEVEL_GRANTED = 60;

/**
 * `Subject.isOverdue`: at least `threshold` (a Java float) of the stage's interval has passed since
 * the review became available. Initiate counts as overdue; locked, burned and not-yet-available don't.
 */
export function isOverdue(availableAt: number, unlockedAt: number, stage: SrsStage, now: number, threshold: number): boolean {
  if (availableAt === 0 || unlockedAt === 0) return false;
  if (stage.isInitial) return true;
  if (stage.isCompleted) return false;
  const since = now - availableAt;
  if (since <= 0) return false;
  // double / long, compared with the float widened to double; a 0 interval gives Infinity like Java.
  return since / stage.interval >= threshold;
}

/** The `OrderSubject` of a subject in the learner database at `now`. */
export function orderSubject(db: LearnerDb, id: number, now: number, prefs: Preferences): OrderSubject {
  const s = contentSubject(db, id);
  const row = progressRow(db, id);
  const srsStage = srsSystemOf(db, id).getStage(num(row, 'srsStage'));
  return {
    id,
    object: s.object,
    level: tableRow(db, id).level,
    typeOrder: TYPE_ORDER[s.object],
    srsStage,
    passed: num(row, 'passedAt') !== 0,
    overdue: isOverdue(num(row, 'availableAt'), num(row, 'unlockedAt'), srsStage, now, overdueThreshold(prefs)),
  };
}

/**
 * `SubjectCollectionsDao.getLevelUpIds(userLevel, maxLevel)`: the visible kanji of the user's level
 * (in the table's current order) and their components; empty at or above `maxLevel`.
 */
export function levelUpIds(db: LearnerDb, userLevel: number, maxLevel: number): Set<number> {
  const result = new Set<number>();
  if (userLevel >= maxLevel) return result;
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id);
    if (s.object !== 'kanji' || t === undefined || t.hiddenAt !== 0 || t.level !== userLevel) continue;
    result.add(s.id);
    for (const c of s.componentSubjectIds) result.add(c);
  }
  return result;
}

const compareInt = (a: number, b: number): number => (a < b ? -1 : a > b ? 1 : 0);
/** `Boolean.compare(a, b)`: false before true. */
const compareBoolean = (a: boolean, b: boolean): number => (a === b ? 0 : a ? 1 : -1);

const SHUFFLE: SubjectComparator = () => 0;
const byLevel: SubjectComparator = (a, b) => compareInt(a.level, b.level);
const byType: SubjectComparator = (a, b) => compareInt(a.typeOrder, b.typeOrder);
const bySrs: SubjectComparator = (a, b) => a.srsStage.compareTo(b.srsStage);

/** `Comparator.thenComparing`. */
export function thenComparing(...comparators: SubjectComparator[]): SubjectComparator {
  return (a, b) => {
    for (const c of comparators) {
      const r = c(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}

/** The comparator that orders subjects equal to each other: every subject is in one bucket. */
export const SHUFFLE_COMPARATOR: SubjectComparator = SHUFFLE;

/** `LessonOrder.getComparator`. */
export function lessonOrderComparator(order: LessonOrder): SubjectComparator {
  switch (order) {
    case 'SHUFFLE':
      return SHUFFLE;
    case 'LEVEL_THEN_TYPE':
      return thenComparing(byLevel, byType);
    case 'RADICALS_THEN_LEVEL_THEN_TYPE':
      return thenComparing((a, b) => compareBoolean(b.object === 'radical', a.object === 'radical'), byLevel, byType);
    case 'TYPE_THEN_LEVEL':
      return thenComparing(byType, byLevel);
    case 'LEVEL_THEN_SHUFFLE':
      return byLevel;
    case 'TYPE_THEN_SHUFFLE':
      return byType;
  }
}

/** `ReviewOrder.getComparator`. */
export function reviewOrderComparator(order: ReviewOrder): SubjectComparator {
  const parts = order === 'SHUFFLE' ? [] : order.split('_THEN_');
  if (parts.length === 0) return SHUFFLE;
  return thenComparing(...parts.map((p) => (p === 'LEVEL' ? byLevel : p === 'TYPE' ? byType : bySrs)));
}

/** `SessionPriority.getComparator(base, levelUpIds, userLevel, maxLevel)`. */
export function priorityComparator(priority: SessionPriority, base: SubjectComparator, levelUp: ReadonlySet<number>,
  userLevel: number, maxLevel: number): SubjectComparator {
  switch (priority) {
    case 'NONE':
      return base;
    case 'RADICALS_FIRST':
      return thenComparing((a, b) => compareBoolean(b.object === 'radical', a.object === 'radical'), base);
    case 'LEVEL_UP_FIRST':
      if (userLevel >= maxLevel) return base;
      return thenComparing((a, b) => compareBoolean(!b.passed && levelUp.has(b.id), !a.passed && levelUp.has(a.id)), base);
    case 'CURRENT_LEVEL_RADICAL_KANJI_FIRST': {
      // SubjectType.isVocabulary is false for kana-only vocabulary, so it counts as "radical/kanji" here.
      const first = (s: OrderSubject): boolean => s.level === userLevel && s.object !== 'vocabulary';
      return thenComparing((a, b) => compareBoolean(first(b), first(a)), base);
    }
    case 'CURRENT_LEVEL_FIRST':
      return thenComparing((a, b) => compareBoolean(b.level === userLevel, a.level === userLevel), base);
  }
}

/** The pieces of a session start's order: the comparator and whether the subjects are shuffled first. */
export interface SessionOrder {
  comparator: SubjectComparator;
  /** `populateItems`' shuffle argument: the lesson order's `isShuffle`, always true for reviews and self-study. */
  shuffleFirst: boolean;
}

/**
 * The comparator `Session.startNewLessonSession` / `startNewReviewSession` / `startNewSelfStudySession`
 * build: the order setting, reversed if set, overdue items first (reviews and self-study), then the
 * priority setting in front. `levelUp` is `levelUpIds(db, userLevel, maxLevel)`.
 */
export function sessionOrder(type: StartType, prefs: Preferences, levelUp: ReadonlySet<number>, userLevel: number,
  maxLevel: number): SessionOrder {
  let comparator: SubjectComparator;
  let shuffleFirst = true;
  if (type === 'LESSON') {
    const order = lessonOrder(prefs);
    comparator = lessonOrderComparator(order);
    shuffleFirst = LESSON_ORDERS[order].shuffle;
  } else {
    comparator = reviewOrderComparator(reviewOrder(prefs, type));
  }
  if (orderReversed(prefs, type)) {
    const base = comparator;
    comparator = (a, b) => base(b, a);
  }
  if (orderOverdueFirst(prefs, type)) {
    comparator = thenComparing((a, b) => compareBoolean(b.overdue, a.overdue), comparator);
  }
  comparator = priorityComparator(orderPriority(prefs, type), comparator, levelUp, userLevel, maxLevel);
  return { comparator, shuffleFirst };
}
