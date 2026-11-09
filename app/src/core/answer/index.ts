/**
 * OSA distance, fuzzy matching, AnswerVerdict, the 8 question types' checks, submit pre-checks and
 * feedback, synonyms. Fixtures: answers/*.
 */
export { osaDistance } from './osa';
export { cleanString, fuzzyMatches, getMatchScore } from './fuzzy';
export { androidToLowerCase } from './unicode';
export { stringSetOrder, stringHashCode } from './stringHashOrder';
export { isKunYomi, isOnYomi, readingMatches, readingMatchesForDigraph } from './reading';
export {
  QUESTION_TYPES,
  QUESTION_TYPE_INFO,
  checkAnswer,
  possibleQuestionTypes,
  type CheckOptions,
  type CheckSubject,
  type QuestionType,
  type QuestionTypeInfo,
} from './questionType';
export {
  QUESTION_KIND_GLYPH,
  QUESTION_KIND_LABEL,
  acceptedKanjiReadingKind,
  questionKind,
  retryHint,
  retryHintText,
  type KindSubject,
  type QuestionKind,
  type RetryGiven,
  type RetryHint,
} from './questionKind';
export {
  CLOSE_ENOUGH_ACTIONS,
  NOK_WITH_RETRY,
  NOK_WITHOUT_RETRY,
  makeVerdict,
  type AnswerVerdict,
  type CloseEnoughAction,
  type DigraphMatch,
} from './verdict';
