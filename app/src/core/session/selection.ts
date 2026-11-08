/**
 * Which subjects a new session gets and in which order: shuffle (if the order asks for it), sort by
 * the session comparator, trim to the size limit with the selection rules, then the buckets.
 */

import type { Rng } from '../rng';
import { shuffleInPlace } from '../rng';
import { maxSessionSize, shuffleAfterSelection, subjectSelectionSettings, type Preferences, type SubjectSelectionSettings } from '../settings';
import { SHUFFLE_COMPARATOR, sessionOrder, type OrderSubject, type StartType, type SubjectComparator } from './order';

const INT_MAX = 2 ** 31 - 1;

/**
 * `SubjectSelectionRules`: minimum and maximum counts of current-level, earlier-level, radical,
 * kanji, vocabulary and kana-only vocabulary subjects. Stateful: `notifySelected` counts what was taken.
 */
export class SubjectSelectionRules {
  private readonly currentMin: number;
  private readonly currentMax: number;
  private readonly earlierMin: number;
  private readonly earlierMax: number;
  private readonly radicalMin: number;
  private readonly radicalMax: number;
  private readonly kanjiMin: number;
  private readonly kanjiMax: number;
  private readonly vocabularyMin: number;
  private readonly vocabularyMax: number;
  private readonly kanaVocabularyMin: number;
  private readonly kanaVocabularyMax: number;
  private currentDone = 0;
  private earlierDone = 0;
  private radicalDone = 0;
  private kanjiDone = 0;
  private vocabularyDone = 0;
  private kanaVocabularyDone = 0;

  /** Minimums below 0 mean 0; a maximum of exactly -1 means none (other negative maximums stay). */
  constructor(settings: SubjectSelectionSettings, private readonly userLevel: number) {
    const max = (v: number): number => (v === -1 ? INT_MAX : v);
    this.currentMin = Math.max(settings.currentMin, 0);
    this.currentMax = max(settings.currentMax);
    this.earlierMin = Math.max(settings.earlierMin, 0);
    this.earlierMax = max(settings.earlierMax);
    this.radicalMin = Math.max(settings.radicalMin, 0);
    this.radicalMax = max(settings.radicalMax);
    this.kanjiMin = Math.max(settings.kanjiMin, 0);
    this.kanjiMax = max(settings.kanjiMax);
    this.vocabularyMin = Math.max(settings.vocabularyMin, 0);
    this.vocabularyMax = max(settings.vocabularyMax);
    this.kanaVocabularyMin = Math.max(settings.kanaVocabularyMin, 0);
    this.kanaVocabularyMax = max(settings.kanaVocabularyMax);
  }

  /** True when no rule is set (every minimum 0, every maximum unlimited). */
  isEmpty(): boolean {
    return this.currentMin === 0 && this.currentMax === INT_MAX && this.earlierMin === 0 && this.earlierMax === INT_MAX
      && this.radicalMin === 0 && this.radicalMax === INT_MAX && this.kanjiMin === 0 && this.kanjiMax === INT_MAX
      && this.vocabularyMin === 0 && this.vocabularyMax === INT_MAX
      && this.kanaVocabularyMin === 0 && this.kanaVocabularyMax === INT_MAX;
  }

  /**
   * Is the subject wanted in selection pass `stage` (0..4)? Pass 0 takes subjects that help both an
   * age minimum and a type minimum; 1 helps a minimum without exceeding a maximum; 2 helps a
   * minimum; 3 exceeds no maximum; 4 takes anything.
   */
  isWantedForStage(subject: OrderSubject, stage: number): boolean {
    const f = { ageMin: false, ageMax: false, typeMin: false, typeMax: false };
    const check = (done: number, min: number, maxValue: number, age: boolean): void => {
      if (done < min) f[age ? 'ageMin' : 'typeMin'] = true;
      if (done >= maxValue) f[age ? 'ageMax' : 'typeMax'] = true;
    };
    if (subject.level === this.userLevel) check(this.currentDone, this.currentMin, this.currentMax, true);
    if (subject.level < this.userLevel) check(this.earlierDone, this.earlierMin, this.earlierMax, true);
    if (subject.object === 'radical') check(this.radicalDone, this.radicalMin, this.radicalMax, false);
    if (subject.object === 'kanji') check(this.kanjiDone, this.kanjiMin, this.kanjiMax, false);
    if (subject.object === 'vocabulary') check(this.vocabularyDone, this.vocabularyMin, this.vocabularyMax, false);
    if (subject.object === 'kana_vocabulary') {
      check(this.kanaVocabularyDone, this.kanaVocabularyMin, this.kanaVocabularyMax, false);
    }
    switch (stage) {
      case 0:
        return f.ageMin && f.typeMin;
      case 1:
        return (f.ageMin || f.typeMin) && !f.ageMax && !f.typeMax;
      case 2:
        return f.ageMin || f.typeMin;
      case 3:
        return !f.ageMax && !f.typeMax;
      case 4:
        return true;
      default:
        return false;
    }
  }

  /** Counts a subject taken into the session. */
  notifySelected(subject: OrderSubject): void {
    if (subject.level === this.userLevel) this.currentDone++;
    if (subject.level < this.userLevel) this.earlierDone++;
    if (subject.object === 'radical') this.radicalDone++;
    if (subject.object === 'kanji') this.kanjiDone++;
    if (subject.object === 'vocabulary') this.vocabularyDone++;
    if (subject.object === 'kana_vocabulary') this.kanaVocabularyDone++;
  }
}

/**
 * `Session.trimSelection`: `maxSize` of the sorted candidates. Without rules, the first ones;
 * otherwise five passes over the candidates in order (taking what each pass wants until the session
 * is full), then the result sorted with the comparator. `candidates` is consumed.
 */
export function trimSelection(candidates: OrderSubject[], maxSize: number, rules: SubjectSelectionRules,
  comparator: SubjectComparator): OrderSubject[] {
  if (rules.isEmpty()) return candidates.slice(0, maxSize);
  const result: OrderSubject[] = [];
  for (let stage = 0; stage < 5; stage++) {
    let i = 0;
    while (i < candidates.length) {
      if (result.length >= maxSize) break;
      const subject = candidates[i] as OrderSubject;
      if (rules.isWantedForStage(subject, stage)) {
        result.push(subject);
        candidates.splice(i, 1);
        rules.notifySelected(subject);
      } else {
        i++;
      }
    }
  }
  return result.sort(comparator);
}

/** A new session's subjects, in session order, with the item fields the selection decides. */
export interface SessionSelection {
  /** The selected subjects in session order (`SessionItem.order` is the index). */
  subjects: OrderSubject[];
  /** `SessionItem.bucket` of each subject: increments wherever the comparator tells neighbours apart. */
  buckets: number[];
  /** The session's comparator after selection: `SHUFFLE_COMPARATOR` with shuffle-after-selection. */
  comparator: SubjectComparator;
  /** The size limit that applied. */
  maxSize: number;
}

/** What the order needs beyond the settings (the user level, the level-up ids). */
export interface SelectionContext {
  userLevel: number;
  /** `getUserMaxLevelGranted`: `LOCAL_MAX_LEVEL_GRANTED` in local mode. */
  maxLevel: number;
  /** `levelUpIds(db, userLevel, maxLevel)`. */
  levelUp: ReadonlySet<number>;
}

/**
 * The selection part of starting a session: shuffle with the shared random (`shuffleInPlace`) if
 * the order shuffles, stable sort, trim to the session's
 * size limit with the selection rules, then buckets with the (possibly shuffle-after-selection)
 * comparator. `subjects` is the list the session is started with, in the caller's order; it must
 * not be empty (throws IllegalArgumentException).
 */
export function selectSessionSubjects(subjects: readonly OrderSubject[], type: StartType, prefs: Preferences,
  ctx: SelectionContext, rng: Pick<Rng, 'nextInt'>): SessionSelection {
  const { comparator: ordered, shuffleFirst } = sessionOrder(type, prefs, ctx.levelUp, ctx.userLevel, ctx.maxLevel);
  const maxSize = maxSessionSize(prefs, type);
  let list = [...subjects];
  if (shuffleFirst) shuffleInPlace(list, rng);
  list.sort(ordered);
  if (list.length > maxSize) {
    list = trimSelection(list, maxSize, new SubjectSelectionRules(subjectSelectionSettings(prefs, type), ctx.userLevel), ordered);
  }
  const comparator = shuffleAfterSelection(prefs, type) ? SHUFFLE_COMPARATOR : ordered;
  const buckets: number[] = [];
  let bucket = 0;
  list.forEach((s, i) => {
    if (i > 0 && comparator(list[i - 1] as OrderSubject, s) !== 0) bucket++;
    buckets.push(bucket);
  });
  return { subjects: list, buckets, comparator, maxSize };
}
