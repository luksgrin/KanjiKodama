/**
 * A writing practice round: a list of kanji written one stroke at a time. Pure; the screen feeds it
 * stroke verdicts (matcher.ts) and hint requests and renders what it returns. Never touches SRS.
 *
 * - Study mode: the whole kanji is shown faintly and the next stroke is highlighted; you trace it.
 * - Recall mode: an empty square and the kanji's meaning and reading; after a missed stroke (or the Hint
 *   button) the next stroke is shown until it is written.
 * After {@link MAX_MISSES_PER_STROKE} misses on one stroke it is written for you, so nobody gets stuck.
 */
import type { StrokeVerdict } from './matcher';

export type WritingMode = 'study' | 'recall';

/** Misses on one stroke before it is written for you. */
export const MAX_MISSES_PER_STROKE = 3;

export interface WritingCard {
  readonly id: number;
  readonly strokeCount: number;
}

/** How one kanji went. */
export interface WritingResult {
  readonly id: number;
  /** Strokes drawn that weren't accepted. */
  readonly misses: number;
  /** Strokes shown with the Hint button (recall mode). */
  readonly hints: number;
  /** Strokes written for you after too many misses. */
  readonly revealed: number;
}

export interface WritingState {
  readonly mode: WritingMode;
  readonly cards: readonly WritingCard[];
  /** The card being written; `cards.length` when the round is over. */
  readonly index: number;
  /** Strokes of the current card written so far (accepted or revealed). */
  readonly stroke: number;
  /** Misses on the current stroke. */
  readonly strokeMisses: number;
  /** Show the current stroke as a hint (always in study mode). */
  readonly hint: boolean;
  /** The last verdict, for the message under the square (null after an accepted stroke's message is shown). */
  readonly last: StrokeVerdict | null;
  /** The current card's tally so far. */
  readonly current: WritingResult;
  readonly results: readonly WritingResult[];
}

function freshResult(card: WritingCard | undefined): WritingResult {
  return { id: card?.id ?? 0, misses: 0, hints: 0, revealed: 0 };
}

/** A new round. Cards without strokes are dropped. */
export function startWriting(cards: readonly WritingCard[], mode: WritingMode): WritingState {
  const usable = cards.filter((c) => c.strokeCount > 0);
  return {
    mode,
    cards: usable,
    index: 0,
    stroke: 0,
    strokeMisses: 0,
    hint: mode === 'study',
    last: null,
    current: freshResult(usable[0]),
    results: [],
  };
}

export function currentCard(state: WritingState): WritingCard | null {
  return state.cards[state.index] ?? null;
}

/** Every stroke of the current card is written: waiting for {@link nextCard}. */
export function isCardDone(state: WritingState): boolean {
  const card = currentCard(state);
  return card !== null && state.stroke >= card.strokeCount;
}

export function isFinished(state: WritingState): boolean {
  return state.index >= state.cards.length;
}

function advanceStroke(state: WritingState, current: WritingResult, last: StrokeVerdict | null): WritingState {
  return { ...state, stroke: state.stroke + 1, strokeMisses: 0, hint: state.mode === 'study', last, current };
}

/** Applies the verdict on the stroke just drawn. */
export function applyVerdict(state: WritingState, verdict: StrokeVerdict): WritingState {
  if (isFinished(state) || isCardDone(state)) return state;
  if (verdict.ok) return advanceStroke(state, state.current, verdict);
  const current = { ...state.current, misses: state.current.misses + 1 };
  const misses = state.strokeMisses + 1;
  if (misses >= MAX_MISSES_PER_STROKE) {
    return advanceStroke(state, { ...current, revealed: current.revealed + 1 }, verdict);
  }
  return { ...state, strokeMisses: misses, hint: true, last: verdict, current };
}

/** Shows the current stroke (the Hint button). Counts once per stroke, and never in study mode. */
export function requestHint(state: WritingState): WritingState {
  if (isFinished(state) || isCardDone(state) || state.hint) return state;
  return { ...state, hint: true, current: { ...state.current, hints: state.current.hints + 1 } };
}

/** Records the finished card and moves to the next one. */
export function nextCard(state: WritingState): WritingState {
  if (isFinished(state) || !isCardDone(state)) return state;
  const index = state.index + 1;
  return {
    ...state,
    index,
    stroke: 0,
    strokeMisses: 0,
    hint: state.mode === 'study',
    last: null,
    current: freshResult(state.cards[index]),
    results: [...state.results, state.current],
  };
}

/** Written without a miss, hint or revealed stroke. */
export function isClean(result: WritingResult): boolean {
  return result.misses === 0 && result.hints === 0 && result.revealed === 0;
}

/** The cards of a finished round that weren't clean, for "Practise the missed ones". */
export function missedCards(state: WritingState): WritingCard[] {
  const missed = new Set(state.results.filter((r) => !isClean(r)).map((r) => r.id));
  return state.cards.filter((c) => missed.has(c.id));
}
