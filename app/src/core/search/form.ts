/**
 * `views/AdvancedSearchFormView` without the views: which switches the form has (and shows), how
 * its texts, switches and sort order become parameters (`extractParameters`), and how parameters
 * fill it (`injectParameters`, the Refine button), including the values it has no switch for, which
 * it keeps and adds back on the next extract.
 */

import { SUBJECT_TYPES, type SubjectTypeName } from '../content';
import { romanNumeral, type SrsSystem } from '../srs/system';
import { hashSetOrder, integerHash, stringHash } from './javaHashSet';
import { SEARCH_SORT_ORDERS, defaultParameters, type AdvancedSearchParameters, type SearchSortOrder } from './parameters';

/** A switch's tag: the value it stands for. */
export type SwitchTag = number | string | SubjectTypeName | null;

export interface FormSwitch {
  /** The view id name in `advanced_search.xml`, e.g. `srsStage03`. */
  name: string;
  tag: SwitchTag;
  visible: boolean;
  /** The stage switches' label text; null for the others. */
  label: string | null;
}

/** The text fields, by view id name. */
export const TEXT_FIELDS = [
  'minLevel', 'maxLevel', 'minFrequency', 'maxFrequency', 'reviewLessHours', 'reviewMoreHours',
  'incorrectHours', 'burnedLessDays', 'burnedMoreDays',
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

const FIELD_PARAMETER: Readonly<Record<TextField, keyof AdvancedSearchParameters>> = {
  minLevel: 'minLevel',
  maxLevel: 'maxLevel',
  minFrequency: 'minFrequency',
  maxFrequency: 'maxFrequency',
  reviewLessHours: 'upcomingReviewLessThan',
  reviewMoreHours: 'upcomingReviewMoreThan',
  incorrectHours: 'incorrectAnswerWithin',
  burnedLessDays: 'burnedLessThan',
  burnedMoreDays: 'burnedMoreThan',
};

type Group = 'starRatings' | 'srsStages' | 'itemTypes' | 'jlptLevels' | 'joyoGrades';

/** `AdvancedSearchFormView.init`: the switches in layout order, with their tags and visibility. */
export function formSwitches(systems: readonly SrsSystem[], starRatingsEnabled: boolean): FormSwitch[] {
  const out: FormSwitch[] = [{ name: 'limitToLeeches', tag: null, visible: true, label: null }];
  for (let i = 0; i <= 5; i++) out.push({ name: `starRating${i}`, tag: i, visible: starRatingsEnabled, label: null });
  const stages: [string, string][] = [['Locked', 'locked'], ['Initiate', 'initial']];
  const apprentice = Math.max(0, ...systems.map((s) => s.numPrePassedStages));
  for (let i = 0; i < apprentice; i++) stages.push([`Apprentice ${romanNumeral(i + 1)}`, `prepass:${i}`]);
  const guru = Math.max(0, ...systems.map((s) => s.numPassedStages - 2));
  for (let i = 0; i < guru; i++) stages.push([`Guru ${romanNumeral(i + 1)}`, `pass:${i}`]);
  stages.push(['Master', 'master'], ['Enlightened', 'enlightened'], ['Burned', 'burned']);
  for (let i = 0; i < 20; i++) {
    const name = `srsStage${String(i).padStart(2, '0')}`;
    const stage = stages[i];
    out.push(stage
      ? { name, tag: stage[1], visible: true, label: stage[0] }
      : { name, tag: null, visible: false, label: `Stage ${String(i).padStart(2, '0')}:` });
  }
  const typeNames = ['itemTypeRadical', 'itemTypeKanji', 'itemTypeVocabulary', 'itemTypeKanaVocabulary'];
  SUBJECT_TYPES.forEach((t, i) => out.push({ name: typeNames[i] as string, tag: t, visible: true, label: null }));
  const jlpt: [string, number][] = [['jlptLevelNone', 0], ['jlptLevelN5', 5], ['jlptLevelN4', 4], ['jlptLevelN3', 3],
    ['jlptLevelN2', 2], ['jlptLevelN1', 1]];
  for (const [name, tag] of jlpt) out.push({ name, tag, visible: true, label: null });
  out.push({ name: 'joyoGradeNone', tag: 0, visible: true, label: null });
  for (let i = 1; i <= 7; i++) out.push({ name: `joyoGrade${i}`, tag: i, visible: true, label: null });
  return out;
}

function groupOf(name: string): Group | null {
  if (name.startsWith('starRating')) return 'starRatings';
  if (name.startsWith('srsStage')) return 'srsStages';
  if (name.startsWith('itemType')) return 'itemTypes';
  if (name.startsWith('jlptLevel')) return 'jlptLevels';
  if (name.startsWith('joyoGrade')) return 'joyoGrades';
  return null;
}

/**
 * `AdvancedSearchFormView.parseNumber`: `Integer.parseInt(text, 10)`, and a whole number beyond
 * the int range clamped; anything else (`1.5`, `abc`, ` 5`) throws, and the field is skipped.
 */
export function parseFormNumber(text: string): number | null {
  const m = /^([+-]?)(\p{Nd}+)$/u.exec(text);
  if (!m) return null;
  let v = 0n;
  for (const c of m[2] as string) {
    let zero = c.charCodeAt(0);
    while (/\p{Nd}/u.test(String.fromCharCode(zero - 1)) && c.charCodeAt(0) - zero < 9) zero--;
    v = v * 10n + BigInt((c.charCodeAt(0) - zero) % 10);
  }
  if (m[1] === '-') v = -v;
  if (v > 2147483647n) return 2147483647;
  if (v < -2147483648n) return -2147483648;
  return Number(v);
}

/** The form's state: texts, checked switches, the sort order spinner, and the kept unshown values. */
export class AdvancedSearchForm {
  readonly switches: FormSwitch[];
  texts: Record<TextField, string> = Object.fromEntries(TEXT_FIELDS.map((f) => [f, ''])) as Record<TextField, string>;
  checked = new Set<string>();
  sortOrder: SearchSortOrder = 'TYPE';
  private unshown: Record<Group, SwitchTag[]> = { starRatings: [], srsStages: [], itemTypes: [], jlptLevels: [], joyoGrades: [] };

  constructor(systems: readonly SrsSystem[], starRatingsEnabled: boolean) {
    this.switches = formSwitches(systems, starRatingsEnabled);
  }

  /** `extractParameters`: the parameters the Search button uses. */
  extractParameters(): AdvancedSearchParameters {
    const p = defaultParameters();
    for (const field of TEXT_FIELDS) {
      const text = this.texts[field];
      if (text.length === 0) continue;
      const n = parseFormNumber(text);
      if (n !== null) (p[FIELD_PARAMETER[field]] as number | null) = n;
    }
    p.leechesOnly = this.checked.has('limitToLeeches');
    p.sortOrder = this.sortOrder;
    const added: Record<Group, SwitchTag[]> = { starRatings: [], srsStages: [], itemTypes: [], jlptLevels: [], joyoGrades: [] };
    for (const sw of this.switches) {
      const group = groupOf(sw.name);
      if (group && sw.tag !== null && this.checked.has(sw.name)) added[group].push(sw.tag);
    }
    for (const group of Object.keys(added) as Group[]) added[group].push(...this.unshown[group]);
    p.starRatings = hashSetOrder(added.starRatings as number[], integerHash);
    p.srsStages = hashSetOrder(added.srsStages as string[], stringHash);
    p.itemTypes = SUBJECT_TYPES.filter((t) => added.itemTypes.includes(t));
    p.jlptLevels = hashSetOrder(added.jlptLevels as number[], integerHash);
    p.joyoGrades = hashSetOrder(added.joyoGrades as number[], integerHash);
    return p;
  }

  /** `injectParameters`: fills the form from parameters (Refine). */
  injectParameters(p: AdvancedSearchParameters): void {
    for (const field of TEXT_FIELDS) {
      const v = p[FIELD_PARAMETER[field]] as number | null;
      this.texts[field] = v === null ? '' : String(v);
    }
    if (p.leechesOnly) this.checked.add('limitToLeeches');
    else this.checked.delete('limitToLeeches');
    this.sortOrder = SEARCH_SORT_ORDERS[SEARCH_SORT_ORDERS.indexOf(p.sortOrder)] ?? 'TYPE';
    const values: Record<Group, readonly SwitchTag[]> = {
      starRatings: p.starRatings, srsStages: p.srsStages, itemTypes: p.itemTypes, jlptLevels: p.jlptLevels, joyoGrades: p.joyoGrades,
    };
    const tags: Record<Group, SwitchTag[]> = { starRatings: [], srsStages: [], itemTypes: [], jlptLevels: [], joyoGrades: [] };
    for (const sw of this.switches) {
      const group = groupOf(sw.name);
      if (!group || sw.tag === null) continue;
      tags[group].push(sw.tag);
      if (values[group].includes(sw.tag)) this.checked.add(sw.name);
      else this.checked.delete(sw.name);
    }
    // collectUnshown: into the form's own HashSets (itemTypes: an EnumSet).
    const unshown = (group: Group): SwitchTag[] => values[group].filter((v) => !tags[group].includes(v));
    this.unshown = {
      starRatings: hashSetOrder(unshown('starRatings') as number[], integerHash),
      srsStages: hashSetOrder(unshown('srsStages') as string[], stringHash),
      itemTypes: SUBJECT_TYPES.filter((t) => unshown('itemTypes').includes(t)),
      jlptLevels: hashSetOrder(unshown('jlptLevels') as number[], integerHash),
      joyoGrades: hashSetOrder(unshown('joyoGrades') as number[], integerHash),
    };
  }
}
