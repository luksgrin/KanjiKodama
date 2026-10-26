/**
 * The `session*` actions (`SessionDriver`): they drive `core/session`'s `Session` the way
 * SessionActivity and its fragments do, and record per step the session state, the question queue
 * and every job the session scheduled.
 *
 * State: `rs.ext.session` holds what the database keeps (session items and properties); `restore`
 * deletes it like the Java reset deletes the session items, and the live session is then `reset()`.
 * `rs.ext.sessionLive` holds the live `Session` (a process restart replaces it) and
 * `rs.ext.prefs` the preferences the steps set (put back only by the next scenario's base reset).
 */

import { ankiMode } from '../../../../src/core/anki';
import { JavaRandom } from '../../../../src/core/rng';
import {
  QUESTION_TYPE_INFO,
  checkAnswer,
  type AnswerVerdict,
  type QuestionType,
} from '../../../../src/core/answer';
import { submitPrecheck } from '../../../../src/core/answer/submit';
import { matchingKanjiLookupCharacters } from '../../../../src/core/answer/matchingKanji';
import { parseMeaningSynonyms } from '../../../../src/core/answer/synonyms';
import type { ContentSubject } from '../../../../src/core/content';
import { onSessionFinishing, startRound1, startRound2 } from '../../../../src/core/levelTest';
import { contentSubject, progressRow, type LearnerDb } from '../../../../src/core/progression';
import {
  Session,
  emptyStoredSession,
  levelTestRoundActive,
  sessionSubject,
  settingsOrdering,
  storedRows,
  type JobRecord,
  type Question,
  type SessionEnv,
  type SessionHooks,
  type SessionKind,
  type SessionSubject,
  type StoredSession,
} from '../../../../src/core/session';
import {
  prefBoolean,
  randomizeInflections,
  shakeOnMatchingKanji,
  type Preferences,
  type PreferenceValue,
} from '../../../../src/core/settings';
import { javaRound, type ActionHandler, type RunnerState, type Step } from '../runner';
import { matchesFilter, select, type Filter } from '../select';
import { levelTestRandom } from './levelTest';

const WRONG_MEANING = 'qqqqqqqq';
const WRONG_READINGS = ['ぬぬぬぬ', 'へへへへ', 'ゑゑゑゑ'];

/** `SessionDriver.PINNED`: what every sessionStart sets first (null removes the key). */
const PINNED: readonly [string, PreferenceValue][] = [
  ['enable_advanced', false],
  ['delay_result_upload', false],
  ['auto_download_audio', false],
  ['show_pitch_info', false],
  ['kanji_mode_onkun', false],
  ['require_onyomi_in_katakana', false],
  ['close_enough_action', null],
  ['max_lesson_session_size', null],
  ['max_review_session_size', null],
  ['max_self_study_session_size', null],
];

interface Stored {
  stored: StoredSession;
}

interface Live {
  session: Session;
  env: SessionEnv;
  jobs: JobRecord[];
}

function prefsOf(rs: RunnerState): Record<string, PreferenceValue> {
  let p = rs.ext.prefs as Record<string, PreferenceValue> | undefined;
  if (p === undefined) {
    p = {};
    rs.ext.prefs = p;
  }
  return p;
}

/** The stored session; a restore (which deleted it) also resets the live session, like `ProgressStore.restore`. */
function storedOf(rs: RunnerState): StoredSession {
  let s = rs.ext.session as Stored | undefined;
  if (s === undefined) {
    s = { stored: emptyStoredSession() };
    rs.ext.session = s;
    (rs.ext.sessionLive as Live | undefined)?.session.reset();
  }
  return s.stored;
}

const hooks: SessionHooks = {
  levelTestRoundActive,
  onSessionFinishing: (db, type, items) => {
    onSessionFinishing(db, type, items.map((i) => ({
      id: i.id,
      hasIncorrectAnswers: i.incorrect.some((n) => n > 0),
      abandoned: i.state === 'ABANDONED',
      finished: i.state !== 'ACTIVE' || i.done.every((d) => d),
    })));
  },
};

/** The Java base reset's `new Random(seed)` behind the inflection picks; it lives for the whole scenario. */
function inflectionRngOf(rs: RunnerState): JavaRandom {
  let r = rs.ext.inflectionRng as JavaRandom | undefined;
  if (r === undefined) {
    r = new JavaRandom(BigInt(rs.seed));
    rs.ext.inflectionRng = r;
  }
  return r;
}

function newLive(rs: RunnerState): Live {
  const jobs: JobRecord[] = [];
  const env: SessionEnv = {
    db: rs.db,
    get prefs(): Preferences {
      return prefsOf(rs);
    },
    get now(): number {
      return rs.now;
    },
    rng: rs.rng,
    // InflectionUtil.setRandomSourceForTesting(new Random(seed)::nextDouble) in the Java base reset.
    inflectionRng: inflectionRngOf(rs),
    get stored(): StoredSession {
      return storedOf(rs);
    },
    ordering: settingsOrdering,
    jobs,
    hooks,
  };
  return { session: new Session(env), env, jobs };
}

function liveOf(rs: RunnerState): Live {
  let live = rs.ext.sessionLive as Live | undefined;
  if (live === undefined) {
    live = newLive(rs);
    rs.ext.sessionLive = live;
  }
  storedOf(rs);
  return live;
}

/** `SessionDriver.applySettings`: PINNED plus the step's settings; `resolved.settings` is what was applied. */
function applySettings(rs: RunnerState, overrides: unknown, resolved: Record<string, unknown>): void {
  const wanted = new Map<string, PreferenceValue>(PINNED);
  if (overrides !== null && typeof overrides === 'object') {
    for (const [k, v] of Object.entries(overrides as Record<string, unknown>)) wanted.set(k, v as PreferenceValue);
  }
  const prefs = prefsOf(rs);
  for (const [k, v] of wanted) {
    if (v === null || v === undefined) delete prefs[k];
    else prefs[k] = v;
  }
  resolved.settings = Object.fromEntries(wanted);
}

/** The subjects of a start, in id-list order (`SubjectCollectionsDao.getByIds`: visible only). */
function subjectsFor(db: LearnerDb, ids: readonly number[]): SessionSubject[] {
  return ids.map((id) => {
    const t = db.table.get(id);
    if (t === undefined || t.hiddenAt !== 0) throw new Error(`no subject ${id}`);
    return sessionSubject(db, id);
  });
}

/** Self-study `where`: visible subjects in level/lesson order. */
function selfStudyIds(db: LearnerDb, where: Filter): number[] {
  const rows: { id: number; level: number; pos: number }[] = [];
  for (const s of db.content.subjects) {
    const t = db.table.get(s.id)!;
    if (t.hiddenAt !== 0 || !matchesFilter(db, s.id, where)) continue;
    rows.push({ id: s.id, level: t.level, pos: t.lessonPosition });
  }
  rows.sort((a, b) => a.level - b.level || a.pos - b.pos || a.id - b.id);
  const ids = rows.map((r) => r.id);
  return where !== null && where !== undefined && 'limit' in where ? ids.slice(0, Math.max(0, Number(where.limit))) : ids;
}

function start(rs: RunnerState, live: Live, step: Step, resolved: Record<string, unknown>, result: Record<string, unknown>): void {
  applySettings(rs, step.settings, resolved);
  const type = String(step.type) as SessionKind;
  let ids: number[];
  if ('levelTestRound' in step) {
    ids = Number(step.levelTestRound) === 1 ? startRound1(rs.db, levelTestRandom(rs)) : startRound2(rs.db, levelTestRandom(rs));
  } else if (Array.isArray(step.ids)) {
    ids = step.ids.map(Number);
  } else if (type === 'SELF_STUDY') {
    ids = selfStudyIds(rs.db, step.where as Filter);
  } else {
    ids = select(rs.db, rs.now, step.where as Filter, type === 'LESSON');
  }
  const subjects = subjectsFor(rs.db, ids);
  resolved.ids = ids;
  result.count = subjects.length;
  if (subjects.length === 0) return;
  live.session.start(type, subjects);
}

function kind(t: QuestionType): 'meaning' | 'reading' {
  return QUESTION_TYPE_INFO[t].meaning ? 'meaning' : 'reading';
}

/** `SessionDriver.spec`: the first rule list (id:kind, id, kind) that still has entries, else the default. */
function spec(step: Step, used: Map<string, number>, id: number, t: QuestionType): unknown {
  const rules = (step.rules ?? {}) as Record<string, unknown[]>;
  for (const key of [`${id}:${kind(t)}`, String(id), kind(t)]) {
    const list = rules[key];
    if (list === undefined) continue;
    const n = used.get(key) ?? 0;
    if (n < list.length) {
      used.set(key, n + 1);
      return list[n];
    }
  }
  return 'answer' in step ? step.answer : 'correct';
}

/** The 5-argument `checkAnswer` the driver uses to pick texts (no matching kanji, SILENTLY_ACCEPT, no katakana rule). */
function driverCheck(db: LearnerDb, t: QuestionType, s: ContentSubject, text: string): AnswerVerdict {
  return checkAnswer(t, s, text, {
    closeEnoughAction: 'SILENTLY_ACCEPT',
    requireOnInKatakana: false,
    meaningSynonyms: parseMeaningSynonyms(stringOrNull(progressRow(db, s.id).meaningSynonyms)),
  });
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function passesPrecheck(t: QuestionType, s: ContentSubject, text: string): boolean {
  return submitPrecheck(t, s.characters, text).rejection === null;
}

function correctText(db: LearnerDb, t: QuestionType, s: ContentSubject): string {
  const candidates = QUESTION_TYPE_INFO[t].meaning ? s.meanings.map((m) => m.meaning) : s.readings.map((r) => r.reading);
  for (const c of candidates) {
    if (c === null || c === '' || !passesPrecheck(t, s, c)) continue;
    const v = driverCheck(db, t, s, c);
    if (v.ok && !v.nearMatch) return c;
  }
  throw new Error(`no correct answer for ${s.id} ${t}`);
}

function wrongText(db: LearnerDb, t: QuestionType, s: ContentSubject): string {
  for (const c of QUESTION_TYPE_INFO[t].meaning ? [WRONG_MEANING] : WRONG_READINGS) {
    if (!passesPrecheck(t, s, c)) continue;
    const v = driverCheck(db, t, s, c);
    if (!v.ok && !v.retry) return c;
  }
  throw new Error(`no wrong answer for ${s.id} ${t}`);
}

/** `SubjectDao.getKanjiByCharacters`: the first visible kanji with these characters, in id order. */
function kanjiByCharacters(db: LearnerDb, characters: string): ContentSubject | null {
  for (const s of db.content.subjects) {
    if (s.object === 'kanji' && s.characters === characters && db.table.get(s.id)!.hiddenAt === 0) return s;
  }
  return null;
}

/** `Question.getAnkiAnswerRichText(subject, sessionType).toString()` (picks the inflection on first use). */
function ankiAnswerText(live: Live, q: Question): string {
  return live.session.questionAnkiAnswer(q, prefBoolean(live.env.prefs, 'show_onyomi_in_katakana', false)).text;
}

function answer(rs: RunnerState, live: Live, step: Step, resolved: Record<string, unknown>, result: Record<string, unknown>): void {
  const session = live.session;
  const untilFinishing = step.until === 'finishing';
  const count = untilFinishing ? Number.MAX_SAFE_INTEGER : typeof step.count === 'number' ? step.count : 1;
  const max = typeof step.max === 'number' ? step.max : 500;
  const only = typeof step.only === 'string' ? step.only : null;
  const app = step.advance === 'app';
  const advance = app || (typeof step.advance === 'boolean' ? step.advance : true);
  const spacing = javaRound((typeof step.spacingSeconds === 'number' ? step.spacingSeconds : 0) * 1000);
  const used = new Map<string, number>();
  const answers: unknown[] = [];
  let stopped: string | null = null;
  let done = 0;
  for (let i = 0; done < count; i++) {
    if (i >= max) {
      stopped = 'max';
      break;
    }
    session.chooseQuestion();
    const q = session.currentQuestion;
    if (q === null || session.answered || !session.isActive()) {
      stopped = q === null ? 'noQuestion' : session.answered ? 'answered' : 'notActive';
      break;
    }
    const id = q.item.id;
    // With randomized inflections on, the question header shows Question.getCharacters, which picks the inflection.
    const inflections = randomizeInflections(live.env.prefs, session.type);
    const shown = inflections ? session.questionCharacters(q) : null;
    if (only !== null && only !== kind(q.type) && only !== `${id}:${kind(q.type)}`) {
      const skipped: Record<string, unknown> = { id, questionType: q.type, answer: 'skip', text: null, verdict: null, atMs: rs.now };
      if (inflections) skipped.characters = shown;
      answers.push(skipped);
      session.skip();
      continue;
    }
    if (done > 0 && spacing > 0) rs.now += spacing;
    done++;
    const s = contentSubject(rs.db, id);
    const sp = spec(step, used, id, q.type);
    const k = sp !== null && typeof sp === 'object' ? 'text' : String(sp);
    let text: string | null = null;
    let verdict: AnswerVerdict | null = null;
    let anki: Record<string, unknown> | null = null;
    let matchingKanji: ContentSubject | null = null;
    if (k === 'dontKnow') {
      session.submitDontKnow();
    } else if (k === 'ankiCorrect' || k === 'ankiIncorrect') {
      anki = { ankiMode: ankiMode(live.env.prefs, session.type, q.type), ankiAnswer: ankiAnswerText(live, q) };
      if (k === 'ankiCorrect') session.submitAnkiCorrect();
      else session.submitAnkiIncorrect();
    } else {
      text = k === 'text' ? String((sp as Record<string, unknown>).text)
        : k === 'correct' ? correctText(rs.db, q.type, s)
          : k === 'wrong' ? wrongText(rs.db, q.type, s) : null;
      if (text === null) throw new Error(`bad answer ${JSON.stringify(sp)}`);
      session.currentAnswer = text;
      const lookup = matchingKanjiLookupCharacters(s, shakeOnMatchingKanji(live.env.prefs));
      matchingKanji = lookup === null ? null : kanjiByCharacters(rs.db, lookup);
      verdict = session.submit(matchingKanji);
    }
    const entry: Record<string, unknown> = {
      id, questionType: q.type, answer: k, text,
      verdict: verdict === null ? null : { ok: verdict.ok, retry: verdict.retry, nearMatch: verdict.nearMatch },
      atMs: rs.now,
    };
    if (inflections) entry.characters = shown;
    if (anki !== null) Object.assign(entry, anki);
    if (matchingKanji !== null) entry.matchingKanji = matchingKanji.id;
    if (app) {
      const active = session.isLightningModeActive();
      const auto = session.lightningAdvancesNow(active);
      entry.lightning = { active, linger: session.lingerOnAnswer, autoAdvanced: auto };
    }
    answers.push(entry);
    if (advance) {
      session.advance();
      session.chooseQuestion();
    }
    if (untilFinishing && !session.isActive()) break;
  }
  resolved.answers = answers;
  result.answered = done;
  result.stopped = stopped;
}

type Button = 'UNDO_AND_MARK_CORRECT' | 'UNDO_AND_RETRY_NOW' | 'UNDO_AND_PUT_BACK' | 'SKIP' | 'TOGGLE_LIGHTNING_MODE' | 'DISABLE';

/** `SpecialButtonBehavior.canShow`. */
function canShow(s: Session, b: Button): boolean {
  switch (b) {
    case 'UNDO_AND_MARK_CORRECT':
      return s.canUndo() && s.answered && !s.correct;
    case 'UNDO_AND_RETRY_NOW':
    case 'UNDO_AND_PUT_BACK':
      return s.canUndo();
    case 'SKIP':
      return s.isActive() && !s.answered;
    case 'TOGGLE_LIGHTNING_MODE':
      return s.isActive();
    default:
      return false;
  }
}

/** `SpecialButtonBehavior.perform`. */
function perform(s: Session, b: Button): void {
  if (!canShow(s, b)) return;
  switch (b) {
    case 'UNDO_AND_MARK_CORRECT':
      s.ignore();
      break;
    case 'UNDO_AND_RETRY_NOW':
      s.undoAndRetry();
      break;
    case 'UNDO_AND_PUT_BACK':
      s.undoAndPutBack();
      break;
    case 'SKIP':
      s.skip();
      break;
    case 'TOGGLE_LIGHTNING_MODE':
      s.toggleLightningMode();
      break;
    default:
      break;
  }
}

/** The lesson presentation's item (`SessionDriver.presentation`). */
function presentation(live: Live): Record<string, unknown> {
  const item = live.session.currentItem;
  return {
    item: item === null ? null : item.id,
    index: item === null ? -1 : live.session.items.indexOf(item),
    storedItemId: live.env.stored.currentItemId,
  };
}

function questionList(questions: readonly Question[]): unknown[] {
  return questions.map((q) => [q.item.id, q.type]);
}

/** `SessionDriver.state`. */
function state(live: Live): Record<string, unknown> {
  const s = live.session;
  const current = s.currentQuestion;
  return {
    type: s.type,
    state: s.state,
    delayed: s.isDelayed(),
    answered: s.answered,
    correct: s.correct,
    canUndo: s.canUndo(),
    canBeWrappedUp: s.canBeWrappedUp(),
    progressText: s.progressText(),
    current: current === null ? null : [current.item.id, current.type],
    reason: s.questionChoiceReason,
    queue: questionList(s.questions),
    history: questionList(s.history),
    items: s.items.map((i) => ({
      id: i.id, state: i.state, order: i.order, bucket: i.bucket, choiceDelay: i.choiceDelay, numAnswers: i.numAnswers,
      lastAnswer: i.lastAnswer, done: [...i.done], incorrect: [...i.incorrect],
    })),
    db: {
      sessionType: live.env.stored.sessionType,
      items: storedRows(live.env.stored).map((r) => ({
        id: r.id, state: r.state, done: [...r.done], incorrect: [...r.incorrect], numAnswers: r.numAnswers, lastAnswer: r.lastAnswer,
      })),
    },
  };
}

/** `SessionDriver.perform`: the action, then `chooseQuestion`, then the recorded state and jobs. */
const sessionAction: ActionHandler = ({ rs, step, resolved }) => {
  let live = liveOf(rs);
  live.jobs.length = 0;
  const result: Record<string, unknown> = {};
  const session = (): Session => live.session;
  switch (step.action) {
    case 'sessionStart':
      start(rs, live, step, resolved, result);
      break;
    case 'sessionStartQuiz':
      session().startQuiz();
      break;
    case 'sessionAnswer':
      answer(rs, live, step, resolved, result);
      break;
    case 'sessionAdvance':
      session().advance();
      break;
    case 'sessionButton': {
      const b = String(step.button) as Button;
      const pressed: boolean[] = [];
      const labels: string[] = [];
      const n = typeof step.count === 'number' ? step.count : 1;
      for (let i = 0; i < n; i++) {
        pressed.push(canShow(session(), b));
        perform(session(), b);
        session().chooseQuestion();
        if (b === 'TOGGLE_LIGHTNING_MODE') labels.push(session().isLightningModeActive() ? 'Lightning' : 'L̶i̶g̶h̶t̶n̶i̶n̶g̶');
      }
      resolved.pressed = pressed;
      if (b === 'TOGGLE_LIGHTNING_MODE') resolved.labels = labels;
      break;
    }
    case 'sessionAnkiButton':
      resolved.before = { answered: session().answered, correct: session().correct };
      if (step.button === 'correct') session().submitAnkiCorrect();
      else session().submitAnkiIncorrect();
      break;
    case 'sessionWrapUp':
      session().wrapup();
      break;
    case 'sessionBackToPresentation':
      resolved.menuVisible = session().type === 'LESSON' && session().isActive();
      session().goBackToPresentation();
      result.presentation = presentation(live);
      break;
    case 'sessionPresentationNext':
    case 'sessionPresentationPrevious': {
      const n = typeof step.count === 'number' ? step.count : 1;
      for (let i = 0; i < n; i++) {
        if (step.action === 'sessionPresentationNext') session().moveToNextLessonItem();
        else session().moveToPreviousLessonItem();
      }
      result.presentation = presentation(live);
      break;
    }
    case 'sessionInspect':
      result.presentation = presentation(live);
      break;
    case 'sessionFinish': {
      const pending = session().isDelayed() ? session().reportPending() : [];
      resolved.pending = pending.map((r) => ({
        id: r.id, meaningIncorrect: r.incorrect[0], readingIncorrect: r.incorrect[1] + r.incorrect[2] + r.incorrect[3], lastAnswer: r.lastAnswer,
      }));
      session().finish();
      break;
    }
    case 'sessionAbandon':
      session().finish();
      break;
    case 'sessionRestart': {
      // A process restart: a new Session with the constructor's values, then Session.load.
      const jobs = live.jobs;
      live = newLive(rs);
      live.jobs.push(...jobs);
      rs.ext.sessionLive = live;
      live.session.load();
      break;
    }
    default:
      throw new Error(`unknown action ${step.action}`);
  }
  live.session.chooseQuestion();
  result.session = state(live);
  result.jobs = [...live.jobs];
  return result;
};

export const sessionActions: Record<string, ActionHandler> = Object.fromEntries([
  'sessionStart', 'sessionStartQuiz', 'sessionAnswer', 'sessionAdvance', 'sessionButton', 'sessionAnkiButton',
  'sessionWrapUp', 'sessionBackToPresentation', 'sessionPresentationNext', 'sessionPresentationPrevious',
  'sessionInspect', 'sessionFinish', 'sessionAbandon', 'sessionRestart',
].map((name) => [name, sessionAction]));
