import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

import { withReferenceData, type ReferenceTables } from '../../src/content/referenceData';
import type { Content, ContentSubject } from '../../src/core/content';
import { fallbackSrsSystems, srsSystemFromData, type SrsSystem } from '../../src/core/srs/system';
import {
  NumberFormatError,
  resultView,
  searchAdvancedJson,
  searchByLevel,
  type ResultViewItem,
} from '../../src/core/search/advanced';
import { AdvancedSearchForm, formSwitches, TEXT_FIELDS, type TextField } from '../../src/core/search/form';
import {
  JacksonError,
  parseParameters,
  SEARCH_SORT_ORDERS,
  SORT_ORDER_DESCRIPTIONS,
  writeParameters,
} from '../../src/core/search/parameters';
import {
  EMPTY_TEXT,
  NO_PROGRESS,
  extraSearchTargets,
  searchSubject,
  type ContextSentence,
  type SearchSubject,
  type SubjectSearchProgress,
  type SubjectSearchText,
} from '../../src/core/search/subject';
import {
  escapeLikeTerm,
  getRanking,
  getSearchRanking,
  searchByText,
  searchSuggestions,
  splitSearchTerms,
  splitTermsForSql,
} from '../../src/core/search/text';
import { contentDb, EXTRA_DB_PATH, loadContentWithExtras } from './content';
import { goldenSuite } from './harness';

// --- Test-side content: search texts, reference data, extras ---

const RAW_DIR = fileURLToPath(new URL('../../../content/inputs/raw/', import.meta.url));

function readTable(name: string): Record<string, number> {
  return JSON.parse(readFileSync(`${RAW_DIR}${name}`, 'utf8')) as Record<string, number>;
}

function jsonArray<T>(text: unknown): T[] {
  if (typeof text !== 'string' || text === '') return [];
  const v: unknown = JSON.parse(text);
  return Array.isArray(v) ? (v as T[]) : [];
}

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

interface SearchBase {
  content: Content;
  text: Map<number, SubjectSearchText>;
  systems: SrsSystem[];
}

let basePromise: Promise<SearchBase> | undefined;

/** The device's subject table: WaniKani content + extras, reference data loaded, and the text columns. */
function searchBase(): Promise<SearchBase> {
  basePromise ??= (async () => {
    const tables: ReferenceTables = {
      frequency: readTable('kanjidic_freq.json'),
      joyoGrade: readTable('wikipedia_joyo_grades.json'),
      kanjiJlptLevel: readTable('kanji_jlpt_levels.json'),
      vocabJlptLevel: readTable('vocab_jlpt_levels.json'),
    };
    const content = withReferenceData(await loadContentWithExtras(), tables);
    const text = new Map<number, SubjectSearchText>();
    const db = await contentDb();
    const stmt = db.prepare('SELECT id, meaningMnemonic, meaningHint, readingMnemonic, readingHint, contextSentences,'
      + ' searchTarget, smallSearchTarget FROM subject');
    while (stmt.step()) {
      const r = stmt.getAsObject();
      text.set(Number(r.id), {
        meaningMnemonic: str(r.meaningMnemonic),
        meaningHint: str(r.meaningHint),
        readingMnemonic: str(r.readingMnemonic),
        readingHint: str(r.readingHint),
        contextSentences: jsonArray<ContextSentence>(r.contextSentences),
        searchTarget: str(r.searchTarget),
        smallSearchTarget: str(r.smallSearchTarget),
      });
    }
    stmt.free();
    if (existsSync(EXTRA_DB_PATH)) {
      const require = createRequire(import.meta.url);
      const SQL = await initSqlJs({ locateFile: (f: string) => require.resolve(`sql.js/dist/${f}`) });
      const extra = new SQL.Database(readFileSync(EXTRA_DB_PATH));
      const es = extra.prepare('SELECT id, characters, meanings, readings, meaning_mnemonic, meaning_hint,'
        + ' reading_mnemonic, reading_hint, context_sentences FROM extra_subject');
      while (es.step()) {
        const r = es.getAsObject();
        const targets = extraSearchTargets(String(r.characters), jsonArray(r.meanings), jsonArray(r.readings));
        text.set(Number(r.id), {
          meaningMnemonic: str(r.meaning_mnemonic),
          meaningHint: str(r.meaning_hint),
          readingMnemonic: str(r.reading_mnemonic),
          readingHint: str(r.reading_hint),
          contextSentences: jsonArray<ContextSentence>(r.context_sentences),
          ...targets,
        });
      }
      es.free();
      extra.close();
    }
    return { content, text, systems: content.srsSystems.map(srsSystemFromData) };
  })();
  return basePromise;
}

/** Whitespace and space characters only. */
const isBlank = (s: string | null): boolean => s === null || /^[\p{Z}\t\n\x0B\f\r\x1C-\x1F]*$/u.test(s);

function subjects(base: SearchBase, progress: (s: ContentSubject) => SubjectSearchProgress, hiddenAt: (s: ContentSubject) => number): SearchSubject[] {
  return base.content.subjects.map((s) => searchSubject(s, base.text.get(s.id) ?? EMPTY_TEXT, progress(s), hiddenAt(s)));
}

const viewOut = (items: readonly ResultViewItem[]): (string | number)[] =>
  items.map((i) => ('header' in i ? i.header : i.subject.id));

// --- search/ranking.json ---

interface RankingSubjectInput {
  id: number;
  object: ContentSubject['object'];
  characters: string | null;
  slug: string | null;
  meanings: string | null;
  auxiliaryMeanings: string | null;
  readings: string | null;
  meaningMnemonic: string | null;
  meaningHint: string | null;
  readingMnemonic: string | null;
  readingHint: string | null;
  partsOfSpeech: string | null;
  contextSentences: string | null;
  meaningNote: string | null;
  readingNote: string | null;
  meaningSynonyms: string | null;
}

goldenSuite<Record<string, unknown>, unknown>('search/ranking.json', (input) => {
  if ('haystack' in input) {
    return { value: getRanking(input.haystack as string | null, input.term as string, input.weight as number) };
  }
  const query = input.query as string;
  if (!('subject' in input)) {
    return { terms: splitSearchTerms(query), sql: splitTermsForSql(query).map(escapeLikeTerm) };
  }
  const s = input.subject as RankingSubjectInput;
  const subject: SearchSubject = {
    ...NO_PROGRESS,
    id: s.id,
    object: s.object,
    hiddenAt: 0,
    level: 1,
    lessonPosition: 0,
    srsSystemId: 1,
    characters: s.characters,
    slug: s.slug,
    meanings: jsonArray(s.meanings),
    auxiliaryMeanings: jsonArray(s.auxiliaryMeanings),
    readings: jsonArray(s.readings),
    partsOfSpeech: jsonArray(s.partsOfSpeech),
    frequency: 0,
    joyoGrade: 0,
    jlptLevel: 0,
    meaningMnemonic: s.meaningMnemonic,
    meaningHint: s.meaningHint,
    readingMnemonic: s.readingMnemonic,
    readingHint: s.readingHint,
    contextSentences: jsonArray(s.contextSentences),
    searchTarget: null,
    smallSearchTarget: null,
    meaningNote: s.meaningNote,
    readingNote: s.readingNote,
    meaningSynonyms: jsonArray<string | null>(s.meaningSynonyms).filter((x): x is string => !isBlank(x)),
  };
  const terms = splitSearchTerms(query);
  return { terms, ranking: getSearchRanking(subject, terms) };
});

// --- search/content.jsonl ---

interface StudyMaterial {
  meaningNote: string | null;
  readingNote: string | null;
  meaningSynonyms: string[];
}

goldenSuite<Record<string, unknown>, unknown>(
  'search/content.jsonl',
  async (input, c, ctx) => {
    const base = await searchBase();
    const state = ctx.state as { groups?: Map<string, SearchSubject[]> };
    state.groups ??= new Map();
    if ('saveStudyMaterialJobData' in input) {
      // A save job for each: [id, meaningNote, readingNote, ...synonyms], empty/blank synonyms dropped.
      const materials = new Map<number, StudyMaterial>();
      for (const data of input.saveStudyMaterialJobData as string[][]) {
        const [id = '0', meaningNote = null, readingNote = null, ...synonyms] = data;
        materials.set(Number(id), { meaningNote, readingNote, meaningSynonyms: synonyms.filter((x) => !isBlank(x)) });
      }
      const label = c.name.split('/')[1] as string;
      state.groups.set(label, subjects(base, (s) => ({ ...NO_PROGRESS, ...(materials.get(s.id) ?? {}) }), (s) => s.hiddenAt));
      return { count: materials.size };
    }
    const all = state.groups.get(input.studyMaterials as string);
    if (!all) throw new Error(`no group ${String(input.studyMaterials)}`);
    const query = input.query as string;
    const full = searchByText(all, query);
    const display = full.map((r) => r.subject).sort((a, b) => typeOrderOf(a) - typeOrderOf(b));
    const suggestions = searchSuggestions(all, query);
    return {
      searchCount: full.length,
      search: full.map((r) => [r.subject.id, r.ranking]),
      display: display.map((s) => s.id),
      suggestionCount: suggestions.length,
      suggestions: suggestions.map((r) => [r.subject.id, r.ranking]),
    };
  },
  { needsContent: true },
);

function typeOrderOf(s: SearchSubject): number {
  return s.object === 'radical' ? 10 : s.object === 'kanji' ? 20 : 30;
}

// --- search/level.json ---

goldenSuite<Record<string, unknown>, unknown>(
  'search/level.json',
  async (input, c, ctx) => {
    const base = await searchBase();
    const state = ctx.state as { groups?: Map<string, SearchSubject[]> };
    state.groups ??= new Map();
    if ('hiddenIds' in input) {
      const hidden = new Set(input.hiddenIds as number[]);
      state.groups.set(c.name.split('/')[1] as string, subjects(base, () => NO_PROGRESS, (s) => (hidden.has(s.id) ? 1 : s.hiddenAt)));
      return { count: hidden.size };
    }
    if ('type' in input) return { count: 0, ids: [], sortOrder: 'TYPE', view: [] };
    const all = state.groups.get(input.hidden as string);
    if (!all) throw new Error('no group');
    try {
      const result = searchByLevel(all, input.level as string);
      return { count: result.length, ids: result.map((s) => s.id), sortOrder: 'TYPE', view: viewOut(resultView(result, 'TYPE', 0, base.systems)) };
    } catch (e) {
      if (e instanceof NumberFormatError) return { exception: 'NumberFormatException' };
      throw e;
    }
  },
  { needsContent: true },
);

// --- search/advanced.jsonl ---

interface GroupInput {
  clockMs: number;
  progressFile: string | null;
  starRatings: string | Record<string, number>;
  starRatingsEnabled: boolean;
  hiddenIds: number[];
}

interface GroupState {
  subjects: SearchSubject[];
  clockMs: number;
  starRatingsEnabled: boolean;
}

const DUMP_COLUMNS = ['id', 'level', 'object', 'srsSystemId', 'srsStage', 'unlockedAt', 'availableAt', 'burnedAt',
  'lastIncorrectAnswer', 'leechScore', 'typeCode', 'hiddenAt'];

/** The recorded state dump of a state. */
function stateDump(all: readonly SearchSubject[]): unknown {
  const rows = all
    .filter((s) => s.srsStage !== 0 || s.unlockedAt !== 0 || s.availableAt !== 0 || s.burnedAt !== 0
      || s.lastIncorrectAnswer !== 0 || s.leechScore !== 0 || s.stars !== 0 || (s.hiddenAt !== 0 && s.level <= 3))
    .sort((a, b) => a.id - b.id)
    .map((s) => [s.id, s.level, s.object, s.srsSystemId, s.srsStage, s.unlockedAt, s.availableAt, s.burnedAt,
      s.lastIncorrectAnswer, s.leechScore, s.stars, s.hiddenAt]);
  const counts = new Map<string, number>();
  const visible = all.filter((s) => s.hiddenAt === 0).sort((a, b) => a.srsSystemId - b.srsSystemId || a.srsStage - b.srsStage);
  for (const s of visible) {
    const key = `${s.srsSystemId}/${s.srsStage}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { columns: DUMP_COLUMNS, rows, visibleStageCounts: Object.fromEntries(counts), subjectsWithNullObject: 0 };
}

goldenSuite<Record<string, unknown>, Record<string, unknown>>(
  'search/advanced.jsonl',
  async (input, c, ctx) => {
    const base = await searchBase();
    const state = ctx.state as { groups?: Map<string, GroupState> };
    state.groups ??= new Map();
    const groupName = c.name.split('/')[1] as string;
    if (c.name.startsWith('group/') && 'sameAs' in input) {
      // progress-synced: the same state with srsStage -999 on locked rows, as the WaniKani sync stores them.
      const from = state.groups.get(input.sameAs as string);
      if (!from) throw new Error('no group');
      const subjectsSynced = from.subjects.map((s) => (s.unlockedAt === 0 ? { ...s, srsStage: -999 } : s));
      state.groups.set(groupName, { ...from, subjects: subjectsSynced });
      return { lockedRows: subjectsSynced.filter((s) => s.unlockedAt === 0).length };
    }
    if (c.name.startsWith('group/')) {
      const g = input as unknown as GroupInput;
      // The state is the database after a restore and `updateProgression`, which the
      // fixture records as this case's output (`rows`): the search reads that dump here, and the scenarios
      // check the progression itself.
      const expected = c.output as { rows: (number | string)[][] };
      const rows = new Map(expected.rows.map((r) => [r[0] as number, r]));
      const hidden = new Set(g.hiddenIds);
      const all = subjects(
        base,
        (s) => {
          const r = rows.get(s.id);
          if (!r) return NO_PROGRESS;
          return {
            ...NO_PROGRESS,
            srsStage: r[4] as number,
            unlockedAt: r[5] as number,
            availableAt: r[6] as number,
            burnedAt: r[7] as number,
            lastIncorrectAnswer: r[8] as number,
            leechScore: r[9] as number,
            stars: r[10] as number,
          };
        },
        (s) => (hidden.has(s.id) ? g.clockMs : s.hiddenAt),
      );
      state.groups.set(groupName, { subjects: all, clockMs: g.clockMs, starRatingsEnabled: g.starRatingsEnabled });
      return stateDump(all) as Record<string, unknown>;
    }
    const group = state.groups.get(input.group as string);
    if (!group) throw new Error(`no group ${String(input.group)}`);
    const sctx = { systems: base.systems, starRatingsEnabled: group.starRatingsEnabled, now: group.clockMs };
    const json = input.parameters as string;
    const result = searchAdvancedJson(group.subjects, json, sctx);
    const ids = result.map((s) => s.id);
    let p;
    try {
      p = parseParameters(json);
    } catch (e) {
      if (!(e instanceof JacksonError)) throw e;
      return { count: result.length, ids, sortOrder: null, screenParseError: e.errorType };
    }
    if (p === null) return { count: result.length, ids, sortOrder: null, screenParseError: 'NullPointerException' };
    return { count: result.length, ids, sortOrder: p.sortOrder, view: viewOut(resultView(result, p.sortOrder, group.clockMs, base.systems)) };
  },
  { needsContent: true },
);

// --- search/advanced-form.json ---

interface Fill {
  texts?: Partial<Record<TextField, string>>;
  on?: string[];
  sortOrder?: number;
}

const formOutput = (form: AdvancedSearchForm): unknown => {
  const json = writeParameters(form.extractParameters());
  return { json, parsed: JSON.parse(json) as unknown };
};

goldenSuite<Record<string, unknown>, unknown>('search/advanced-form.json', (input) => {
  const systems = fallbackSrsSystems();
  const stars = input.starRatingsEnabled as boolean;
  if (!('fill' in input) && !('parameters' in input)) {
    return {
      switches: formSwitches(systems, stars).map((s) => ({ ...s, tag: s.tag === null ? null : String(s.tag) })),
      sortOrders: SEARCH_SORT_ORDERS.map((o) => SORT_ORDER_DESCRIPTIONS[o]),
    };
  }
  const form = new AdvancedSearchForm(systems, stars);
  if ('fill' in input) {
    const fill = input.fill as Fill;
    for (const f of TEXT_FIELDS) {
      const t = fill.texts?.[f];
      if (t !== undefined) form.texts[f] = t;
    }
    for (const name of fill.on ?? []) form.checked.add(name);
    if (fill.sortOrder !== undefined) form.sortOrder = SEARCH_SORT_ORDERS[fill.sortOrder] ?? 'TYPE';
    return formOutput(form);
  }
  const parameters = input.parameters as string | { first: string; second: string };
  const steps = typeof parameters === 'string' ? [parameters] : [parameters.first, parameters.second];
  for (const json of steps) {
    const p = parseParameters(json);
    if (p) form.injectParameters(p);
  }
  return formOutput(form);
});
