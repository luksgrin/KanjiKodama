/**
 * Randomized inflections: with `review_randomize_inflections` (or the self-study one) on, a verb or
 * adjective question shows an inflected form and the revealed answer names it.
 *
 * Java: `util/InflectionUtil`, `model/Question.getInflectionForm` / `getInflection` / `getCharacters`.
 * Fixtures: `anki/answer-inflection.json` (every form, picked explicitly), `anki/inflection-random.json` (the random
 * pick), `scenarios/anki-randomize-inflections-*.json` (in sessions).
 */
import type { Rng } from '../rng';

type StemForm = 'DICTIONARY' | 'CONJUNCTIVE' | 'NAI' | 'IMPERATIVE' | 'VOLITIONAL' | 'TE' | 'TA';
export type VerbType = 'ICHIDAN' | 'GODAN' | 'SURU';
export type AdjectiveType = 'I' | 'NA_PLAIN' | 'NA_POLITE';

/** `InflectionUtil.verbEndings`: name → [stem form, ending]. */
const VERB_ENDINGS: ReadonlyMap<string, readonly [StemForm, string]> = new Map<string, readonly [StemForm, string]>([
  ['polite non past', ['CONJUNCTIVE', 'ます']],
  ['polite past', ['CONJUNCTIVE', 'ました']],
  ['polite negative', ['CONJUNCTIVE', 'ません']],
  ['polite negative past', ['CONJUNCTIVE', 'ませんでした']],
  ['polite imperative', ['CONJUNCTIVE', 'なさい']],
  ['polite imperative, short', ['CONJUNCTIVE', 'な']],
  ['polite volitional', ['CONJUNCTIVE', 'ましょう']],
  ['polite conjunction', ['CONJUNCTIVE', 'まして']],
  ['nominalization', ['DICTIONARY', 'こと']],
  ['sometimes', ['DICTIONARY', 'ことがある']],
  ['decide on', ['DICTIONARY', 'ことにする']],
  ['is decided', ['DICTIONARY', 'ことになる']],
  ['"before"', ['DICTIONARY', '前に']],
  ['hypothetical if', ['DICTIONARY', 'なら(ば)']],
  ['if (sure)', ['DICTIONARY', 'と']],
  ['"should be"', ['DICTIONARY', 'はず']],
  ['"seems like"', ['DICTIONARY', 'みたい']],
  ['"I hear"', ['DICTIONARY', 'そう']],
  ['"apparently"', ['DICTIONARY', 'らしい']],
  ['"[motion] and [do]"', ['CONJUNCTIVE', 'に + motion verb']],
  ['"easy to"', ['CONJUNCTIVE', 'やすい']],
  ['"difficult to"', ['CONJUNCTIVE', 'にくい']],
  ['"too much"', ['CONJUNCTIVE', 'すぎる']],
  ["speaker's desire", ['CONJUNCTIVE', 'たい']],
  ["someone's desire", ['CONJUNCTIVE', 'たがる']],
  ['"while"', ['CONJUNCTIVE', 'ながら']],
  ['"often"', ['CONJUNCTIVE', 'がち']],
  ['"way of"', ['CONJUNCTIVE', '方']],
  ['"looks like ..."', ['CONJUNCTIVE', 'そう']],
  ['negative', ['NAI', 'ない']],
  ['negative て-form', ['NAI', 'なくて']],
  ['past negative', ['NAI', 'なかった']],
  ['"don\'t do please"', ['NAI', 'ないでください']],
  ['"without"', ['NAI', 'ないで']],
  ['must (informal)', ['NAI', 'なきゃ']],
  ['must (formal)', ['NAI', 'なくてはいけない']],
  ['imperative', ['IMPERATIVE', '']],
  ['past', ['TA', '']],
  ['"have before"', ['TA', 'ことがある']],
  ['continuing', ['TE', 'いる']],
  ['continuing (informal)', ['TE', 'る']],
  ['resulting', ['TE', 'ある']],
  ['"try"', ['TE', 'みる']],
  ['"please"', ['TE', 'ください']],
]);

/** Godan endings: conjunctive, nai, imperative, volitional, te. */
const GODAN: Readonly<Record<string, readonly string[]>> = {
  う: ['い', 'わ', 'え', 'お', 'って'],
  つ: ['ち', 'た', 'て', 'と', 'って'],
  る: ['り', 'ら', 'れ', 'ろ', 'って'],
  ぬ: ['に', 'な', 'ね', 'の', 'んで'],
  む: ['み', 'ま', 'め', 'も', 'んで'],
  ぶ: ['び', 'ば', 'べ', 'ぼ', 'んで'],
  く: ['き', 'か', 'け', 'こ', 'いて'],
  ぐ: ['ぎ', 'が', 'げ', 'ご', 'いで'],
  す: ['し', 'さ', 'せ', 'そ', 'して'],
};
const GODAN_INDEX: Partial<Record<StemForm, number>> = { CONJUNCTIVE: 0, NAI: 1, IMPERATIVE: 2, VOLITIONAL: 3, TE: 4 };

/** `VerbEnding.getStem`: the stem the ending attaches to, or null when the verb doesn't fit. */
function verbStem(verb: string, verbType: VerbType, stemForm: StemForm): string | null {
  if (stemForm === 'DICTIONARY') return verb;
  if (verbType === 'SURU') {
    const prefix = verb.endsWith('する') ? verb.substring(0, verb.length - 2) : verb;
    const suru: Record<StemForm, string> = {
      DICTIONARY: 'する',
      CONJUNCTIVE: 'し',
      // KanjiKodama fix (also in Java): the NAI endings already start with な, so the stem is し, not しな.
      NAI: 'し',
      IMPERATIVE: 'しろ',
      VOLITIONAL: 'しよう',
      TE: 'して',
      TA: 'した',
    };
    return prefix + suru[stemForm];
  }
  const prefix = verb.substring(0, verb.length - 1);
  const lastChar = verb.substring(verb.length - 1);
  if (verbType === 'ICHIDAN') {
    if (lastChar !== 'る') return null;
    if (stemForm === 'TE') return `${prefix}て`;
    if (stemForm === 'TA') return `${prefix}た`;
    if (stemForm === 'VOLITIONAL') return `${prefix}よ`;
    return prefix;
  }
  const endings = GODAN[lastChar];
  if (endings === undefined) return null;
  if (stemForm === 'TA') {
    const te = endings[GODAN_INDEX.TE as number] as string;
    return prefix + te.replace('て', 'た').replace('で', 'だ');
  }
  return prefix + (endings[GODAN_INDEX[stemForm] as number] as string);
}

/** `InflectionUtil.getConjugatedVerb`: the verb unchanged when the form doesn't apply. */
export function conjugatedVerb(verb: string, verbType: VerbType, endingName: string): string {
  const e = VERB_ENDINGS.get(endingName);
  if (e === undefined) throw new Error(`unknown verb ending ${endingName}`);
  const stem = verbStem(verb, verbType, e[0]);
  return stem === null ? verb : stem + e[1];
}

/** `InflectionUtil.adjectiveEndings`: name → [い, な plain, な polite]. */
const ADJECTIVE_ENDINGS: ReadonlyMap<string, readonly [string, string, string]> = new Map<
  string,
  readonly [string, string, string]
>([
  ['past', ['かった', 'だった', 'でした']],
  ['conjunctive', ['くて', 'で', 'でして']],
  ['negative (spoken)', ['くない', 'じゃない', 'じゃありません']],
  ['negative (written)', ['くない', 'ではない', 'ではありません']],
  ['negative past (spoken)', ['くなかった', 'じゃなかった', 'じゃありませんでした']],
  ['negative past (written)', ['くなかった', 'ではなかった', 'ではありませんでした']],
  ['negative conjunctive', ['くなくて', 'で', 'でして']],
]);

/** `InflectionUtil.getDeclinedAdjective`. */
export function declinedAdjective(adjective: string, adjectiveType: AdjectiveType, declension: string): string {
  const e = ADJECTIVE_ENDINGS.get(declension);
  if (e === undefined) throw new Error(`unknown adjective declension ${declension}`);
  if (adjectiveType === 'I') return adjective.substring(0, adjective.length - 1) + e[0];
  return adjective + (adjectiveType === 'NA_PLAIN' ? e[1] : e[2]);
}

/** Every verb conjugation name and adjective declension name. */
export const VERB_CONJUGATIONS: readonly string[] = [...VERB_ENDINGS.keys()];
export const ADJECTIVE_DECLENSIONS: readonly string[] = [...ADJECTIVE_ENDINGS.keys()];

const INFLECTING = ['godan verb', 'ichidan verb', 'する verb', 'い adjective', 'な adjective'] as const;
export type InflectingPartOfSpeech = (typeof INFLECTING)[number];

/** `Question.getInflectionForm` with the setting on: the first part of speech that inflects, or null. */
export function inflectionForm(partsOfSpeech: readonly string[]): InflectingPartOfSpeech | null {
  for (const p of partsOfSpeech) if ((INFLECTING as readonly string[]).includes(p)) return p as InflectingPartOfSpeech;
  return null;
}

/** Java `String.hashCode`. */
function javaStringHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * The iteration order of a `java.util.HashMap<String, V>` filled with `keys` in this order (default capacity 16 and
 * load factor 0.75, doubling while `size > 0.75 * capacity`): by bucket `(h ^ (h >>> 16)) & (capacity - 1)`, then
 * insertion order within a bucket (a resize keeps it). Buckets here stay far below the 8 entries that would turn one
 * into a tree.
 */
export function javaHashMapKeyOrder(keys: readonly string[]): string[] {
  let capacity = 16;
  while (keys.length > capacity * 0.75) capacity *= 2;
  const bucket = (k: string): number => {
    const h = javaStringHash(k);
    return (h ^ (h >>> 16)) & (capacity - 1);
  };
  return keys.map((k, i) => ({ k, i, b: bucket(k) })).sort((x, y) => x.b - y.b || x.i - y.i).map((e) => e.k);
}

/** `verbEndings.keySet().toArray()` / `adjectiveEndings.keySet().toArray()`: what the random pick indexes. */
export const VERB_CONJUGATION_KEY_ORDER: readonly string[] = javaHashMapKeyOrder(VERB_CONJUGATIONS);
export const ADJECTIVE_DECLENSION_KEY_ORDER: readonly string[] = javaHashMapKeyOrder(ADJECTIVE_DECLENSIONS);

/**
 * `InflectionUtil.getRandomVerbConjugation` / `getRandomAdjectiveDeclension`:
 * `keySet().toArray()[(int) (Math.random() * size)]`. `rng.nextDouble()` stands for `Math.random()` (the app passes
 * an unseeded generator; golden tests a `JavaRandom` matching the Java seam `InflectionUtil.setRandomSourceForTesting`).
 * Fixture: `anki/inflection-random.json`.
 */
export function randomVerbConjugation(rng: Pick<Rng, 'nextDouble'>): string {
  return VERB_CONJUGATION_KEY_ORDER[Math.trunc(rng.nextDouble() * VERB_CONJUGATION_KEY_ORDER.length)] as string;
}

export function randomAdjectiveDeclension(rng: Pick<Rng, 'nextDouble'>): string {
  return ADJECTIVE_DECLENSION_KEY_ORDER[Math.trunc(rng.nextDouble() * ADJECTIVE_DECLENSION_KEY_ORDER.length)] as string;
}

/** `Question.getInflection`'s pick for a subject whose inflection form is `form` (`isVerb`: the form contains "verb"). */
export function randomInflection(form: InflectingPartOfSpeech, rng: Pick<Rng, 'nextDouble'>): string {
  return form.includes('verb') ? randomVerbConjugation(rng) : randomAdjectiveDeclension(rng);
}

/** `Question.getCharacters(subject, sessionType)` with an inflection chosen (`form` is the subject's). */
export function inflectedCharacters(characters: string, form: InflectingPartOfSpeech | null, inflection: string): string {
  switch (form) {
    case 'godan verb':
      return conjugatedVerb(characters, 'GODAN', inflection);
    case 'ichidan verb':
      return conjugatedVerb(characters, 'ICHIDAN', inflection);
    case 'する verb':
      return conjugatedVerb(characters, 'SURU', inflection);
    case 'い adjective':
      return declinedAdjective(characters, 'I', inflection);
    case 'な adjective':
      return declinedAdjective(characters, 'NA_PLAIN', inflection);
    default:
      return characters;
  }
}
