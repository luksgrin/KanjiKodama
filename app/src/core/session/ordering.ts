/**
 * The `SessionOrdering` the session engine takes (see `types.ts`), built from the order and selection
 * settings: `order.ts` (comparators), `selection.ts` (`SubjectSelectionRules`, `trimSelection`) and
 * the readers in `settings/session.ts`.
 */

import { num } from '../progression/db';
import {
  backToBack,
  maxSessionSize,
  meaningFirst,
  overdueThreshold,
  readingFirst,
  shuffleAfterSelection,
  subjectSelectionSettings,
  type Preferences,
} from '../settings';
import {
  isOverdue,
  LOCAL_MAX_LEVEL_GRANTED,
  levelUpIds,
  sessionOrder,
  TYPE_ORDER,
  type OrderSubject,
  type SubjectComparator as OrderComparator,
} from './order';
import { SubjectSelectionRules, trimSelection } from './selection';
import type { SessionContext, SessionOrdering, SessionSubject, SubjectComparator } from './types';

/** A session subject as the order comparators read it, at `now` with the overdue `threshold`. */
export function orderSubjectOf(s: SessionSubject, now: number, threshold: number): OrderSubject {
  const srsStage = s.srsSystem.getStage(num(s.progress, 'srsStage'));
  return {
    id: s.id,
    object: s.content.object,
    level: s.table.level,
    typeOrder: TYPE_ORDER[s.content.object],
    srsStage,
    passed: num(s.progress, 'passedAt') !== 0,
    overdue: isOverdue(num(s.progress, 'availableAt'), num(s.progress, 'unlockedAt'), srsStage, now, threshold),
  };
}

/** Reads each session subject once per comparator (they don't change while a session starts). */
function viewer(ctx: SessionContext): (s: SessionSubject) => OrderSubject {
  const threshold = overdueThreshold(ctx.prefs);
  const cache = new WeakMap<SessionSubject, OrderSubject>();
  return (s) => {
    let o = cache.get(s);
    if (o === undefined) {
      o = orderSubjectOf(s, ctx.now, threshold);
      cache.set(s, o);
    }
    return o;
  };
}

/** The user's level and the level-up ids the priority settings read (local mode: max level 60). */
function selectionContext(ctx: SessionContext): { userLevel: number; maxLevel: number; levelUp: Set<number> } {
  const userLevel = ctx.db.progress.userLevel;
  return { userLevel, maxLevel: LOCAL_MAX_LEVEL_GRANTED, levelUp: levelUpIds(ctx.db, userLevel, LOCAL_MAX_LEVEL_GRANTED) };
}

/** The settings-driven `SessionOrdering` (`Session.startNew*Session` with every order and selection setting). */
export const settingsOrdering: SessionOrdering = {
  comparator(type, ctx): SubjectComparator {
    const { userLevel, maxLevel, levelUp } = selectionContext(ctx);
    const order: OrderComparator = sessionOrder(type, ctx.prefs, levelUp, userLevel, maxLevel).comparator;
    const view = viewer(ctx);
    return (a, b) => order(view(a), view(b));
  },
  shuffleBeforeSort(type, prefs: Preferences): boolean {
    return sessionOrder(type, prefs, new Set(), 0, LOCAL_MAX_LEVEL_GRANTED).shuffleFirst;
  },
  maxSize: (type, prefs) => maxSessionSize(prefs, type),
  trimSelection(candidates, maxSize, type, ctx, comparator): SessionSubject[] {
    const view = viewer(ctx);
    const bySubject = new Map(candidates.map((s) => [view(s), s]));
    const rules = new SubjectSelectionRules(subjectSelectionSettings(ctx.prefs, type), ctx.db.progress.userLevel);
    const chosen = trimSelection(candidates.map(view), maxSize, rules, (a, b) => comparator(bySubject.get(a)!, bySubject.get(b)!));
    return chosen.map((o) => bySubject.get(o)!);
  },
  shuffleAfterSelection: (type, prefs) => shuffleAfterSelection(prefs, type),
  questionOrder: (type, prefs) => ({
    backToBack: backToBack(prefs, type),
    readingFirst: readingFirst(prefs, type),
    meaningFirst: meaningFirst(prefs, type),
  }),
};
