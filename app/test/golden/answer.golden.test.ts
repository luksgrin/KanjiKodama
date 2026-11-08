import type { AuxiliaryMeaning, Meaning, Reading, SubjectObject } from '../../src/core/content';
import { TypedError } from '../../src/core/kana';
import {
  type AnswerVerdict,
  CLOSE_ENOUGH_ACTIONS,
  type CheckSubject,
  type CloseEnoughAction,
  QUESTION_TYPE_INFO,
  type QuestionType,
  androidToLowerCase,
  checkAnswer,
  cleanString,
  fuzzyMatches,
  getMatchScore,
  osaDistance,
  possibleQuestionTypes,
} from '../../src/core/answer';
import { cleanClass } from '../../src/core/answer/unicode';
import { goldenSuite, matchFixtures, readFixture } from './harness';

goldenSuite<{ a: string; b: string }, number>('answers/osa.json', (input) => osaDistance(input.a, input.b));

// --- fuzzy matching -----------------------------------------------------------------------------

interface FuzzyInput {
  answer: string;
  accepted: string[];
  rejected: string[];
}

function fuzzyByAction(input: FuzzyInput): Record<string, AnswerVerdict> {
  const out: Record<string, AnswerVerdict> = {};
  for (const action of CLOSE_ENOUGH_ACTIONS) out[action] = fuzzyMatches(input.answer, input.accepted, input.rejected, action);
  return out;
}

goldenSuite<FuzzyInput, unknown>('answers/fuzzy.json', fuzzyByAction);
goldenSuite<FuzzyInput, unknown>('answers/fuzzy-wk-*.jsonl', fuzzyByAction);

// --- Android Unicode: cleanString, matches, the character table, lower-casing ------------------------

goldenSuite<FuzzyInput, unknown>('answers/unicode-android.json', (input) => ({
  cleanString: {
    answer: cleanString(input.answer),
    accepted: input.accepted.map(cleanString),
    rejected: input.rejected.map(cleanString),
  },
  matches: fuzzyByAction(input),
}));

interface TableInput {
  from?: number;
  to?: number;
  codePoint?: number;
  string?: string;
}

goldenSuite<TableInput, Record<string, unknown>>('answers/unicode-android-table.json', (input, c) => {
  if (c.name.startsWith('type-')) {
    // unicodeData.ts is generated from these rows and keeps only cleanString's class, not the type number:
    // check the class of every code point in the range and pass the device's type through.
    const out = c.output as { type: number; class: string };
    for (let cp = input.from as number; cp <= (input.to as number); cp++) {
      const cls = CLASS_NAMES[cleanClass(cp)];
      if (cls !== out.class) return { type: out.type, class: `${cls} (U+${cp.toString(16).toUpperCase()})` };
    }
    return { type: out.type, class: out.class };
  }
  if (c.name.startsWith('lower-')) return { lower: androidToLowerCase(input.string as string) };
  return { lower: androidToLowerCase(input.string as string), cleanString: cleanString(input.string as string) };
});

const CLASS_NAMES = ['keep', 'space', 'replace'] as const;

// --- QuestionType.checkAnswer ----------------------------------------------------------------------

interface FixtureSubject {
  id: number;
  object: SubjectObject;
  characters: string | null;
  hiddenAt: number;
  meanings: Meaning[] | null;
  auxiliaryMeanings: AuxiliaryMeaning[] | null;
  readings: Reading[] | null;
}

interface CheckInput {
  subject: number | FixtureSubject;
  questionType: QuestionType;
  answer: string;
  matchingKanji: number | FixtureSubject | null;
  meaningSynonyms: string[];
}

let subjectsById: Map<number, FixtureSubject> | null = null;

function fixtureSubjects(): Map<number, FixtureSubject> {
  if (subjectsById === null) {
    subjectsById = new Map();
    for (const c of readFixture<FixtureSubject>('answers/check-subjects.jsonl').cases) subjectsById.set(c.input.id, c.input);
  }
  return subjectsById;
}

/** `Subject` as `checkAnswer` sees it: a null/empty JSON column parses to []. */
function toCheckSubject(s: FixtureSubject): CheckSubject {
  return { meanings: s.meanings ?? [], auxiliaryMeanings: s.auxiliaryMeanings ?? [], readings: s.readings ?? [] };
}

function resolve(s: number | FixtureSubject): FixtureSubject {
  if (typeof s !== 'number') return s;
  const found = fixtureSubjects().get(s);
  if (!found) throw new Error(`subject ${s} not in answers/check-subjects.jsonl`);
  return found;
}

function safeVerdict(run: () => AnswerVerdict): unknown {
  try {
    return run();
  } catch (e) {
    if (e instanceof TypedError) return { error: e.errorType };
    throw e;
  }
}

function checkOutputs(input: CheckInput): Record<string, unknown> {
  const subject = toCheckSubject(resolve(input.subject));
  const matchingKanji = input.matchingKanji === null ? null : toCheckSubject(resolve(input.matchingKanji));
  const out: Record<string, unknown> = {};
  const run = (closeEnoughAction: CloseEnoughAction, requireOnInKatakana: boolean): unknown =>
    safeVerdict(() =>
      checkAnswer(input.questionType, subject, input.answer, {
        meaningSynonyms: input.meaningSynonyms,
        matchingKanji,
        closeEnoughAction,
        requireOnInKatakana,
      }),
    );
  if (QUESTION_TYPE_INFO[input.questionType].meaning) {
    for (const action of CLOSE_ENOUGH_ACTIONS) out[action] = run(action, false);
  } else {
    for (const kata of [false, true]) out[`requireOnInKatakana=${kata}`] = run('SILENTLY_ACCEPT', kata);
  }
  return out;
}

goldenSuite<FixtureSubject, unknown>('answers/check-subjects.jsonl', (input) => ({
  questionTypes: possibleQuestionTypes(input.object, false),
  questionTypesOnKun: possibleQuestionTypes(input.object, true),
}));
goldenSuite<CheckInput, unknown>('answers/check-synthetic.json', checkOutputs);
// The per-question-type shards answers/check-<type>-N.jsonl (literal globs, so coverage.mjs sees them).
goldenSuite<CheckInput, unknown>('answers/check-radical-*.jsonl', checkOutputs);
goldenSuite<CheckInput, unknown>('answers/check-kanji-*.jsonl', checkOutputs);
goldenSuite<CheckInput, unknown>('answers/check-vocab-*.jsonl', checkOutputs);
goldenSuite<CheckInput, unknown>('answers/check-kana-*.jsonl', checkOutputs);
const CHECK_SHARDS = matchFixtures('answers/check-*.jsonl').filter((f) => /-\d+\.jsonl$/.test(f));

// --- Ties behind matchedAnswer ---------------------------------------------------------------------

goldenSuite<CheckInput, { verdicts: unknown }>('answers/check-ties-cases.json', (input) => ({
  verdicts: checkOutputs(input),
  ties: meaningTies(input),
}));

/** Which check case each `check-ties.jsonl` record belongs to (same name), loaded on first use. */
let checkInputsByName: Map<string, CheckInput> | null = null;

function checkInputFor(name: string): CheckInput {
  if (checkInputsByName === null) {
    const wanted = new Set<string>();
    for (const c of readFixture('answers/check-ties.jsonl').cases) wanted.add(c.name);
    checkInputsByName = new Map();
    const files = CHECK_SHARDS.filter((f) => /-(radical-name|kanji-meaning|vocab-meaning|kana-vocab-meaning)-/.test(f));
    for (const f of files) {
      for (const c of readFixture<CheckInput>(f).cases) if (wanted.has(c.name)) checkInputsByName.set(c.name, c.input);
    }
  }
  const found = checkInputsByName.get(name);
  if (!found) throw new Error(`no check case named ${name}`);
  return found;
}

goldenSuite<{ questionType: QuestionType; answer: string }, unknown>('answers/check-ties.jsonl', (_input, c) =>
  meaningTies(checkInputFor(c.name)),
);

/**
 * The ties: the accepted answers (in subject order) that share the best
 * fuzzy score, when there are at least two; `referencePick` is what `checkAnswer` chose.
 */
function meaningTies(input: CheckInput): unknown {
  const s = toCheckSubject(resolve(input.subject));
  const accepted: string[] = [];
  const rejected: string[] = [];
  const add = (m: string | null): void => {
    if (m !== null && !accepted.includes(m)) accepted.push(m);
  };
  for (const m of s.meanings) {
    if (m.accepted_answer) add(m.meaning);
    else if (m.meaning !== null) rejected.push(m.meaning);
  }
  for (const m of s.auxiliaryMeanings) {
    if (m.type === 'whitelist') add(m.meaning);
    else if (m.type === 'blacklist' && m.meaning !== null) rejected.push(m.meaning);
  }
  for (const m of input.meaningSynonyms) add(m);
  const clean = cleanString(input.answer);
  const NONE = Number.MAX_SAFE_INTEGER;
  let bestRejected = NONE;
  for (const r of rejected) bestRejected = Math.min(bestRejected, getMatchScore(clean, cleanString(r)));
  let best = NONE;
  let tied: string[] = [];
  for (const a of accepted) {
    const sc = getMatchScore(clean, cleanString(a));
    if (sc < best) {
      best = sc;
      tied = [];
    }
    if (sc === best && sc < NONE) tied.push(a);
  }
  if (best === NONE || best > bestRejected || tied.length < 2) return null;
  const v = checkAnswer(input.questionType, s, input.answer, {
    meaningSynonyms: input.meaningSynonyms,
    closeEnoughAction: 'SILENTLY_ACCEPT',
    requireOnInKatakana: false,
  });
  return { score: best, ties: tied, subjectOrderFirst: tied[0], referencePick: v.matchedAnswer };
}

// Device outputs that differ from the other fixtures (none so far): same shapes as fuzzy*/check-*.
goldenSuite<FuzzyInput | CheckInput, unknown>('answers/unicode-android-overrides.json', (input) =>
  'questionType' in input ? checkOutputs(input) : fuzzyByAction(input),
);
