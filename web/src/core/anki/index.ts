/**
 * Anki mode (self-graded questions): when a question gets the Anki screen, and the answer it reveals,
 * including randomized verb/adjective inflections.
 * Java: GlobalSettings.getAnkiMode, model/Question.getAnkiAnswerRichText / getCharacters,
 * enums/QuestionType.getAnkiAnswerRichText, db/model/Subject.get*RichText, util/InflectionUtil.
 * Fixtures: anki/*.
 */
export { ankiMode } from './mode';
export {
  acceptedKunYomiRichText,
  acceptedOnYomiRichText,
  ankiAnswerRichText,
  meaningRichText,
  questionTypeAnkiAnswer,
  regularReadingRichText,
} from './answerText';
export {
  ADJECTIVE_DECLENSIONS,
  VERB_CONJUGATIONS,
  conjugatedVerb,
  declinedAdjective,
  inflectedCharacters,
  inflectionForm,
  randomInflection,
  type AdjectiveType,
  type InflectingPartOfSpeech,
  type VerbType,
} from './inflection';
