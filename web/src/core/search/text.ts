/**
 * The text search of `util/SearchUtil`: Browse's search box (`searchSubjects(1, query)`) and its
 * drop-down suggestions (`searchSubjectSuggestions`).
 *
 * Matching is SQL `LIKE '%term%'` per term on the precomputed `searchTarget` (never notes or
 * synonyms): ASCII letters match case-insensitively, everything else exactly, `%`/`_`/`\` literally.
 * The ranking (`getSearchRanking`, which does read notes and synonyms) only orders the hits.
 */

import type { SearchSubject } from './subject';
import { oneMeaning } from './subject';

/** `Constants.MAX_SEARCH_HITS`. */
export const MAX_SEARCH_HITS = 250;

/** `SearchUtil.TERM_PATTERN`: `[\p{Z}\s]` (Java's `\s` is ASCII whitespace). */
const TERM_PATTERN = /[\p{Z} \t\n\x0B\f\r]/u;

/** Java `String.split(regex)` drops trailing empty strings; empty terms are skipped anyway. */
function splitTerms(query: string): string[] {
  return query.split(TERM_PATTERN).filter((t) => t.length > 0);
}

/** `SearchUtil.splitTermsForJava`: the words, upper-cased (`Locale.ROOT`). */
export function splitTermsForJava(query: string): string[] {
  return splitTerms(query).map((t) => t.toUpperCase());
}

/**
 * `SearchUtil.splitTermsForSql` without the LIKE escaping (`\` → `\\`, `%` → `\%`, `_` → `\_`):
 * the port matches literally, so the escaped form is only of interest to the fixture.
 */
export function splitTermsForSql(query: string): string[] {
  return splitTerms(query);
}

/** The escaped LIKE pattern body Java builds for a term. */
export function escapeLikeTerm(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** SQLite's default `LIKE`: case-insensitive for ASCII letters only. */
function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/** `column LIKE '%term%' ESCAPE '\'` for one escaped-in-Java term: a literal substring test. */
function likeContains(column: string | null, term: string): boolean {
  if (column === null) return false;
  return asciiLower(column).includes(asciiLower(term));
}

const LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;

/** `Character.isLetterOrDigit(char)` for one UTF-16 unit (a lone surrogate is neither). */
function isLetterOrDigit(c: string): boolean {
  return LETTER_OR_DIGIT.test(c);
}

/**
 * `SearchUtil.getRanking(haystack, term, weight)`: every hit of the (upper-case) term in the
 * upper-cased haystack counts 1, plus 1 at a word start and 1 at a word end; times the weight.
 */
export function getRanking(haystack: string | null | undefined, term: string, weight: number): number {
  if (haystack === null || haystack === undefined || haystack.length === 0) return 0;
  const uHaystack = haystack.toUpperCase();
  let base = 0;
  let count = 0;
  for (;;) {
    const p = uHaystack.indexOf(term, base);
    if (p < 0) return Math.imul(count, weight);
    count++;
    if (p === 0 || !isLetterOrDigit(uHaystack.charAt(p - 1))) count++;
    if (p + term.length >= uHaystack.length || !isLetterOrDigit(uHaystack.charAt(p + term.length))) count++;
    base = p + term.length;
  }
}

/** `SearchUtil.getSearchRanking(subject, terms)`. */
export function getSearchRanking(subject: SearchSubject, terms: readonly string[]): number {
  let ranking = 0;
  for (const term of terms) {
    ranking += getRanking(subject.characters, term, 100);
    ranking += getRanking(subject.slug, term, 10);
    ranking += getRanking(subject.meaningMnemonic, term, 1);
    ranking += getRanking(subject.meaningHint, term, 1);
    ranking += getRanking(subject.meaningNote, term, 1);
    ranking += getRanking(subject.readingMnemonic, term, 1);
    ranking += getRanking(subject.readingHint, term, 1);
    ranking += getRanking(subject.readingNote, term, 1);
    ranking += getRanking(oneMeaning(subject.meanings), term, 100);
    for (const m of subject.meanings) ranking += getRanking(m.meaning, term, 30);
    for (const m of subject.auxiliaryMeanings) ranking += getRanking(m.meaning, term, 30);
    for (const r of subject.readings) ranking += getRanking(r.reading, term, 30);
    for (const s of subject.partsOfSpeech) ranking += getRanking(s, term, 1);
    for (const s of subject.contextSentences) {
      ranking += getRanking(s.en, term, 1);
      ranking += getRanking(s.ja, term, 1);
    }
    for (const s of subject.meaningSynonyms) ranking += getRanking(s, term, 3);
    ranking |= 0;
  }
  return ranking;
}

/** A hit with its ranking. */
export interface RankedSubject {
  subject: SearchSubject;
  ranking: number;
}

/** Visible subjects in table scan order (id order), as `SELECT * FROM subject WHERE hiddenAt=0` returns them. */
function visibleInScanOrder(subjects: readonly SearchSubject[]): SearchSubject[] {
  return subjects.filter((s) => s.hiddenAt === 0).sort((a, b) => a.id - b.id);
}

function rank(hits: readonly SearchSubject[], query: string): RankedSubject[] {
  const javaTerms = splitTermsForJava(query);
  const ranked = hits.map((subject) => ({ subject, ranking: getSearchRanking(subject, javaTerms) }));
  // Collections.sort: stable, ranking descending.
  return ranked.sort((a, b) => b.ranking - a.ranking);
}

/** `SearchUtil.searchSubjects(1, query)` (the private `searchSubjects(CharSequence)`): ranked hits. */
export function searchByText(subjects: readonly SearchSubject[], query: string): RankedSubject[] {
  const terms = splitTermsForSql(query);
  if (terms.length === 0) return [];
  const hits = visibleInScanOrder(subjects).filter((s) => terms.every((t) => likeContains(s.searchTarget, t)));
  return rank(hits, query);
}

/** Java `String.trim()`: strips chars <= U+0020 only. */
function javaTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.slice(start, end);
}

/**
 * `SearchUtil.searchSubjectSuggestions(query)`: needs 3 chars after `trim`; matches on the
 * characters (`smallSearchTarget`) first and, when that gives fewer than 250, on `searchTarget`
 * instead; both cut at 250 in scan order before ranking.
 */
export function searchSuggestions(subjects: readonly SearchSubject[], query: string): RankedSubject[] {
  if (javaTrim(query).length < 3) return [];
  const terms = splitTermsForSql(query);
  if (terms.length === 0) return [];
  const visible = visibleInScanOrder(subjects);
  const limited = (column: (s: SearchSubject) => string | null): SearchSubject[] => {
    const out: SearchSubject[] = [];
    for (const s of visible) {
      if (terms.every((t) => likeContains(column(s), t))) {
        out.push(s);
        if (out.length === MAX_SEARCH_HITS) break;
      }
    }
    return out;
  };
  let hits = limited((s) => s.smallSearchTarget);
  if (hits.length < MAX_SEARCH_HITS) hits = limited((s) => s.searchTarget);
  return rank(hits, query);
}
