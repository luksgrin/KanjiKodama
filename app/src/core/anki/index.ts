/**
 * Anki mode (self-graded questions): when a question gets the Anki screen, and the answer it reveals,
 * including randomized verb/adjective inflections.
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
  ADJECTIVE_DECLENSION_KEY_ORDER,
  VERB_CONJUGATIONS,
  VERB_CONJUGATION_KEY_ORDER,
  hashMapKeyOrder,
  randomAdjectiveDeclension,
  randomVerbConjugation,
  conjugatedVerb,
  declinedAdjective,
  inflectedCharacters,
  inflectionForm,
  randomInflection,
  type AdjectiveType,
  type InflectingPartOfSpeech,
  type VerbType,
} from './inflection';
