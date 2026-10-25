/**
 * The lesson, review and self-study session: `model/Session` with `model/Question` and
 * `db/model/SessionItem`, as a state machine over an explicit environment (learner database,
 * preferences, clock, the shared random, the stored session). The jobs the Java session schedules
 * (`ReportSessionItemJob`, `UpdateSessionItemJob`, `AbandonSessionItemJob`, `FinishSessionJob`) run at
 * once, in order, as the app's single job thread does; `env.jobs` lists them like the app's queue.
 *
 * The UI side of `FloatingUiState` the logic reads (current answer, last verdict, lingering in
 * lightning mode) is part of the session.
 */

import { possibleQuestionTypes, QUESTION_TYPE_INFO, type QuestionType } from '../answer/questionType';
import { submitCheck } from '../answer/submit';
import { parseMeaningSynonyms } from '../answer/synonyms';
import type { AnswerVerdict, CloseEnoughAction } from '../answer/verdict';
import { CLOSE_ENOUGH_ACTIONS, makeVerdict, NOK_WITHOUT_RETRY } from '../answer/verdict';
import { isKunYomi, isOnYomi } from '../answer/reading';
import type { ContentSubject } from '../content';
import { contentSubject, num, progressRow, srsSystemOf, tableRow, type LearnerDb } from '../progression/db';
import { reportLocal, type LocalReport } from '../progression/report';
import type { JavaRandom, Rng } from '../rng';
import { shuffleInPlace } from '../rng';
import { ankiAnswerRichText } from '../anki/answerText';
import { inflectedCharacters, inflectionForm, randomInflection } from '../anki/inflection';
import type { RichText } from '../text/richText';
import { chooseNextQuestion, type QuestionChoiceAccess } from './orderQuestions';
import { advancedEnabled, prefBoolean, randomizeInflections, type Preferences, type SessionType } from '../settings';
import type {
  Question,
  QuestionChoiceReason,
  SessionItem,
  SessionItemRow,
  SessionKind,
  SessionOrdering,
  SessionState,
  SessionSubject,
  StoredSession,
  SubjectComparator,
} from './types';

/** A job as the app's queue holds it: simple class name and data string. */
export type JobRecord = [string, string];

/** What the level test needs from the session (`LevelTest.isRoundActive`, `LevelTest.onSessionFinishing`). */
export interface SessionHooks {
  levelTestRoundActive(db: LearnerDb): boolean;
  onSessionFinishing(db: LearnerDb, type: SessionType, items: readonly SessionItem[], now: number): void;
  /**
   * `ReportSessionItemJob.runLocal` for one finished item. Absent: local mode (`reportLocal`). Server
   * mode passes one that predicts locally and queues the upload (`src/sync/serverSession.ts`).
   */
  report?(db: LearnerDb, report: LocalReport & { assignmentId: number }, now: number): void;
}

/** Everything the session reads and writes outside itself. `now` and `prefs` change between calls. */
export interface SessionEnv {
  readonly db: LearnerDb;
  prefs: Preferences;
  /** `Clock.now()`. */
  now: number;
  readonly rng: JavaRandom;
  /**
   * `Math.random()`, the source of the randomized inflection picks (`InflectionUtil`; a separate generator from
   * `rng`). The app passes an unseeded generator; golden tests a `JavaRandom`, like the Java seam
   * `InflectionUtil.setRandomSourceForTesting`.
   */
  readonly inflectionRng: Pick<Rng, 'nextDouble'>;
  readonly stored: StoredSession;
  readonly ordering: SessionOrdering;
  readonly jobs: JobRecord[];
  readonly hooks: SessionHooks;
}

/** The `level_test_round_active` flag (`LevelTest.isRoundActive`). */
export function levelTestRoundActive(db: LearnerDb): boolean {
  return db.state.get('level_test_round_active') === '1';
}

/** Hooks for a session without the level test. */
export const NO_LEVEL_TEST_HOOKS: SessionHooks = {
  levelTestRoundActive,
  onSessionFinishing: () => undefined,
};

/** A fresh `session_item` table and session properties. */
export function emptyStoredSession(): StoredSession {
  return { sessionType: 'NONE', sessionOnkun: false, currentItemId: 0, currentQuestionType: null, items: new Map() };
}

/** The stored items in `order` (`SessionItemDao.getAll`). */
export function storedRows(stored: StoredSession): SessionItemRow[] {
  return [...stored.items.values()].sort((a, b) => a.order - b.order);
}

/** `GlobalSettings.Review.getCloseEnoughAction`: `close_enough_action`, SILENTLY_ACCEPT when absent or unknown. */
export function closeEnoughAction(prefs: Preferences): CloseEnoughAction {
  const v = prefs.close_enough_action;
  return typeof v === 'string' && (CLOSE_ENOUGH_ACTIONS as readonly string[]).includes(v)
    ? (v as CloseEnoughAction) : 'SILENTLY_ACCEPT';
}

/** `GlobalSettings.Other.getRequireOnInKatakana`. */
export function requireOnInKatakana(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'require_onyomi_in_katakana', false);
}

/** `GlobalSettings.Review.getEnableLightningMode` (default true). */
export function enableLightningMode(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'enable_lightning_mode', true);
}

/** `GlobalSettings.AdvancedOther.getKanjiModeOnKun`. */
function kanjiModeOnKun(prefs: Preferences): boolean {
  return advancedEnabled(prefs) && prefBoolean(prefs, 'kanji_mode_onkun', false);
}

/** `GlobalSettings.Review.getDelayResultUpload`. */
function delayResultUpload(prefs: Preferences): boolean {
  return prefBoolean(prefs, 'delay_result_upload', false);
}

/** A subject as the session reads it, live from the database. */
export function sessionSubject(db: LearnerDb, id: number): SessionSubject {
  return { id, content: contentSubject(db, id), table: tableRow(db, id), progress: progressRow(db, id), srsSystem: srsSystemOf(db, id) };
}

/** `Subject.isEligibleForSessionType`. */
export function isEligibleForSessionType(db: LearnerDb, id: number, type: SessionType, now: number): boolean {
  const row = progressRow(db, id);
  switch (type) {
    case 'LESSON':
      return num(row, 'unlockedAt') !== 0 && num(row, 'startedAt') === 0
        && (num(row, 'resurrectedAt') !== 0 || num(row, 'burnedAt') === 0);
    case 'REVIEW': {
      const available = num(row, 'availableAt');
      return available !== 0 && available <= now;
    }
    default:
      return true;
  }
}

/** `Subject.needsQuestion1..4(onkun)`: which question slots the subject has. */
function neededSlots(s: ContentSubject, onkun: boolean): [boolean, boolean, boolean, boolean] {
  const kanji = s.object === 'kanji';
  const q2 = s.object === 'vocabulary' || s.object === 'kana_vocabulary' || (kanji && !onkun);
  return [
    s.meanings.some((m) => m.accepted_answer),
    q2 && s.readings.some((r) => r.accepted_answer),
    kanji && onkun && s.readings.some(isOnYomi),
    kanji && onkun && s.readings.some(isKunYomi),
  ];
}

function slotIndex(type: QuestionType): 0 | 1 | 2 | 3 {
  return (QUESTION_TYPE_INFO[type].slot - 1) as 0 | 1 | 2 | 3;
}

/** `SessionItem.isFinished`. */
export function itemFinished(item: SessionItem): boolean {
  return item.state !== 'ACTIVE' || item.done.every((d) => d);
}

/** `SessionItem.isStarted`. */
export function itemStarted(item: SessionItem): boolean {
  return item.state === 'ACTIVE' && item.numAnswers > 0;
}

/** `SessionItem.hasIncorrectAnswers`. */
export function itemHasIncorrectAnswers(item: SessionItem): boolean {
  return item.incorrect.some((n) => n > 0);
}

function hasPendingReadingAndMeaning(item: SessionItem): boolean {
  return !item.done[0] && !(item.done[1] && item.done[2] && item.done[3]);
}

/** `Question.isFinished`. */
function questionFinished(q: Question): boolean {
  return q.item.state !== 'ACTIVE' || q.item.done[slotIndex(q.type)];
}

/** `Question.canUndo`. */
function questionCanUndo(q: Question): boolean {
  return q.item.state !== 'REPORTED' && q.item.state !== 'ABANDONED';
}

const QUESTION_ACCESS: QuestionChoiceAccess<Question, SessionItem> = {
  itemOf: (q) => q.item,
  typeOf: (q) => q.type,
  isStarted: itemStarted,
  hasPendingReadingAndMeaning,
  bucket: (i) => i.bucket,
  choiceDelay: (i) => i.choiceDelay,
  setChoiceDelay: (i, value) => {
    i.choiceDelay = value;
  },
};

function rowOf(item: SessionItem): SessionItemRow {
  return {
    id: item.id, assignmentId: item.assignmentId, state: item.state, srsStageId: item.srsStageId, level: item.level,
    bucket: item.bucket, order: item.order, done: [...item.done], incorrect: [...item.incorrect],
    numAnswers: item.numAnswers, lastAnswer: item.lastAnswer,
  };
}

/** The session, one per app process (`Session.getInstance()`). */
export class Session {
  type: SessionType = 'NONE';
  onkun = false;
  backToBack = false;
  readingFirst = false;
  meaningFirst = false;
  delayed = false;
  lightningModeTemporarilyDisabled = false;
  state: SessionState = 'INACTIVE';
  currentItem: SessionItem | null = null;
  currentQuestion: Question | null = null;
  questionChoiceReason: QuestionChoiceReason = 'STARTING_REVIEW_SESSION';
  lastFinishedSubjectId = -1;
  answered = false;
  correct = false;
  items: SessionItem[] = [];
  questions: Question[] = [];
  /** Top first, like `Deque.push`/`pop`. */
  history: Question[] = [];
  comparator: SubjectComparator = () => 0;
  loaded = false;
  /** `FloatingUiState.getCurrentAnswer`. */
  currentAnswer = '';
  /** `FloatingUiState.lingerOnAnswer`. */
  lingerOnAnswer = false;
  /** `FloatingUiState.lastVerdict`. */
  lastVerdict: AnswerVerdict | null = null;

  constructor(private readonly env: SessionEnv) {}

  // --- queries ---------------------------------------------------------------------------------

  isActive(): boolean {
    return this.state === 'ACTIVE';
  }

  isDelayed(): boolean {
    return this.delayed || this.type === 'SELF_STUDY';
  }

  canBeWrappedUp(): boolean {
    return this.state === 'ACTIVE' && this.numStarted() < this.numActive();
  }

  canUndo(): boolean {
    const q = this.currentQuestion;
    if (q !== null && this.answered && questionCanUndo(q)) return true;
    if (this.history.length === 0) return false;
    return this.isDelayed() || questionCanUndo(this.history[0]!);
  }

  numActive(): number {
    return this.items.filter((i) => i.state === 'ACTIVE').length;
  }

  numPending(): number {
    return this.items.filter((i) => i.state === 'PENDING').length;
  }

  numStarted(): number {
    return this.items.filter(itemStarted).length;
  }

  private numFinished(): number {
    return this.items.filter((i) => i.state === 'REPORTED' || i.state === 'PENDING').length;
  }

  private numLive(): number {
    return this.items.filter((i) => i.state !== 'ABANDONED').length;
  }

  progressText(): string {
    if (this.state === 'IN_LESSON_PRESENTATION') {
      return `${this.currentItem === null ? 0 : this.items.indexOf(this.currentItem) + 1}/${this.items.length}`;
    }
    const wrappingUp = this.state === 'ACTIVE' && this.numStarted() >= this.numActive();
    return `${wrappingUp ? 'Wrapup: ' : ''}${this.numFinished()}/${this.numLive()}`;
  }

  isLightningModeActive(): boolean {
    return enableLightningMode(this.env.prefs) && !this.lightningModeTemporarilyDisabled;
  }

  /** `SessionActivity`'s lightning decision (`Session.lightningAdvancesNow`). */
  lightningAdvancesNow(lightningMode: boolean): boolean {
    if (lightningMode && this.answered && this.correct && this.lastVerdict !== null && this.lastVerdict.nearMatch
      && closeEnoughAction(this.env.prefs) === 'ACCEPT_WITH_TOAST_NO_LM') {
      this.lingerOnAnswer = true;
    }
    return this.answered && this.correct && lightningMode && !this.lingerOnAnswer;
  }

  /** The live subject of an item. */
  subjectOf(item: SessionItem): SessionSubject {
    return sessionSubject(this.env.db, item.id);
  }

  // --- randomized inflections (model/Question) --------------------------------------------------

  /**
   * `Question.getInflectionForm(subject, sessionType)`: with randomized inflections on for this session type, the
   * subject's first inflecting part of speech; else null.
   */
  private inflectionFormOf(q: Question): ReturnType<typeof inflectionForm> {
    if (!randomizeInflections(this.env.prefs, this.type)) return null;
    return inflectionForm(contentSubject(this.env.db, q.item.id).partsOfSpeech);
  }

  /**
   * `Question.getInflection(subject, sessionType)`: the question's inflection, picked on first use with
   * `env.inflectionRng` and kept (a question picked once keeps it even if the setting changes); null when the setting
   * is off or the subject doesn't inflect. Java calls it from `getCharacters` (the question's characters on screen)
   * and `getAnkiAnswerRichText` (the revealed answer), so the pick happens when the question is first shown.
   */
  questionInflection(q: Question): string | null {
    if (q.inflection !== null) return q.inflection;
    const form = this.inflectionFormOf(q);
    if (form === null) return null;
    q.inflection = randomInflection(form, this.env.inflectionRng);
    return q.inflection;
  }

  /** `Question.getCharacters(subject, sessionType)`: the characters shown, inflected when the question has one. */
  questionCharacters(q: Question): string | null {
    const characters = contentSubject(this.env.db, q.item.id).characters;
    if (characters === null) return null;
    const form = this.inflectionFormOf(q);
    const inflection = this.questionInflection(q);
    if (form === null || inflection === null) return characters;
    return inflectedCharacters(characters, form, inflection);
  }

  /** `Question.getAnkiAnswerRichText(subject, sessionType)`: the revealed answer, `" (<inflection>)"` appended. */
  questionAnkiAnswer(q: Question, showOnInKatakana: boolean): RichText {
    const inflection = this.questionInflection(q);
    return ankiAnswerRichText(contentSubject(this.env.db, q.item.id), q.type, { showOnInKatakana, inflection });
  }

  // --- jobs ------------------------------------------------------------------------------------

  private schedule(name: string, data: string): void {
    this.env.jobs.push([name, data]);
    const stored = this.env.stored;
    switch (name) {
      case 'UpdateSessionItemJob': {
        const f = data.split(' ');
        const row = stored.items.get(Number(f[0]));
        if (row !== undefined) {
          row.state = f[1] as SessionItemRow['state'];
          row.done = [f[2] === 'true', f[4] === 'true', f[6] === 'true', f[8] === 'true'];
          row.incorrect = [Number(f[3]), Number(f[5]), Number(f[7]), Number(f[9])];
          row.numAnswers = Number(f[10]);
          row.lastAnswer = Number(f[11]);
        }
        break;
      }
      case 'AbandonSessionItemJob': {
        const row = stored.items.get(Number(data));
        if (row !== undefined) row.state = 'ABANDONED';
        break;
      }
      case 'FinishSessionJob':
        stored.items.clear();
        stored.sessionType = 'NONE';
        stored.sessionOnkun = false;
        stored.currentItemId = 0;
        break;
      case 'ReportSessionItemJob': {
        const f = data.split(' ');
        runReportJob(this.env, Number(f[0]), f[2] as SessionType, Number(f[3]), Number(f[4]), Number(f[5]), Number(f[1]));
        break;
      }
      default:
        throw new Error(`unknown job ${name}`);
    }
  }

  /** `SessionItem.update`. */
  private updateItem(item: SessionItem): void {
    const [d1, d2, d3, d4] = item.done;
    const [i1, i2, i3, i4] = item.incorrect;
    this.schedule('UpdateSessionItemJob',
      `${item.id} ${item.state} ${d1} ${i1} ${d2} ${i2} ${d3} ${i3} ${d4} ${i4} ${item.numAnswers} ${item.lastAnswer}`);
  }

  /** `SessionItem.report`. */
  private reportItem(item: SessionItem): void {
    const [i1, i2, i3, i4] = item.incorrect;
    this.schedule('ReportSessionItemJob', `${item.id} ${item.assignmentId} ${this.type} ${i1} ${i2 + i3 + i4} ${item.lastAnswer}`);
    item.state = 'REPORTED';
  }

  private storeCurrent(item: SessionItem, type: QuestionType | null): void {
    this.env.stored.currentItemId = item.id;
    if (type !== null) this.env.stored.currentQuestionType = type;
  }

  // --- answers ---------------------------------------------------------------------------------

  /** `Question.markCorrect`. */
  private markCorrect(q: Question): void {
    const item = q.item;
    item.done[slotIndex(q.type)] = true;
    item.numAnswers++;
    item.lastAnswer = this.env.now;
    if (itemFinished(item)) {
      if (this.isDelayed()) {
        item.state = 'PENDING';
        this.updateItem(item);
      } else {
        this.reportItem(item);
      }
    } else {
      this.updateItem(item);
    }
  }

  /** `Question.markIncorrect`. */
  private markIncorrect(q: Question): void {
    const item = q.item;
    item.incorrect[slotIndex(q.type)]++;
    item.numAnswers++;
    this.updateItem(item);
  }

  /** `Question.undo`. */
  private undoQuestion(q: Question): void {
    if (!questionCanUndo(q)) return;
    const item = q.item;
    const slot = slotIndex(q.type);
    if (item.done[slot]) item.done[slot] = false;
    else item.incorrect[slot]--;
    item.numAnswers--;
    if (item.state === 'PENDING') item.state = 'ACTIVE';
    this.updateItem(item);
  }

  private setCurrentQuestion(question: Question | null, reason: QuestionChoiceReason): void {
    if (question !== null && this.currentQuestion !== question) this.lingerOnAnswer = false;
    this.currentQuestion = question;
    this.questionChoiceReason = reason;
  }

  // --- the state machine -----------------------------------------------------------------------

  /** `Session.chooseQuestion`. */
  chooseQuestion(): void {
    if (this.currentQuestion !== null || this.state === 'FINISHING' || this.state === 'INACTIVE') return;
    this.answered = false;
    this.currentAnswer = '';
    if (this.state === 'IN_LESSON_PRESENTATION') {
      this.setCurrentQuestion(this.questions[0]!, 'STARTING_LESSON_SESSION');
      this.currentItem = this.items[0]!;
      this.storeCurrent(this.currentItem, this.currentQuestion!.type);
      return;
    }
    if (this.questions.length === 0) {
      this.setCurrentQuestion(null, 'FINISHING_SESSION');
      this.currentItem = null;
      if (this.state === 'ACTIVE') this.state = 'FINISHING';
      return;
    }
    const chosen = chooseNextQuestion(this.questions, this.items, this, QUESTION_ACCESS, this.env.rng);
    this.setCurrentQuestion(chosen, this.questionChoiceReason);
    this.currentItem = chosen.item;
    this.storeCurrent(chosen.item, chosen.type);
  }

  private moveLessonItem(delta: 1 | -1): void {
    this.answered = false;
    this.currentAnswer = '';
    if (this.state !== 'IN_LESSON_PRESENTATION' || this.currentItem === null) return;
    const index = this.items.indexOf(this.currentItem) + delta;
    if (index < 0 || index >= this.items.length) return;
    this.setCurrentQuestion(this.questions[0]!, delta > 0 ? 'MOVE_TO_NEXT_LESSON_ITEM' : 'MOVE_TO_PREVIOUS_LESSON_ITEM');
    this.currentItem = this.items[index]!;
    this.storeCurrent(this.currentItem, this.questions[0]!.type);
  }

  /** `Session.moveToNextLessonItem`. */
  moveToNextLessonItem(): void {
    this.moveLessonItem(1);
  }

  /** `Session.moveToPreviousLessonItem`. */
  moveToPreviousLessonItem(): void {
    this.moveLessonItem(-1);
  }

  /** `Session.advance`: Next. */
  advance(): void {
    if (!this.answered) return;
    if (this.currentItem !== null && itemFinished(this.currentItem)) this.lastFinishedSubjectId = this.currentItem.id;
    const q = this.currentQuestion;
    if (q !== null) {
      if (!this.correct) q.item.choiceDelay = 3;
      this.history.unshift(q);
      if (!this.correct && this.type === 'SELF_STUDY' && this.env.hooks.levelTestRoundActive(this.env.db)) {
        // Level test: one wrong answer settles the kanji as unknown; don't ask it again.
        this.questions = this.questions.filter((x) => x.item !== q.item);
        if (this.questions.length === 0) this.state = 'FINISHING';
      } else if (questionFinished(q)) {
        const at = this.questions.indexOf(q);
        if (at >= 0) this.questions.splice(at, 1);
        if (this.questions.length === 0) this.state = 'FINISHING';
      }
    }
    this.answered = false;
    this.currentAnswer = '';
    this.setCurrentQuestion(null, 'NEXT_NATURAL');
    this.currentItem = null;
  }

  /** `Session.startQuiz`: the end of the lesson presentation. */
  startQuiz(): void {
    this.state = 'ACTIVE';
    this.currentItem = null;
    this.setCurrentQuestion(null, 'STARTING_QUIZ');
    this.lastFinishedSubjectId = -1;
  }

  /** `Session.goBackToPresentation` (KanjiKodama's fixed version). */
  goBackToPresentation(): void {
    const shownItem = this.currentQuestion !== null ? this.currentQuestion.item : this.currentItem;
    if (this.answered && this.isActive() && this.type === 'LESSON') this.advance();
    if (!this.isActive() || this.type !== 'LESSON' || this.items.length === 0 || this.questions.length === 0) return;
    this.state = 'IN_LESSON_PRESENTATION';
    let target = shownItem !== null && this.items.includes(shownItem) ? shownItem : null;
    if (target === null) target = this.items.find((i) => i.id === this.env.stored.currentItemId) ?? null;
    this.currentItem = target ?? this.items[this.items.length - 1]!;
    this.env.stored.currentItemId = this.currentItem.id;
    this.setCurrentQuestion(this.questions[0]!, 'BACK_TO_PRESENTATION');
  }

  /** `Session.submit(matchingKanji)`: checks `currentAnswer` (`submitHelper`). */
  submit(matchingKanji: ContentSubject | null): AnswerVerdict {
    const q = this.currentQuestion;
    if (q === null) return NOK_WITHOUT_RETRY;
    const subject = this.subjectOf(q.item);
    if (this.answered) return makeVerdict(this.correct, false, false, null, null, null);
    const prefs = this.env.prefs;
    const check = submitCheck(q.type, subject.content, this.currentAnswer, {
      closeEnoughAction: closeEnoughAction(prefs),
      requireOnInKatakana: requireOnInKatakana(prefs),
      meaningSynonyms: parseMeaningSynonyms(stringOrNull(subject.progress.meaningSynonyms)),
      matchingKanji,
    });
    if (check.precheck.trailingNFixed) this.currentAnswer = check.precheck.answer;
    if (check.precheck.rejection !== null) return check.precheck.rejection;
    const verdict = check.verdict;
    if (verdict.ok) {
      this.markCorrect(q);
      this.answered = true;
      this.correct = true;
      this.lastVerdict = verdict;
    } else if (!verdict.retry) {
      this.markIncorrect(q);
      this.answered = true;
      this.correct = false;
      this.lastVerdict = verdict;
    }
    return verdict;
  }

  /** `Session.submitAnkiCorrect`. */
  submitAnkiCorrect(): void {
    if (this.answered || this.currentQuestion === null) return;
    this.markCorrect(this.currentQuestion);
    this.answered = true;
    this.correct = true;
    this.lastVerdict = null;
  }

  /** `Session.submitAnkiIncorrect`. */
  submitAnkiIncorrect(): void {
    if (this.answered || this.currentQuestion === null) return;
    this.markIncorrect(this.currentQuestion);
    this.answered = true;
    this.correct = false;
    this.lastVerdict = null;
  }

  /** `Session.submitDontKnow`. */
  submitDontKnow(): void {
    if (this.answered || this.currentQuestion === null) return;
    this.currentAnswer = '';
    this.markIncorrect(this.currentQuestion);
    this.answered = true;
    this.correct = false;
    this.lastVerdict = null;
  }

  /** `Session.putBack`: back into the queue, before the first question of a lower bucket. */
  private putBack(q: Question): void {
    if (this.questions.includes(q)) return;
    let index = 0;
    while (index < this.questions.length && q.item.bucket < this.questions[index]!.item.bucket) index++;
    this.questions.splice(index, 0, q);
    q.item.choiceDelay = 3;
  }

  /** The question an undo applies to: the answered current one, or the top of the history (popped). */
  private undoTarget(): { question: Question; inPlace: boolean } {
    const q = this.currentQuestion;
    if (q !== null && this.answered && questionCanUndo(q)) return { question: q, inPlace: true };
    return { question: this.history.shift()!, inPlace: false };
  }

  /** `Session.undoAndRetry`. */
  undoAndRetry(): void {
    if (!this.canUndo()) return;
    const { question, inPlace } = this.undoTarget();
    this.setCurrentQuestion(question, 'UNDO_AND_RETRY');
    this.undoQuestion(question);
    if (!inPlace) {
      this.currentItem = question.item;
      this.storeCurrent(question.item, question.type);
      this.putBack(question);
    }
    this.answered = false;
    this.correct = false;
    this.currentAnswer = '';
    if (this.state === 'FINISHING') this.state = 'ACTIVE';
  }

  /** `Session.undoAndPutBack`. */
  undoAndPutBack(): void {
    if (!this.canUndo()) return;
    const { question } = this.undoTarget();
    this.undoQuestion(question);
    this.putBack(question);
    this.answered = false;
    this.correct = false;
    this.setCurrentQuestion(null, 'UNDO_AND_PUT_BACK');
    this.currentItem = null;
    this.currentAnswer = '';
    if (this.state === 'FINISHING') this.state = 'ACTIVE';
  }

  /** `Session.skip`. */
  skip(): void {
    if (this.answered) return;
    if (this.currentItem !== null) this.currentItem.choiceDelay = 3;
    this.setCurrentQuestion(null, 'SKIP');
    this.currentItem = null;
    this.currentAnswer = '';
  }

  /** `Session.ignore`: undo a wrong answer and count it correct. */
  ignore(): void {
    if (!this.canUndo()) return;
    const { question, inPlace } = this.undoTarget();
    this.setCurrentQuestion(question, 'UNDO_AND_RETRY');
    this.undoQuestion(question);
    if (!inPlace) {
      this.currentItem = question.item;
      this.storeCurrent(question.item, question.type);
      this.putBack(question);
    }
    this.currentAnswer = '';
    if (this.state === 'FINISHING') this.state = 'ACTIVE';
    this.markCorrect(question);
    this.answered = true;
    this.correct = true;
    this.lastVerdict = null;
  }

  /** `Session.toggleLightningMode`. */
  toggleLightningMode(): void {
    this.lightningModeTemporarilyDisabled = !this.lightningModeTemporarilyDisabled;
  }

  /** `Session.checkQuestions`: drop finished questions and abandoned history. */
  private checkQuestions(): void {
    if (this.currentQuestion !== null && questionFinished(this.currentQuestion)) {
      this.currentItem = null;
      this.setCurrentQuestion(null, 'CLEANUP');
    }
    this.questions = this.questions.filter((q) => !questionFinished(q));
    this.history = this.history.filter((q) => q.item.state !== 'ABANDONED');
    if (this.state === 'ACTIVE' && this.questions.length === 0) this.state = 'FINISHING';
  }

  /** `Session.createQuestions`. */
  private createQuestions(): void {
    this.questions = [];
    for (const item of this.items) {
      for (const type of possibleQuestionTypes(contentSubject(this.env.db, item.id).object, this.onkun)) {
        const q: Question = { item, type, inflection: null };
        item.questions.push(q);
        this.questions.push(q);
      }
    }
  }

  /** `Session.load`: after a process restart, the session from the database. */
  load(): void {
    if (this.loaded) return;
    try {
      const { db, stored, prefs } = this.env;
      this.type = stored.sessionType;
      if (this.type === 'NONE') return;
      this.onkun = stored.sessionOnkun;
      this.delayed = delayResultUpload(prefs);
      const flags = this.env.ordering.questionOrder(this.type, prefs);
      this.backToBack = flags.backToBack;
      this.readingFirst = flags.readingFirst;
      this.meaningFirst = flags.meaningFirst;
      this.comparator = this.env.ordering.comparator(this.type, this.context());
      this.items = [];
      this.history = [];
      for (const row of storedRows(stored)) {
        const t = db.table.get(row.id);
        if (t === undefined || t.hiddenAt !== 0) continue;
        if (!isEligibleForSessionType(db, row.id, this.type, this.env.now)) continue;
        this.items.push({ ...row, done: [...row.done], incorrect: [...row.incorrect], choiceDelay: 0, questions: [] });
      }
      if (this.items.length > 0) {
        this.createQuestions();
        this.state = this.type === 'LESSON' && this.numStarted() === 0 ? 'IN_LESSON_PRESENTATION' : 'ACTIVE';
        this.checkQuestions();
        this.lastFinishedSubjectId = -1;
        const currentItemId = stored.currentItemId;
        const currentType = stored.currentQuestionType ?? 'WANIKANI_RADICAL_NAME';
        if (this.state === 'IN_LESSON_PRESENTATION') {
          const item = this.items.find((i) => i.state === 'ACTIVE' && i.id === currentItemId);
          if (item !== undefined) {
            this.currentItem = item;
            this.setCurrentQuestion(this.questions[0]!, 'LOAD');
          }
        } else {
          const q = this.questions.find((x) => x.item.state === 'ACTIVE' && !questionFinished(x)
            && x.item.id === currentItemId && x.type === currentType);
          if (q !== undefined) {
            this.currentItem = q.item;
            this.setCurrentQuestion(q, 'LOAD');
          }
        }
      }
    } finally {
      this.loaded = true;
    }
  }

  /** `Session.finish`: finish or abandon. */
  finish(): void {
    this.env.hooks.onSessionFinishing(this.env.db, this.type, [...this.items], this.env.now);
    this.items = [];
    this.questions = [];
    this.history = [];
    this.state = 'INACTIVE';
    this.currentAnswer = '';
    this.setCurrentQuestion(null, 'FINISHED');
    this.currentItem = null;
    this.schedule('FinishSessionJob', this.type);
  }

  /** `Session.reset`: what a progress restore does to the running session (type and current question stay). */
  reset(): void {
    this.items = [];
    this.questions = [];
    this.history = [];
    this.state = 'INACTIVE';
  }

  /** `Session.wrapup`. */
  wrapup(): void {
    if (this.state === 'IN_LESSON_PRESENTATION') {
      this.finish();
      return;
    }
    for (const item of this.items) {
      if (item.state === 'ACTIVE' && !itemStarted(item)) {
        item.state = 'ABANDONED';
        this.schedule('AbandonSessionItemJob', String(item.id));
      }
    }
    if (this.currentQuestion !== null && this.currentQuestion.item.state === 'ABANDONED') {
      this.currentItem = null;
      this.setCurrentQuestion(null, 'WRAPUP');
    }
    this.checkQuestions();
  }

  private context(): { db: LearnerDb; prefs: Preferences; now: number; rng: JavaRandom } {
    return { db: this.env.db, prefs: this.env.prefs, now: this.env.now, rng: this.env.rng };
  }

  /** `Session.populateItems`. */
  private populateItems(subjects: readonly SessionSubject[], maxSize: number, shuffle: boolean): void {
    const ctx = this.context();
    let list = [...subjects];
    if (shuffle) shuffleInPlace(list, this.env.rng);
    list.sort(this.comparator);
    if (list.length > maxSize) list = this.env.ordering.trimSelection(list, maxSize, this.type as SessionKind, ctx, this.comparator);
    if (this.env.ordering.shuffleAfterSelection(this.type as SessionKind, this.env.prefs)) this.comparator = () => 0;

    const stored = this.env.stored;
    stored.items.clear();
    this.items = [];
    let index = 0;
    let currentBucket = 0;
    let prev: SessionSubject | null = null;
    for (const subject of list) {
      if (prev !== null && this.comparator(prev, subject) !== 0) currentBucket++;
      const needed = neededSlots(subject.content, this.onkun);
      const item: SessionItem = {
        id: subject.id,
        assignmentId: num(subject.progress, 'assignmentId'),
        state: 'ACTIVE',
        srsStageId: num(subject.progress, 'srsStage'),
        level: subject.table.level,
        bucket: currentBucket,
        order: index++,
        done: [!needed[0], !needed[1], !needed[2], !needed[3]],
        incorrect: [0, 0, 0, 0],
        numAnswers: 0,
        lastAnswer: 0,
        choiceDelay: 0,
        questions: [],
      };
      stored.items.set(item.id, rowOf(item));
      this.items.push(item);
      prev = subject;
    }
  }

  /** `Session.startNewLessonSession` / `startNewReviewSession` / `startNewSelfStudySession`. */
  start(type: SessionKind, subjects: readonly SessionSubject[]): void {
    if (subjects.length === 0) throw new Error('IllegalArgumentException: no subjects');
    const { prefs, stored, ordering } = this.env;
    this.type = type;
    this.onkun = kanjiModeOnKun(prefs);
    this.delayed = delayResultUpload(prefs);
    const flags = ordering.questionOrder(type, prefs);
    this.backToBack = flags.backToBack;
    this.readingFirst = flags.readingFirst;
    this.meaningFirst = flags.meaningFirst;
    this.lightningModeTemporarilyDisabled = false;
    stored.sessionType = type;
    stored.sessionOnkun = this.onkun;
    const maxSize = ordering.maxSize(type, prefs);
    this.comparator = ordering.comparator(type, this.context());
    this.history = [];
    this.populateItems(subjects, maxSize, ordering.shuffleBeforeSort(type, prefs));
    this.createQuestions();
    this.state = type === 'LESSON' ? 'IN_LESSON_PRESENTATION' : 'ACTIVE';
    this.currentItem = null;
    this.setCurrentQuestion(null, type === 'LESSON' ? 'STARTING_LESSON_SESSION'
      : type === 'REVIEW' ? 'STARTING_REVIEW_SESSION' : 'STARTING_SELF_STUDY_SESSION');
    this.lastFinishedSubjectId = -1;
    this.checkQuestions();
  }

  /** The summary's Finish with delayed reporting (`SummarySessionFragment.doInBackground`): report the PENDING items. */
  reportPending(): SessionItemRow[] {
    const pending = storedRows(this.env.stored).filter((r) => r.state === 'PENDING');
    for (const r of pending) {
      const [i1, i2, i3, i4] = r.incorrect;
      runReportJob(this.env, r.id, this.type, i1, i2 + i3 + i4, r.lastAnswer, r.assignmentId);
    }
    return pending;
  }
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** `ReportSessionItemJob.runLocal`: the stored item becomes REPORTED, then the local report. */
function runReportJob(env: SessionEnv, id: number, type: SessionType, meaningIncorrect: number, readingIncorrect: number,
  timestamp: number, assignmentId = 0): void {
  const row = env.stored.items.get(id);
  if (row !== undefined) {
    row.state = 'REPORTED';
    row.done = [true, true, true, true];
    row.lastAnswer = timestamp;
  }
  if (type === 'NONE') throw new Error('report without a session type');
  if (env.hooks.report) env.hooks.report(env.db, { subjectId: id, type, meaningIncorrect, readingIncorrect, timestamp, assignmentId: Number.isFinite(assignmentId) ? assignmentId : 0 }, env.now);
  else reportLocal(env.db, { subjectId: id, type, meaningIncorrect, readingIncorrect, timestamp }, env.now);
}
