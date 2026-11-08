/**
 * Browse's level buttons and the advanced search, plus what the results screen makes of the hits
 * (with a `SearchSortOrder`).
 *
 * This evaluates the search conditions on `SearchSubject`s and returns them in
 * `level, lessonPosition, id` order.
 */

import { SUBJECT_TYPE_BY_OBJECT } from '../content';
import { type SrsStage, type SrsSystem, findSrsSystem } from '../srs/system';
import { DAY, HOUR } from '../time';
import { JacksonError, parseParameters, type AdvancedSearchParameters, type SearchSortOrder } from './parameters';
import type { SearchSubject } from './subject';
import { typeName, typeOrder } from './subject';

/** `ORDER BY level, lessonPosition, id`. */
function byLevelPositionId(a: SearchSubject, b: SearchSubject): number {
  return a.level - b.level || a.lessonPosition - b.lessonPosition || a.id - b.id;
}

/** A malformed integer (`NumberFormatException`). */
export class NumberFormatError extends Error {}

const DIGIT = /\p{Nd}/u;

/** Optional sign, Unicode decimal digits, int range. */
export function parseIntChecked(s: string): number {
  let i = 0;
  let negative = false;
  if (s[0] === '+' || s[0] === '-') {
    negative = s[0] === '-';
    i = 1;
  }
  if (i >= s.length) throw new NumberFormatError(`For input string: "${s}"`);
  let v = 0;
  for (; i < s.length; i++) {
    const c = s.charAt(i);
    if (!DIGIT.test(c)) throw new NumberFormatError(`For input string: "${s}"`);
    let zero = c.charCodeAt(0);
    while (DIGIT.test(String.fromCharCode(zero - 1)) && c.charCodeAt(0) - zero < 9) zero--;
    v = v * 10 + ((c.charCodeAt(0) - zero) % 10);
    if (v > 2147483648) throw new NumberFormatError(`For input string: "${s}"`);
  }
  if (negative) v = -v;
  if (v > 2147483647 || v < -2147483648) throw new NumberFormatError(`For input string: "${s}"`);
  return v;
}

/** The subjects of one level; throws `NumberFormatError`. */
export function searchByLevel(subjects: readonly SearchSubject[], level: string): SearchSubject[] {
  const n = parseIntChecked(level);
  return subjects.filter((s) => s.level === n && s.hiddenAt === 0).sort(byLevelPositionId);
}

/** `Subject.isLocked`: not unlocked yet. */
function isLocked(s: SearchSubject): boolean {
  return s.unlockedAt === 0;
}

/** One stage condition. */
type StageFragment = (s: SearchSubject) => boolean;

/** Adds the stage conditions for one stage tag. */
function addSrsStageFragments(fragments: StageFragment[], systems: readonly SrsSystem[], tag: string): void {
  if (tag === 'locked') {
    fragments.push((s) => s.unlockedAt === 0);
  } else if (tag === 'initial') {
    fragments.push((s) => s.srsStage === 0 && s.unlockedAt !== 0);
  } else {
    for (const system of systems) {
      for (const stage of system.stages) {
        if (stage.advancedSearchTag === tag) fragments.push((s) => s.srsSystemId === system.id && s.srsStage === stage.id);
      }
    }
  }
}

/** The settings and clock an advanced search reads. */
export interface AdvancedSearchContext {
  systems: readonly SrsSystem[];
  /** `enable_star_ratings`. */
  starRatingsEnabled: boolean;
  /** `Clock.now()`. */
  now: number;
}

/**
 * The advanced search on parsed parameters. A null element in a collection throws a `TypeError`
 * (the caller turns it into no results).
 */
export function searchAdvanced(
  subjects: readonly SearchSubject[],
  p: AdvancedSearchParameters,
  ctx: AdvancedSearchContext,
): SearchSubject[] {
  const conditions: ((s: SearchSubject) => boolean)[] = [(s) => s.hiddenAt === 0];
  const { now } = ctx;
  const { minLevel, maxLevel, minFrequency, maxFrequency } = p;
  if (minLevel !== null) conditions.push((s) => s.level >= minLevel);
  if (maxLevel !== null) conditions.push((s) => s.level <= maxLevel);
  if (minFrequency !== null) conditions.push((s) => s.frequency >= minFrequency);
  if (maxFrequency !== null) conditions.push((s) => s.frequency <= maxFrequency);
  if (p.leechesOnly) {
    // getLeechFilter: srsStage strictly between initial and burned, per system; then leechScore > 1000.
    conditions.push((s) => ctx.systems.some((sys) =>
      s.srsSystemId === sys.id && s.srsStage > sys.initialStageId && s.srsStage < sys.completedStageId));
    conditions.push((s) => s.leechScore > 1000);
  }
  const { upcomingReviewLessThan: lt, upcomingReviewMoreThan: mt } = p;
  if (lt !== null || mt !== null) conditions.push((s) => s.availableAt !== 0);
  if (lt !== null) conditions.push((s) => s.availableAt <= now + lt * HOUR);
  if (mt !== null) conditions.push((s) => s.availableAt >= now + mt * HOUR);
  const { burnedLessThan: blt, burnedMoreThan: bmt } = p;
  if (blt !== null || bmt !== null) conditions.push((s) => s.burnedAt !== 0);
  if (blt !== null) conditions.push((s) => s.burnedAt >= now - blt * DAY);
  if (bmt !== null) conditions.push((s) => s.burnedAt <= now - bmt * DAY);
  const within = p.incorrectAnswerWithin;
  if (within !== null) conditions.push((s) => s.lastIncorrectAnswer !== 0 && s.lastIncorrectAnswer >= now - within * HOUR);

  if (ctx.starRatingsEnabled && p.starRatings.length > 0) {
    const ratings = p.starRatings.map((r) => {
      if (r === null) throw new TypeError('null star rating');
      return r;
    });
    conditions.push((s) => ratings.includes(s.stars));
  }

  const stageFragments: StageFragment[] = [];
  for (const tag of p.srsStages) {
    if (tag === null) throw new TypeError('null stage tag');
    addSrsStageFragments(stageFragments, ctx.systems, tag);
  }
  if (stageFragments.length > 0) conditions.push((s) => stageFragments.some((f) => f(s)));
  else if (p.srsStages.length > 0) conditions.push(() => false);

  if (p.itemTypes.length > 0) conditions.push((s) => p.itemTypes.includes(SUBJECT_TYPE_BY_OBJECT[s.object]));
  const ints = (xs: readonly (number | null)[]): number[] => xs.map((x) => {
    if (x === null) throw new TypeError('null in collection');
    return x;
  });
  if (p.jlptLevels.length > 0) {
    const levels = ints(p.jlptLevels);
    conditions.push((s) => levels.includes(s.jlptLevel));
  }
  if (p.joyoGrades.length > 0) {
    const grades = ints(p.joyoGrades);
    conditions.push((s) => grades.includes(s.joyoGrade));
  }
  return subjects.filter((s) => conditions.every((c) => c(s))).sort(byLevelPositionId);
}

/**
 * The advanced search on JSON parameters: parse, then search; any failure gives no results.
 */
export function searchAdvancedJson(
  subjects: readonly SearchSubject[],
  json: string,
  ctx: AdvancedSearchContext,
): SearchSubject[] {
  try {
    const p = parseParameters(json);
    if (p === null) return [];
    return searchAdvanced(subjects, p, ctx);
  } catch (e) {
    if (e instanceof JacksonError || e instanceof TypeError) return [];
    throw e;
  }
}

// --- The results screen ---

/** `SearchSortOrder.searchStage`: the Locked stage for a locked subject, else its stage. */
function searchStage(s: SearchSubject, systems: readonly SrsSystem[]): SrsStage {
  const system = findSrsSystem(systems, s.srsSystemId);
  return isLocked(s) ? system.lockedStage : system.getStage(s.srsStage);
}

/** The comparator and header tags of one `SearchSortOrder`. */
interface SortOrderImpl {
  singleLevel: boolean;
  compare(a: SearchSubject, b: SearchSubject): number;
  topLevelTag(s: SearchSubject): string;
  topLevelHeader(s: SearchSubject): string;
}

function sortOrderImpl(order: SearchSortOrder, searchTime: number, systems: readonly SrsSystem[]): SortOrderImpl {
  const byType = (a: SearchSubject, b: SearchSubject): number => typeOrder(a.object) - typeOrder(b.object);
  switch (order) {
    case 'TYPE':
      return {
        singleLevel: true,
        compare: byType,
        topLevelTag: (s) => typeName(s.object),
        topLevelHeader: (s) => `ItemTypeHeaderItem:${typeName(s.object)}`,
      };
    case 'LEVEL_TYPE':
      return {
        singleLevel: false,
        compare: (a, b) => a.level - b.level || byType(a, b),
        topLevelTag: (s) => String(s.level),
        topLevelHeader: (s) => `LevelHeaderItem:${s.level}`,
      };
    case 'AVAILABLE_AT_TYPE': {
      const key = (s: SearchSubject): number => (s.availableAt === 0 ? 0 : Math.max(s.availableAt, searchTime));
      const tag = (s: SearchSubject): string => String(s.availableAt === 0 ? 0 : s.availableAt <= searchTime ? searchTime : s.availableAt);
      return {
        singleLevel: false,
        compare: (a, b) => Math.sign(key(a) - key(b)) || byType(a, b),
        topLevelTag: tag,
        topLevelHeader: (s) => `AvailableAtHeaderItem:${tag(s)}`,
      };
    }
    case 'STAGE_TYPE':
      return {
        singleLevel: false,
        compare: (a, b) => searchStage(a, systems).compareTo(searchStage(b, systems)) || byType(a, b),
        topLevelTag: (s) => searchStage(s, systems).advancedSearchTag,
        topLevelHeader: (s) => `SrsStageHeaderItem:${searchStage(s, systems).advancedSearchTag}`,
      };
  }
}

/** One row of the results list: a header (`"Class:tag"`) or a subject. */
export type ResultViewItem = { header: string } | { subject: SearchSubject };

/**
 * The results list: sorted stably by the sort order, consecutive equal
 * subjects grouped under a type header; for two-level orders the type headers sit under a
 * top-level header, which a later group with the same tag joins. Returns the list in screen order.
 */
export function resultView(
  result: readonly SearchSubject[],
  order: SearchSortOrder,
  searchTime: number,
  systems: readonly SrsSystem[],
): ResultViewItem[] {
  const impl = sortOrderImpl(order, searchTime, systems);
  const sorted = [...result].sort(impl.compare);
  interface Header { tag: string; label: string; children: (Header | SearchSubject)[] }
  const root: Header[] = [];
  let start = 0;
  while (start < sorted.length) {
    const first = sorted[start] as SearchSubject;
    let end = start + 1;
    while (end < sorted.length && impl.compare(first, sorted[end] as SearchSubject) === 0) end++;
    let header: Header;
    if (impl.singleLevel) {
      const tag = typeName(first.object);
      header = { tag, label: `ItemTypeHeaderItem:${tag}`, children: [] };
      root.push(header);
    } else {
      const topTag = impl.topLevelTag(first);
      let top = root.find((h) => h.tag === topTag);
      if (top === undefined) {
        top = { tag: topTag, label: impl.topLevelHeader(first), children: [] };
        root.push(top);
      }
      const tag = `${top.tag} ${typeName(first.object)}`;
      header = { tag, label: `ItemTypeHeaderItem:${tag}`, children: [] };
      top.children.push(header);
    }
    for (let i = start; i < end; i++) header.children.push(sorted[i] as SearchSubject);
    start = end;
  }
  const out: ResultViewItem[] = [];
  const walk = (items: readonly (Header | SearchSubject)[]): void => {
    for (const item of items) {
      if ('label' in item) {
        out.push({ header: item.label });
        walk(item.children);
      } else {
        out.push({ subject: item });
      }
    }
  };
  walk(root);
  return out;
}
