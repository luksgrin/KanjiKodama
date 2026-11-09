/** Writing practice: the stroke matcher, a practice round and its kanji selection. Pure. */
export { centroid, extent, meanDistance, polylineLength, resample, type Point } from './geometry';
export {
  compareStroke, CLEARLY_BETTER, DEFAULT_TOLERANCE, DOT_LENGTH, judgeStroke, MIN_DRAWN_LENGTH, missMessage, SAMPLES,
  type JudgeOptions, type StrokeComparison, type StrokeMiss, type StrokeTolerance, type StrokeVerdict,
} from './matcher';
export {
  applyVerdict, currentCard, isCardDone, isClean, isFinished, MAX_MISSES_PER_STROKE, missedCards, nextCard,
  requestHint, startWriting, type WritingCard, type WritingMode, type WritingResult, type WritingState,
} from './practice';
export { selectWritingKanji, WRITING_ROUND_SIZES, type WritingCandidate, type WritingKind, type WritingScope } from './selection';
