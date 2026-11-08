/**
 * Answer verdicts, digraph matches and the close-enough action, shaped like the fixtures' verdict
 * objects.
 */

/** What a meaning answer that is close but not exact does. */
export type CloseEnoughAction =
  | 'SILENTLY_ACCEPT'
  | 'ACCEPT_WITH_TOAST'
  | 'ACCEPT_WITH_TOAST_NO_LM'
  | 'SHAKE_AND_RETRY'
  | 'REJECT';

/** In `CloseEnoughAction.values()` order. */
export const CLOSE_ENOUGH_ACTIONS: readonly CloseEnoughAction[] = [
  'SILENTLY_ACCEPT',
  'ACCEPT_WITH_TOAST',
  'ACCEPT_WITH_TOAST_NO_LM',
  'SHAKE_AND_RETRY',
  'REJECT',
];

/** `[regularKana, smallKana]`: the answer used one where the reading has the other. */
export type DigraphMatch = readonly [regularKana: string, smallKana: string];

/** The result of checking an answer. */
export interface AnswerVerdict {
  readonly ok: boolean;
  /** Not accepted, but the user may try again (shake). */
  readonly retry: boolean;
  /** Accepted, but only as a typo-tolerant match (close-enough toast). */
  readonly nearMatch: boolean;
  readonly givenAnswer: string | null;
  readonly matchedAnswer: string | null;
  readonly digraph: DigraphMatch | null;
}

export function makeVerdict(
  ok: boolean,
  retry: boolean,
  nearMatch: boolean,
  givenAnswer: string | null,
  matchedAnswer: string | null,
  digraph: DigraphMatch | null,
): AnswerVerdict {
  return { ok, retry, nearMatch, givenAnswer, matchedAnswer, digraph };
}

/** `AnswerVerdict.NOK_WITH_RETRY`. */
export const NOK_WITH_RETRY: AnswerVerdict = Object.freeze(makeVerdict(false, true, false, null, null, null));
/** `AnswerVerdict.NOK_WITHOUT_RETRY`. */
export const NOK_WITHOUT_RETRY: AnswerVerdict = Object.freeze(makeVerdict(false, false, false, null, null, null));
