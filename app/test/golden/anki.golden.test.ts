import { ankiMode } from '../../src/core/anki/mode';
import type { Preferences, SessionType } from '../../src/core/settings';
import { goldenSuite } from './harness';
import type { ContentSubject, SubjectObject } from '../../src/core/content';
import { QUESTION_TYPES, possibleQuestionTypes, type QuestionType } from '../../src/core/answer';
import { ankiAnswerRichText } from '../../src/core/anki/answerText';
import {
  conjugatedVerb,
  declinedAdjective,
  inflectedCharacters,
  inflectionForm,
  randomAdjectiveDeclension,
  randomVerbConjugation,
  type AdjectiveType,
  type VerbType,
} from '../../src/core/anki/inflection';
import { SeededRandom } from '../../src/core/rng';
import { meaningSynonymsRichText } from '../../src/core/answer/synonymsRichText';
import { parseMeaningSynonyms, parseStudyMaterialJob, serializeSynonymsColumn } from '../../src/core/answer/synonyms';
import { writeStringList } from '../../src/core/answer/jackson';
import { boldRanges, type RichText } from '../../src/core/text/richText';
import { loadContentWithExtras } from './content';

const SESSION_TYPES: SessionType[] = ['LESSON', 'REVIEW', 'SELF_STUDY', 'NONE'];

goldenSuite<Preferences, unknown>('anki/mode-settings.json', (prefs) =>
  Object.fromEntries(SESSION_TYPES.map((st) => [st, QUESTION_TYPES.filter((qt) => ankiMode(prefs, st, qt))])),
);

const OBJECT_BY_TYPE_NAME: Record<string, SubjectObject> = {
  WANIKANI_RADICAL: 'radical',
  WANIKANI_KANJI: 'kanji',
  WANIKANI_VOCAB: 'vocabulary',
  WANIKANI_KANA_VOCAB: 'kana_vocabulary',
};

/** AnkiGoldenTest: both `getPossibleQuestionTypes` sets of the subject type, in enum order (a TreeSet). */
const allQuestionTypes = (object: SubjectObject): QuestionType[] => {
  const set = new Set([...possibleQuestionTypes(object, false), ...possibleQuestionTypes(object, true)]);
  return QUESTION_TYPES.filter((t) => set.has(t));
};

const reveal = (rich: RichText) => {
  const bold = boldRanges(rich);
  return { text: rich.text, bold, shownStyled: rich.spans.length > 0 };
};

function answers(subject: ContentSubject, types: readonly QuestionType[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const t of types) {
    const r: Record<string, unknown> = reveal(ankiAnswerRichText(subject, t, { showOnInKatakana: false }));
    if (t === 'WANIKANI_KANJI_READING' || t === 'WANIKANI_KANJI_ONYOMI') {
      r.katakana = reveal(ankiAnswerRichText(subject, t, { showOnInKatakana: true }));
    }
    out[t] = r;
  }
  return out;
}

goldenSuite<Record<string, unknown>, unknown>(
  'anki/answer-text.jsonl',
  async (input, c) => {
    const content = await loadContentWithExtras();
    const subject = content.byId.get(input.id as number) as ContentSubject;
    if (c.name.startsWith('synonyms/')) {
      // The save job stores the list, the subject reads the column back.
      const job = parseStudyMaterialJob(writeStringList([String(input.id), '', '', ...(input.synonyms as string[])]));
      const synonyms = parseMeaningSynonyms(serializeSynonymsColumn(job.meaningSynonyms));
      const rich = meaningSynonymsRichText(synonyms);
      return { hasMeaningSynonyms: synonyms.length > 0, text: rich.text, bold: boldRanges(rich) };
    }
    if (c.name.startsWith('escape/')) {
      const edited = {
        ...subject,
        meanings: JSON.parse(input.meanings as string),
        readings: JSON.parse(input.readings as string),
      };
      const out = answers(edited, allQuestionTypes(subject.object));
      // The escape cases record no katakana variant.
      for (const v of Object.values(out)) delete (v as Record<string, unknown>).katakana;
      return out;
    }
    return answers(subject, allQuestionTypes(OBJECT_BY_TYPE_NAME[input.object as string] as SubjectObject));
  },
  { needsContent: true },
);

goldenSuite<{ id: number; characters: string; partsOfSpeech: string[]; form: string }, unknown>(
  'anki/answer-inflection.json',
  async (input) => {
    const content = await loadContentWithExtras();
    const subject = content.byId.get(input.id) as ContentSubject;
    const out: Record<string, unknown> = {};
    for (const t of possibleQuestionTypes(subject.object, false)) {
      out[t] = {
        characters: inflectedCharacters(input.characters, inflectionForm(input.partsOfSpeech), input.form),
        text: ankiAnswerRichText(subject, t, { showOnInKatakana: false, inflection: input.form }).text,
      };
    }
    return out;
  },
  { needsContent: true },
);

interface InflectionPick {
  name: string;
  forms: string[];
}
const SAMPLE_VERBS: [string, VerbType][] = [['飲む', 'GODAN'], ['食べる', 'ICHIDAN'], ['勉強する', 'SURU']];
const SAMPLE_ADJECTIVES: [string, AdjectiveType][] = [['大きい', 'I'], ['静か', 'NA_PLAIN'], ['静か', 'NA_POLITE']];

/** One random pick and the sample words in that form. */
function inflectionPick(kind: string, rng: Pick<SeededRandom, 'nextDouble'>): InflectionPick {
  if (kind === 'verb') {
    const name = randomVerbConjugation(rng);
    return { name, forms: SAMPLE_VERBS.map(([v, t]) => conjugatedVerb(v, t, name)) };
  }
  const name = randomAdjectiveDeclension(rng);
  return { name, forms: SAMPLE_ADJECTIVES.map(([a, t]) => declinedAdjective(a, t, name)) };
}

goldenSuite<{ kind?: string; doubles?: number[]; seed?: number; kinds?: string[] }, unknown>(
  'anki/inflection-random.json',
  (input) => {
    if (input.doubles !== undefined) {
      const ds = [...input.doubles];
      const rng = { nextDouble: () => ds.shift() as number };
      return { picks: input.doubles.map(() => inflectionPick(input.kind as string, rng)) };
    }
    const rng = new SeededRandom(input.seed as number);
    return { picks: (input.kinds as string[]).map((k) => inflectionPick(k, rng)) };
  },
);
