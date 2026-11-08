/**
 * Glue between the learner, the content file and core `search/`: the subject list the search sees
 * (`SearchSubject`s with the current curriculum's levels, progress and star ratings), the three search
 * types (level, keyword, advanced) as the results screen runs them, and small display helpers of the
 * result cards.
 */
import type { Database } from 'sql.js';
import type { ContentSubject } from '../../../core/content';
import { parseMeaningSynonyms } from '../../../core/answer/synonyms';
import { simulateInput, convertKatakanaToHiragana } from '../../../core/kana';
import { num, progressRow, type LearnerDb } from '../../../core/progression';
import {
  defaultParameters,
  EMPTY_TEXT,
  extraSearchTargets,
  parseParameters,
  resultView,
  searchAdvanced,
  searchByLevel,
  searchByText,
  searchSubject,
  type AdvancedSearchContext,
  type AdvancedSearchParameters,
  type ContextSentence,
  type ResultViewItem,
  type SearchSortOrder,
  type SearchSubject,
  type SubjectSearchText,
} from '../../../core/search';
import { findSrsSystem, type SrsStage, type SrsSystem } from '../../../core/srs';
import { DAY, HOUR, MINUTE } from '../../../core/time';

/** The search type: 0 level, 1 keyword, 2 advanced. */
export type SearchType = 0 | 1 | 2;

const textsCache = new WeakMap<Database, Map<number, SubjectSearchText>>();

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function sentences(v: unknown): ContextSentence[] {
  if (typeof v !== 'string' || v === '') return [];
  try {
    const parsed: unknown = JSON.parse(v);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({ en: str(x.en), ja: str(x.ja) }));
  } catch {
    return [];
  }
}

/** The text columns search reads (mnemonics, hints, sentences, `searchTarget`s), read once per content file. */
export function readSearchTexts(db: Database | null | undefined): ReadonlyMap<number, SubjectSearchText> {
  if (!db) return new Map();
  const cached = textsCache.get(db);
  if (cached) return cached;
  const out = new Map<number, SubjectSearchText>();
  const stmt = db.prepare(
    'SELECT id, meaningMnemonic, meaningHint, readingMnemonic, readingHint, contextSentences, searchTarget, smallSearchTarget FROM subject',
  );
  try {
    while (stmt.step()) {
      const r = stmt.getAsObject();
      out.set(Number(r.id), {
        meaningMnemonic: str(r.meaningMnemonic),
        meaningHint: str(r.meaningHint),
        readingMnemonic: str(r.readingMnemonic),
        readingHint: str(r.readingHint),
        contextSentences: sentences(r.contextSentences),
        searchTarget: str(r.searchTarget),
        smallSearchTarget: str(r.smallSearchTarget),
      });
    }
  } finally {
    stmt.free();
  }
  textsCache.set(db, out);
  return out;
}

/** A subject without a text row (no content file): the `ExtraContent` search targets from its own fields. */
function fallbackText(s: ContentSubject): SubjectSearchText {
  const chars = s.characters ?? s.slug ?? '';
  return { ...EMPTY_TEXT, ...extraSearchTargets(chars, s.meanings, s.readings) };
}

function synonyms(column: unknown): string[] {
  try {
    return parseMeaningSynonyms(typeof column === 'string' ? column : null);
  } catch {
    return [];
  }
}

/** Every content subject as the search sees it now: current-order level and position, progress, stars. */
export function buildSearchSubjects(
  learner: LearnerDb,
  texts: ReadonlyMap<number, SubjectSearchText>,
  stars: ReadonlyMap<number, number>,
): SearchSubject[] {
  const out: SearchSubject[] = [];
  for (const s of learner.content.subjects) {
    const t = learner.table.get(s.id);
    const row = progressRow(learner, s.id);
    const base = searchSubject(s, texts.get(s.id) ?? fallbackText(s), {
      srsStage: num(row, 'srsStage'),
      unlockedAt: num(row, 'unlockedAt'),
      availableAt: num(row, 'availableAt'),
      burnedAt: num(row, 'burnedAt'),
      lastIncorrectAnswer: num(row, 'lastIncorrectAnswer'),
      leechScore: num(row, 'leechScore'),
      stars: stars.get(s.id) ?? 0,
      meaningNote: typeof row.meaningNote === 'string' ? row.meaningNote : null,
      readingNote: typeof row.readingNote === 'string' ? row.readingNote : null,
      meaningSynonyms: synonyms(row.meaningSynonyms),
    }, t?.hiddenAt ?? s.hiddenAt);
    out.push(t ? { ...base, level: t.level, lessonPosition: t.lessonPosition } : base);
  }
  return out;
}

/** Does the query look like romaji (ASCII letters, apostrophes, hyphens and spaces only)? */
export function isRomajiQuery(query: string): boolean {
  return /[a-z]/i.test(query) && /^[a-z' -]+$/i.test(query);
}

/**
 * The romaji query in hiragana (`simulateInput`, katakana folded to hiragana), or null when
 * it isn't romaji or doesn't convert to kana entirely.
 */
export function romajiToKana(query: string): string | null {
  if (!isRomajiQuery(query)) return null;
  let kana: string;
  try {
    kana = convertKatakanaToHiragana(simulateInput(query.toLowerCase()));
  } catch {
    return null; // only blanks
  }
  return /[a-z]/i.test(kana) ? null : kana;
}

/**
 * Keyword search: `searchByText` on the query (characters, meanings, readings as typed), plus, for a
 * romaji query, on its kana conversion so "taberu" finds 食べる. The kana hits follow the direct ones.
 */
export function keywordSearch(subjects: readonly SearchSubject[], query: string): SearchSubject[] {
  const direct = searchByText(subjects, query).map((r) => r.subject);
  const kana = romajiToKana(query);
  if (kana === null) return direct;
  const seen = new Set(direct.map((s) => s.id));
  const extra = searchByText(subjects, kana).map((r) => r.subject).filter((s) => !seen.has(s.id));
  return [...direct, ...extra];
}

export interface SearchRun {
  subjects: SearchSubject[];
  sortOrder: SearchSortOrder;
  /** The parameters the Refine form starts from (null for a keyword search, which has no form). */
  parameters: AdvancedSearchParameters | null;
}

/** Runs a search: the hits, the sort order and the parameters. */
export function runSearch(
  subjects: readonly SearchSubject[],
  type: SearchType,
  data: string,
  ctx: AdvancedSearchContext,
): SearchRun {
  if (type === 0) {
    const p = defaultParameters();
    const level = Number.parseInt(data, 10);
    p.minLevel = Number.isNaN(level) ? null : level;
    p.maxLevel = p.minLevel;
    let hits: SearchSubject[] = [];
    try {
      hits = searchByLevel(subjects, data);
    } catch {
      hits = [];
    }
    return { subjects: hits, sortOrder: 'TYPE', parameters: p };
  }
  if (type === 1) return { subjects: keywordSearch(subjects, data), sortOrder: 'TYPE', parameters: null };
  let p: AdvancedSearchParameters | null = null;
  try {
    p = parseParameters(data);
  } catch {
    p = null;
  }
  if (p === null) return { subjects: [], sortOrder: 'TYPE', parameters: defaultParameters() };
  let hits: SearchSubject[] = [];
  try {
    hits = searchAdvanced(subjects, p, ctx);
  } catch {
    hits = [];
  }
  return { subjects: hits, sortOrder: p.sortOrder, parameters: p };
}

/** The description in "…: n subject(s) found". */
export function searchDescription(type: SearchType, data: string): string {
  if (type === 0) return `Level ${data}`;
  if (type === 1) return `'${data}'`;
  return 'Advanced search';
}

/**
 * The stage a result card shows: the stored stage. In local mode a subject that isn't unlocked yet
 * keeps stage 0, so it shows "Initiate";
 * only the WaniKani sync's -999 is Locked (no progress line).
 */
export function cardStage(s: SearchSubject, systems: readonly SrsSystem[]): SrsStage {
  return findSrsSystem(systems, s.srsSystemId).getStage(s.srsStage);
}

/** A short wait time: now, 12m, 5h, 3d (rounded). */
export function shortWaitTime(waitTime: number): string {
  if (waitTime <= 0) return 'now';
  if (waitTime < HOUR) return `${Math.trunc((waitTime + MINUTE / 2) / MINUTE)}m`;
  if (waitTime < DAY * 2) return `${Math.trunc((waitTime + HOUR / 2) / HOUR)}h`;
  return `${Math.trunc((waitTime + DAY / 2) / DAY)}d`;
}

/**
 * The card's progress line, "Guru I - 3h" (vocabulary: the full stage
 * name; others the short one), just the stage without a review, nothing when locked.
 */
export function cardProgressText(s: SearchSubject, stage: SrsStage, now: number): string | null {
  if (stage.isLocked) return null;
  const name = s.object === 'vocabulary' || s.object === 'kana_vocabulary' ? stage.name : stage.shortName;
  if (s.availableAt === 0) return name;
  return `${name} - ${shortWaitTime(s.availableAt - now)}`;
}

/** "2 locked, 1 not started, 3 in progress, 1 passed, 4 burned". */
export function headerDetails(subjects: readonly SearchSubject[], systems: readonly SrsSystem[], passedAt: (id: number) => number): string {
  let locked = 0;
  let initial = 0;
  let prePassed = 0;
  let passed = 0;
  let burned = 0;
  for (const s of subjects) {
    // Subject.getSrsStage (not searchStage): the stored stage, -999 when never unlocked.
    const stage = findSrsSystem(systems, s.srsSystemId).getStage(s.srsStage);
    if (stage.isCompleted) burned++;
    else if (stage.isInitial) initial++;
    else if (stage.isLocked) locked++;
    else if (passedAt(s.id) !== 0) passed++;
    else prePassed++;
  }
  const parts: string[] = [];
  if (locked > 0) parts.push(`${locked} locked`);
  if (initial > 0) parts.push(`${initial} not started`);
  if (prePassed > 0) parts.push(`${prePassed} in progress`);
  if (passed > 0) parts.push(`${passed} passed`);
  if (burned > 0) parts.push(`${burned} burned`);
  return parts.join(', ');
}

export { resultView, type ResultViewItem };
