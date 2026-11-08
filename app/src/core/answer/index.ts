/**
 * OSA distance, FuzzyMatching, AnswerVerdict, the 8 question types' checks, submit pre-checks and
 * feedback, synonyms. Java: util/OptimalStringAlignmentDistance, util/FuzzyMatching,
 * enums/QuestionType, model/SubmitPrecheck, model/SubmitFeedback, util/StudyMaterialsSupport.
 * Fixtures: answers/*.
 */
export { osaDistance } from './osa';
export { cleanString, fuzzyMatches, getMatchScore } from './fuzzy';
export { androidToLowerCase } from './unicode';
export { javaHashSetOrder, javaStringHash } from './javaHash';
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
  CLOSE_ENOUGH_ACTIONS,
  NOK_WITH_RETRY,
  NOK_WITHOUT_RETRY,
  makeVerdict,
  type AnswerVerdict,
  type CloseEnoughAction,
  type DigraphMatch,
} from './verdict';
