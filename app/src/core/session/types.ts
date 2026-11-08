/**
 * The types the session engine shares with item selection and question order (`order*.ts`,
 * `selection*.ts`) and with the level test.
 */

import type { QuestionType } from '../answer/questionType';
import type { ContentSubject } from '../content';
import type { SubjectProgressRow } from '../progressFile/format';
import type { LearnerDb, TableRow } from '../progression/db';
import type { SeededRandom } from '../rng';
import type { Preferences, SessionType } from '../settings';
import type { SrsSystem } from '../srs';

export type { SessionType };

/** The three kinds of session that can be started (`SessionType` without NONE). */
export type SessionKind = Exclude<SessionType, 'NONE'>;

/** The session's state. */
export type SessionState = 'INACTIVE' | 'IN_LESSON_PRESENTATION' | 'ACTIVE' | 'FINISHING';

/** A session item's state. */
export type SessionItemState = 'ACTIVE' | 'PENDING' | 'REPORTED' | 'ABANDONED';

/** Why a question was chosen (the values the session sets). */
export type QuestionChoiceReason =
  | 'STARTING_LESSON_SESSION'
  | 'STARTING_REVIEW_SESSION'
  | 'STARTING_SELF_STUDY_SESSION'
  | 'STARTING_QUIZ'
  | 'MOVE_TO_NEXT_LESSON_ITEM'
  | 'MOVE_TO_PREVIOUS_LESSON_ITEM'
  | 'BACK_TO_PRESENTATION'
  | 'NEXT_NATURAL'
  | 'NEXT_FORCED'
  | 'UNDO_AND_RETRY'
  | 'UNDO_AND_PUT_BACK'
  | 'SKIP'
  | 'WRAPUP'
  | 'CLEANUP'
  | 'LOAD'
  | 'FINISHING_SESSION'
  | 'FINISHED';

/**
 * A subject as ordering and selection read it: the content, the table's
 * runtime layout (level and lesson position in the current curriculum order, hiddenAt) and the
 * progress columns, read when the session starts.
 */
export interface SessionSubject {
  readonly id: number;
  readonly content: ContentSubject;
  readonly table: TableRow;
  readonly progress: SubjectProgressRow;
  readonly srsSystem: SrsSystem;
}

/** A `Comparator<Subject>`: 0 means "same bucket" (Session.populateItems starts a new bucket on non-zero). */
export type SubjectComparator = (a: SessionSubject, b: SessionSubject) => number;

/** What ordering and selection may read. `rng` is the app's shared random. */
export interface SessionContext {
  readonly db: LearnerDb;
  readonly prefs: Preferences;
  /** `Clock.now()`. */
  readonly now: number;
  readonly rng: SeededRandom;
}

/** `<type>_back_to_back`, `<type>_reading_first`, `<type>_meaning_first`. */
export interface QuestionOrderFlags {
  readonly backToBack: boolean;
  readonly readingFirst: boolean;
  readonly meaningFirst: boolean;
}

/**
 * Item selection and order for `Session.startNew*Session`/`populateItems` (implemented in `order*.ts`
 * and `selection*.ts`; the engine takes an implementation so either side can change on its own):
 *
 * 1. `comparator(type, ctx)`: the order setting's comparator, reversed, overdue-first and the priority
 *    setting applied (`startNewLessonSession` etc.).
 * 2. The candidates are shuffled with `ctx.rng` when `shuffleBeforeSort(type, prefs)`, then sorted
 *    (stable) with the comparator.
 * 3. More than `maxSize(type, prefs)` candidates: `trimSelection` (`Session.trimSelection` with
 *    `SubjectSelectionRules`); it returns the chosen subjects sorted with the comparator.
 * 4. `shuffleAfterSelection(type, prefs)`: the comparator becomes `LessonOrder.SHUFFLE`'s (always 0)
 *    for the buckets.
 */
export interface SessionOrdering {
  comparator(type: SessionKind, ctx: SessionContext): SubjectComparator;
  shuffleBeforeSort(type: SessionKind, prefs: Preferences): boolean;
  maxSize(type: SessionKind, prefs: Preferences): number;
  trimSelection(candidates: SessionSubject[], maxSize: number, type: SessionKind, ctx: SessionContext,
    comparator: SubjectComparator): SessionSubject[];
  shuffleAfterSelection(type: SessionKind, prefs: Preferences): boolean;
  questionOrder(type: SessionType, prefs: Preferences): QuestionOrderFlags;
}

/** A session item (the live object; `choiceDelay` is not persisted). */
export interface SessionItem {
  readonly id: number;
  assignmentId: number;
  state: SessionItemState;
  /** `srsSystemId`/`srsStage` when the item was created. */
  srsStageId: number;
  level: number;
  bucket: number;
  order: number;
  /** question1Done .. question4Done (meaning, reading, on'yomi, kun'yomi). */
  done: [boolean, boolean, boolean, boolean];
  incorrect: [number, number, number, number];
  numAnswers: number;
  lastAnswer: number;
  choiceDelay: number;
  /** The item's questions, in creation order. */
  readonly questions: Question[];
}

/** A question. Identity matters: the queue and history hold these objects. */
export interface Question {
  readonly item: SessionItem;
  readonly type: QuestionType;
  /** `Question.inflection`: picked once, on first use. */
  inflection: string | null;
}

/** A `session_item` row: what the jobs and `Session.load` read and write. */
export interface SessionItemRow {
  readonly id: number;
  assignmentId: number;
  state: SessionItemState;
  srsStageId: number;
  level: number;
  bucket: number;
  order: number;
  done: [boolean, boolean, boolean, boolean];
  incorrect: [number, number, number, number];
  numAnswers: number;
  lastAnswer: number;
}

/**
 * What the session keeps in the database (`session_item` plus the session properties): it survives a
 * process restart, the live `Session` does not.
 */
export interface StoredSession {
  /** `properties.session_type`. */
  sessionType: SessionType;
  sessionOnkun: boolean;
  /** `properties.current_item_id` (0 when none). */
  currentItemId: number;
  /** `properties.current_question_type` (null reads as WANIKANI_RADICAL_NAME). */
  currentQuestionType: QuestionType | null;
  /** By id; `rows()` gives them in `order`. */
  readonly items: Map<number, SessionItemRow>;
}
