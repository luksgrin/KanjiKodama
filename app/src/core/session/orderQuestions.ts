/**
 * Which question a running session asks next: the filters (back to back,
 * reading first, meaning first, the 10-started-items cap, delayed items after a wrong answer) and
 * the random pick within the first bucket.
 *
 * The session engine owns its question and item types; it passes an accessor so this works on them.
 */

import { QUESTION_TYPE_INFO, type QuestionType } from '../answer';
import type { Rng } from '../rng';

/** How long (in question choices) an item waits after a wrong answer or a put-back (`setChoiceDelay(3)`). */
export const CHOICE_DELAY = 3;

/** The started-items cap: with this many items started, only started items are asked. */
export const MAX_STARTED_ITEMS = 10;

/** How `chooseNextQuestion` reads and updates the engine's questions and items. */
export interface QuestionChoiceAccess<Q, I> {
  itemOf(question: Q): I;
  typeOf(question: Q): QuestionType;
  /** `SessionItem.isStarted`: active with at least one answer. */
  isStarted(item: I): boolean;
  /** `SessionItem.hasPendingReadingAndMeaning`: the meaning and some reading question are both still open. */
  hasPendingReadingAndMeaning(item: I): boolean;
  bucket(item: I): number;
  choiceDelay(item: I): number;
  setChoiceDelay(item: I, value: number): void;
}

/** The session's sequencing settings, read when it started. */
export interface QuestionChoiceFlags {
  backToBack: boolean;
  readingFirst: boolean;
  meaningFirst: boolean;
}

/** `filter` that keeps the original list when nothing passes (every filter in `chooseQuestion` does). */
function narrow<Q>(list: readonly Q[], keep: (q: Q) => boolean): readonly Q[] {
  const out = list.filter(keep);
  return out.length > 0 ? out : list;
}

/**
 * The question pick of `Session.chooseQuestion` for a session that is active and has questions
 * (the lesson presentation, finishing and empty cases are the engine's). `questions` are the open
 * questions in queue order, `items` all session items. Draws one `nextInt` from the shared random,
 * then counts every item's choice delay down by one. The engine sets the current
 * question, item and choice reason.
 */
export function chooseNextQuestion<Q, I>(questions: readonly Q[], items: readonly I[], flags: QuestionChoiceFlags,
  access: QuestionChoiceAccess<Q, I>, rng: Pick<Rng, 'nextInt'>): Q {
  if (questions.length === 0) throw new Error('chooseNextQuestion without questions');
  const item = (q: Q): I => access.itemOf(q);
  let candidates: readonly Q[] = questions;

  if (flags.backToBack) {
    candidates = narrow(candidates, (q) => access.isStarted(item(q)));
  }
  if (flags.readingFirst) {
    candidates = narrow(candidates, (q) => !access.hasPendingReadingAndMeaning(item(q)) || QUESTION_TYPE_INFO[access.typeOf(q)].reading);
  }
  if (flags.meaningFirst) {
    candidates = narrow(candidates, (q) => !access.hasPendingReadingAndMeaning(item(q)) || QUESTION_TYPE_INFO[access.typeOf(q)].meaning);
  }
  if (items.filter((i) => access.isStarted(i)).length >= MAX_STARTED_ITEMS) {
    candidates = narrow(candidates, (q) => access.isStarted(item(q)));
  }

  // Within the first candidate's bucket, prefer items that aren't waiting after a wrong answer,
  // but only when that bucket has both kinds (counted over all items, not just the candidates).
  const currentBucket = access.bucket(item(candidates[0] as Q));
  let hasDelayed = false;
  let hasUndelayed = false;
  for (const i of items) {
    if (access.bucket(i) !== currentBucket) continue;
    if (access.choiceDelay(i) === 0) hasUndelayed = true;
    else hasDelayed = true;
  }
  if (hasDelayed && hasUndelayed) {
    candidates = narrow(candidates, (q) => access.bucket(item(q)) === currentBucket && access.choiceDelay(item(q)) === 0);
  }

  // A random question among the leading run of candidates in the first candidate's bucket.
  const bucket = access.bucket(item(candidates[0] as Q));
  let n = 1;
  while (n < candidates.length && access.bucket(item(candidates[n] as Q)) === bucket) n++;
  const chosen = candidates[rng.nextInt(n)] as Q;

  for (const i of items) {
    const delay = access.choiceDelay(i);
    if (delay > 0) access.setChoiceDelay(i, delay - 1);
  }
  return chosen;
}
