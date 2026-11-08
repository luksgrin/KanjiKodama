/**
 * The app's one study session (Java `Session.getInstance()` plus the parts of `SessionActivity` and
 * `FloatingUiState` around it), on top of the core session engine:
 *
 * - every action runs inside `app.write` (reports change the learner), then the session is saved to the
 *   Dexie `session` table (`sessionStorage.ts`), so it survives an app restart;
 * - after each action `chooseQuestion` runs and a correct answer in lightning mode advances at once
 *   (`SessionActivity.updateFragment`); audio autoplays like `SessionActivity.playAudio`;
 * - the floating UI state (last verdict, toasts, info dump stage, Anki reveal) lives here so a screen
 *   change keeps it, as Java's static `FloatingUiState` does;
 * - when the session ends: the auto backup (Android), the review notifications, and in server mode the
 *   upload queue is sent (the app's `sessionHooks` queue the reports).
 *
 * One runtime per app controller (`sessionRuntime(app)`); it resets when the learner object is replaced
 * (a progress restore drops the session) or the mode changes.
 */
import { closeEnoughMessage, alternativeCandidates, filterAlternatives } from '../../../core/answer/submit';
import { matchingKanjiLookupCharacters } from '../../../core/answer/matchingKanji';
import { QUESTION_TYPE_INFO } from '../../../core/answer/questionType';
import type { AnswerVerdict } from '../../../core/answer/verdict';
import { ankiMode } from '../../../core/anki';
import { voicePreference } from '../../../core/audio';
import type { ContentSubject } from '../../../core/content';
import { computeTimeLine } from '../../../core/dashboard';
import { onSessionFinishing } from '../../../core/levelTest';
import { contentSubject, progressRow, srsSystemOf, type LearnerDb } from '../../../core/progression';
import { JavaRandom } from '../../../core/rng';
import {
  Session,
  closeEnoughAction,
  emptyStoredSession,
  itemFinished,
  levelTestRoundActive,
  sessionSubject,
  settingsOrdering,
  type Question,
  type SessionHooks,
  type SessionKind,
  type SessionState,
  type StoredSession,
} from '../../../core/session';
import { shakeOnMatchingKanji, type Preferences } from '../../../core/settings';
import {
  autoPlay,
  enableAlternativesToast,
  enableSrsToast,
  infoDump,
  infoDumpNextStage,
  specialButtonBehavior,
  type SubjectInfoDump,
} from '../../../core/settings/sessionUi';
import type { AppController } from '../../../app/appController';
import { rescheduleReviewNotifications } from '../../../platform/reviewNotifications';
import { runAutoBackup } from '../../../progress/backup';
import { NO_META, loadSession, saveSession, type SessionMeta } from './sessionStorage';

/** A short message over the quiz (Java toasts). */
export interface SessionToast {
  id: number;
  kind: 'srs-up' | 'srs-down' | 'close' | 'alternatives' | 'info';
  text: string;
}

/** `FloatingUiState`: what the screens show around the session's own state. */
export interface FloatingState {
  /** The verdict of the last submit (also for a retry, which leaves the question unanswered). */
  lastVerdict: AnswerVerdict | null;
  /** Increases on every retry verdict: the answer field shakes. */
  retryCount: number;
  /** The close-enough text under the answer (lightning off or lingering). */
  closeMessage: string | null;
  /** The info dump stage of the answered question (null: the setting's starting stage). */
  dumpStage: SubjectInfoDump | null;
  /** Anki mode: the answer is revealed. */
  ankiShowingAnswer: boolean;
  /** The check mark / X animation already ran for this answer. */
  answerToastPlayed: boolean;
  /** When the last typed answer was wrong (`Session.lastTypedIncorrectAnswer`), for the Next delay. */
  lastTypedIncorrectAnswer: number;
  /** The answer as last submitted or typed (the answered screen shows it). */
  shownAnswer: string;
  toasts: SessionToast[];
}

/**
 * One entry of the full session log's "Events" list (`adapter/sessionlog/EventItem`): newest first, in
 * memory only (cleared when a session starts, loads or ends), as Java's `SessionLogAdapter`.
 */
export interface SessionEvent {
  id: number;
  /** The session item the event is about (null: session-wide). */
  itemId: number | null;
  text: string;
  /** `System.currentTimeMillis()` when it happened. */
  at: number;
}

/** `SessionType.getDescription`. */
function typeDescription(type: string): string {
  return type === 'LESSON' ? 'Lesson' : type === 'REVIEW' ? 'Review' : type === 'SELF_STUDY' ? 'Self-study' : 'None';
}

/** `Question.canUndo`. */
function questionCanUndo(q: Question): boolean {
  return q.item.state !== 'REPORTED' && q.item.state !== 'ABANDONED';
}

/** How the last session ended, for the screen that was showing it. */
export interface FinishedSession {
  type: SessionKind;
  levelTestRound: 0 | 1 | 2;
  abandoned: boolean;
}

export interface SessionSnapshot {
  /** Bumps on every change. */
  version: number;
  /** The stored session has been read and loaded. */
  loaded: boolean;
  /** The live session (null before loading). */
  session: Session | null;
  /**
   * The session's state when this snapshot was taken. The live session changes in place during a write,
   * before the snapshot that reports it: a screen that sees `session.state` differ from this is in the
   * middle of a change (e.g. Finish), not in a state of its own.
   */
  state: SessionState;
  floating: FloatingState;
  meta: SessionMeta;
  /** Set when a session ended in this app run (cleared when a new one starts). */
  finished: FinishedSession | null;
  /** The last action failed (shown by the screens). */
  error: string | null;
}

export interface SessionRuntimeDeps {
  /** Seed for the session's shared random (`ObjectSupport`); default random. */
  seed?: () => number;
  /** The inflection picks' `Math.random()`. */
  random?: () => number;
}

function freshFloating(): FloatingState {
  return {
    lastVerdict: null, retryCount: 0, closeMessage: null, dumpStage: null, ankiShowingAnswer: false,
    answerToastPlayed: false, lastTypedIncorrectAnswer: 0, shownAnswer: '', toasts: [],
  };
}

/** `SubjectDao.getKanjiByCharacters` over the learner's visible subjects. */
function kanjiByCharacters(db: LearnerDb, characters: string): ContentSubject | null {
  for (const s of db.content.subjects) {
    if (s.object === 'kanji' && s.characters === characters && db.table.get(s.id)?.hiddenAt === 0) return s;
  }
  return null;
}

let toastSeq = 0;
let eventSeq = 0;

export class SessionRuntime {
  private stored: StoredSession = emptyStoredSession();
  private meta: SessionMeta = NO_META;
  private session: Session | null = null;
  private learner: LearnerDb | null = null;
  private mode: 'local' | 'server' = 'local';
  private loading: Promise<Session> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot;
  private floating: FloatingState = freshFloating();
  private finished: FinishedSession | null = null;
  private error: string | null = null;
  private now: number;
  private lastQuestion: Question | null = null;
  private audioPlayed = false;
  private eventList: SessionEvent[] = [];
  private unsubscribe: () => void;

  constructor(readonly app: AppController, private readonly deps: SessionRuntimeDeps = {}) {
    this.now = app.clock.now();
    this.snapshot = this.makeSnapshot(0);
    this.unsubscribe = app.subscribe(() => {
      const s = app.get();
      if (this.learner !== null && (s.learner !== this.learner || s.mode !== this.mode)) this.reset();
    });
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }

  // --- store ---------------------------------------------------------------------------------

  get = (): SessionSnapshot => this.snapshot;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  private makeSnapshot(version: number): SessionSnapshot {
    return {
      version, loaded: this.session !== null && this.loading !== null, session: this.session, state: this.session?.state ?? 'INACTIVE',
      floating: { ...this.floating, toasts: [...this.floating.toasts] }, meta: this.meta, finished: this.finished,
      error: this.error,
    };
  }

  private emit(): void {
    this.snapshot = this.makeSnapshot(this.snapshot.version + 1);
    for (const l of this.listeners) l();
  }

  private reset(): void {
    this.session?.reset();
    this.session = null;
    this.loading = null;
    this.learner = null;
    this.stored = emptyStoredSession();
    this.meta = NO_META;
    this.floating = freshFloating();
    this.lastQuestion = null;
    this.eventList = [];
    this.emit();
    void this.ready().catch(() => undefined);
  }

  // --- loading ---------------------------------------------------------------------------------

  /** The loaded session (reads the stored one first). */
  ready(): Promise<Session> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<Session> {
    const app = this.app;
    const learner = app.requireLearner();
    this.learner = learner;
    this.mode = app.get().mode;
    const { stored, meta } = await loadSession(app.db);
    this.stored = stored;
    this.meta = meta;
    const session = this.newSession(learner);
    this.session = session;
    await this.write(session, (s) => {
      s.load();
      this.eventList = [];
      if (s.state !== 'INACTIVE') this.addEvent(null, `${typeDescription(s.type)} session re-loaded on app startup`);
    });
    return session;
  }

  private newSession(learner: LearnerDb): Session {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const rt = this;
    const seed = this.deps.seed?.() ?? Math.floor(Math.random() * 2 ** 47);
    const random = this.deps.random ?? Math.random;
    const localMode = this.mode !== 'server';
    const base: SessionHooks = {
      levelTestRoundActive,
      onSessionFinishing: (db, type, items) => {
        onSessionFinishing(db, type, items.map((i) => ({
          id: i.id,
          hasIncorrectAnswers: i.incorrect.some((n) => n > 0),
          abandoned: i.state === 'ABANDONED',
          finished: itemFinished(i),
        })), localMode);
      },
    };
    return new Session({
      db: learner,
      get prefs(): Preferences {
        return rt.app.get().prefs;
      },
      get now(): number {
        return rt.now;
      },
      rng: new JavaRandom(seed),
      inflectionRng: { nextDouble: random },
      get stored(): StoredSession {
        return rt.stored;
      },
      ordering: settingsOrdering,
      jobs: [],
      // Server mode: `report` predicts locally and queues the upload (the app sends it after the write).
      hooks: this.app.sessionHooks(base),
    });
  }

  // --- the write path ----------------------------------------------------------------------------

  /** Runs `fn` on the session inside `app.write`, then settles, saves and notifies. Serialized. */
  private write<R>(session: Session, fn: (s: Session) => R): Promise<R> {
    const task = async (): Promise<R> => {
      const wasActive = session.state !== 'INACTIVE';
      let result: R;
      try {
        result = await this.app.write((_learner, now) => {
          this.now = now;
          const r = fn(session);
          this.settle(session);
          return r;
        });
        this.error = null;
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
        this.emit();
        throw e;
      }
      await saveSession(this.app.db, this.stored, this.meta);
      const ended = wasActive && session.state === 'INACTIVE' && session === this.session;
      // The screens move on first (the summary's Finish goes straight to the dashboard); the backup and
      // the notifications follow before the next action runs.
      this.emit();
      if (ended) await this.afterSession();
      return result;
    };
    const p = this.queue.then(task, task);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Runs an action on the loaded session. */
  private async act<R>(fn: (s: Session) => R): Promise<R> {
    const session = await this.ready();
    return this.write(session, fn);
  }

  /** `SessionActivity.updateFragment`: choose the question, auto-advance a correct answer in lightning mode. */
  private settle(s: Session): void {
    for (let guard = 0; guard < 10_000; guard++) {
      s.chooseQuestion();
      this.trackQuestion(s);
      if (s.state === 'INACTIVE' || s.currentQuestion === null) break;
      const lightning = s.isLightningModeActive();
      const advanceNow = s.lightningAdvancesNow(lightning);
      if (s.answered && s.correct) {
        this.playAnswerAudio(s);
        if (advanceNow) {
          s.advance();
          continue;
        }
      }
      if (lightning && !s.lingerOnAnswer && this.floating.closeMessage !== null) {
        // Lightning mode: the close-enough text is a toast, not a message on the answered screen.
        this.toast('close', this.floating.closeMessage);
        this.floating.closeMessage = null;
      }
      break;
    }
  }

  /** A new question resets the per-question floating state (`Session.chooseQuestion` & co.). */
  private trackQuestion(s: Session): void {
    const q = s.currentQuestion;
    if (q === this.lastQuestion) return;
    this.lastQuestion = q;
    this.audioPlayed = false;
    this.floating.dumpStage = null;
    this.floating.ankiShowingAnswer = false;
    this.floating.answerToastPlayed = false;
    if (!s.answered) this.floating.shownAnswer = '';
  }

  private playAnswerAudio(s: Session): void {
    const q = s.currentQuestion;
    const platform = this.app.get().platform;
    if (this.audioPlayed || q === null || platform === null || !platform.capabilities.audioPlayback) return;
    if (!QUESTION_TYPE_INFO[q.type].reading || !autoPlay(this.app.get().prefs, s.type)) return;
    this.audioPlayed = true;
    const anki = ankiMode(this.app.get().prefs, s.type, q.type);
    const matched = anki ? null : s.lastVerdict?.matchedAnswer ?? null;
    void platform.audio.play(q.item.id, voicePreference(this.app.get().prefs), matched).catch(() => false);
  }

  /** Plays the subject's audio once per question (lesson presentation, Anki reveal). */
  playOnce(subjectId: number): void {
    const platform = this.app.get().platform;
    if (this.audioPlayed || platform === null || !platform.capabilities.audioPlayback) return;
    this.audioPlayed = true;
    void platform.audio.play(subjectId, voicePreference(this.app.get().prefs), null).catch(() => false);
  }

  /** After a session (finished or abandoned): auto backup, notifications, uploads. */
  private async afterSession(): Promise<void> {
    const app = this.app;
    const { platform, learner, prefs } = app.get();
    if (platform !== null) {
      await runAutoBackup(platform.files, async () => app.exportProgressFile().text, new Date(this.now)).catch(() => null);
      if (learner !== null) await rescheduleReviewNotifications(platform.notifications, learner, prefs, this.now).catch(() => 0);
    }
    if (this.mode === 'server') void app.flushUploads().catch(() => null);
  }

  // --- the session log's events ----------------------------------------------------------------

  /** The full session log's events, newest first (`SessionLogAdapter.events`). */
  events(): readonly SessionEvent[] {
    return this.eventList;
  }

  private addEvent(itemId: number | null, text: string): void {
    this.eventList = [{ id: ++eventSeq, itemId, text, at: this.app.clock.now() }, ...this.eventList];
  }

  private questionEvent(q: Question | null, text: (shortTitle: string) => string): void {
    if (q !== null) this.addEvent(q.item.id, text(QUESTION_TYPE_INFO[q.type].shortTitle));
  }

  private toast(kind: SessionToast['kind'], text: string): void {
    this.floating.toasts = [...this.floating.toasts, { id: ++toastSeq, kind, text }].slice(-3);
  }

  /** Drops a toast once shown. */
  dismissToast(id: number): void {
    const before = this.floating.toasts.length;
    this.floating.toasts = this.floating.toasts.filter((t) => t.id !== id);
    if (this.floating.toasts.length !== before) this.emit();
  }

  // --- starting --------------------------------------------------------------------------------

  /** The lessons and reviews available now (`LiveTimeLine`). */
  available(): { lessons: number[]; reviews: number[] } {
    const learner = this.app.requireLearner();
    const t = computeTimeLine(learner, this.app.clock.now(), { size: 0 });
    return { lessons: t.availableLessons, reviews: t.availableReviews };
  }

  /**
   * `Session.startNew*Session` with the given subjects (Java throws for none: false here). Starting while a session
   * runs does nothing (false).
   */
  async start(type: SessionKind, ids: readonly number[], options: { levelTestRound?: 0 | 1 | 2 } = {}): Promise<boolean> {
    const session = await this.ready();
    if (session.state !== 'INACTIVE' || ids.length === 0) return false;
    this.finished = null;
    this.floating = freshFloating();
    await this.write(session, (s) => {
      const learner = this.app.requireLearner();
      this.meta = { startedAt: this.now, startLevel: learner.progress.userLevel, levelTestRound: options.levelTestRound ?? 0 };
      s.start(type, ids.map((id) => sessionSubject(learner, id)));
      this.eventList = [];
      this.addEvent(null, `${typeDescription(type)} session started`);
    });
    return true;
  }

  /** Starts a lesson session with every available lesson (the session trims it to the batch size). */
  async startLessons(): Promise<boolean> {
    await this.ready();
    return this.start('LESSON', this.available().lessons);
  }

  async startReviews(): Promise<boolean> {
    await this.ready();
    return this.start('REVIEW', this.available().reviews);
  }

  // --- answering ---------------------------------------------------------------------------------

  /** The field's text (`FloatingUiState.setCurrentAnswer`); no save. */
  setAnswer(text: string): void {
    if (this.session !== null && !this.session.answered) this.session.currentAnswer = text;
  }

  /** `UnansweredSessionFragment`'s Submit / Enter: `Session.submit` with the matching kanji. */
  submit(text: string): Promise<AnswerVerdict | null> {
    return this.act((s) => {
      if (s.answered || s.currentQuestion === null) return null;
      s.currentAnswer = text;
      const q = s.currentQuestion;
      const learner = this.app.requireLearner();
      const subject = contentSubject(learner, q.item.id);
      const lookup = matchingKanjiLookupCharacters(subject, shakeOnMatchingKanji(this.app.get().prefs));
      const matching = lookup === null ? null : kanjiByCharacters(learner, lookup);
      const stageBefore = q.item.srsStageId;
      const verdict = s.submit(matching);
      // `addEventSubmitTypedAnswer`: not for a retry.
      if (!verdict.retry) this.questionEvent(q, (t) => `Submit ${t}: ${s.currentAnswer}\n${verdict.ok ? 'Correct' : 'Incorrect'}`);
      this.floating.lastVerdict = verdict;
      this.floating.shownAnswer = s.currentAnswer;
      if (verdict.retry) {
        this.floating.retryCount++;
        return verdict;
      }
      if (!s.answered) return verdict;
      this.floating.answerToastPlayed = false;
      if (verdict.ok) {
        this.afterCorrect(s, q, stageBefore, verdict, subject);
      } else {
        this.floating.closeMessage = null;
        this.floating.lastTypedIncorrectAnswer = Date.now();
      }
      return verdict;
    });
  }

  /** The SRS toast, close-enough and alternatives after a correct answer (`Session.submit`). */
  private afterCorrect(s: Session, q: Question, stageBefore: number, verdict: AnswerVerdict | null, subject: ContentSubject): void {
    const prefs = this.app.get().prefs;
    const learner = this.app.requireLearner();
    if (itemFinished(q.item) && s.type === 'REVIEW' && enableSrsToast(prefs)) {
      const system = srsSystemOf(learner, q.item.id);
      const old = system.getStage(stageBefore);
      const next = old.getNewStage(q.item.incorrect.reduce((a, b) => a + b, 0));
      if (next.id !== old.id) {
        const up = next.compareTo(old) > 0;
        this.toast(up ? 'srs-up' : 'srs-down', next.name);
      }
    }
    if (verdict === null) return;
    this.floating.closeMessage = verdict.nearMatch && closeEnoughActionShowsToast(prefs) ? closeEnoughMessage(verdict) : null;
    if (enableAlternativesToast(prefs)) {
      try {
        const alternatives = alternativeCandidates(q.type, subject);
        if (alternatives !== null) {
          const filtered = filterAlternatives(alternatives, s.currentAnswer, verdict);
          if (filtered.length > 0) this.toast('alternatives', `Alt: ${filtered.join(', ')}`);
        }
      } catch {
        // `safe` in Java
      }
    }
  }

  /** Don't know (`Session.submitDontKnow`). */
  dontKnow(): Promise<void> {
    return this.act((s) => {
      if (!s.answered && s.currentQuestion !== null) this.questionEvent(s.currentQuestion, (t) => `Submit: ${t}\n'"Don't know" incorrect`);
      s.submitDontKnow();
      this.floating.lastVerdict = null;
      this.floating.shownAnswer = '';
      this.floating.closeMessage = null;
    });
  }

  /** Next (`Session.advance`). */
  next(): Promise<void> {
    return this.act((s) => s.advance());
  }

  /** Anki mode: Show answer. */
  ankiReveal(): void {
    if (this.session === null || this.floating.ankiShowingAnswer) return;
    this.floating.ankiShowingAnswer = true;
    this.emit();
  }

  ankiGrade(correct: boolean): Promise<void> {
    return this.act((s) => {
      const q = s.currentQuestion;
      if (q === null || s.answered) return;
      const stageBefore = q.item.srsStageId;
      this.floating.ankiShowingAnswer = false;
      this.questionEvent(q, (t) => `Submit: ${t}\nAnki ${correct ? 'correct' : 'incorrect'}`);
      if (correct) {
        s.submitAnkiCorrect();
        this.afterCorrect(s, q, stageBefore, null, contentSubject(this.app.requireLearner(), q.item.id));
      } else {
        s.submitAnkiIncorrect();
      }
    });
  }

  /** `SpecialButtonBehavior.perform` for special button 1, 2 or 3. */
  special(button: 1 | 2 | 3): Promise<void> {
    const behavior = specialButtonBehavior(this.app.get().prefs, button);
    return this.act((s) => {
      switch (behavior) {
        case 'UNDO_AND_MARK_CORRECT': {
          if (!(s.canUndo() && s.answered && !s.correct)) return;
          const q = s.currentQuestion;
          const stageBefore = q?.item.srsStageId ?? 0;
          s.ignore();
          this.questionEvent(s.currentQuestion, (t) => `Ignore and mark correct: ${t}`);
          if (q !== null) this.afterCorrect(s, q, stageBefore, null, contentSubject(this.app.requireLearner(), q.item.id));
          break;
        }
        case 'UNDO_AND_RETRY_NOW':
          if (s.canUndo()) {
            s.undoAndRetry();
            this.questionEvent(s.currentQuestion, (t) => `Undo and retry immediately: ${t}`);
          }
          break;
        case 'UNDO_AND_PUT_BACK':
          if (s.canUndo()) {
            const cur = s.currentQuestion;
            const target = cur !== null && s.answered && questionCanUndo(cur) ? cur : s.history[0] ?? null;
            s.undoAndPutBack();
            this.questionEvent(target, (t) => `Undo and put back: ${t}`);
          }
          break;
        case 'SKIP':
          if (s.isActive() && !s.answered) {
            this.questionEvent(s.currentQuestion, (t) => `Skip: ${t}`);
            s.skip();
          }
          break;
        case 'TOGGLE_LIGHTNING_MODE':
          if (s.isActive()) s.toggleLightningMode();
          break;
        case 'DISABLE':
          break;
      }
      this.floating.lastVerdict = s.answered ? this.floating.lastVerdict : null;
      if (!s.answered) this.floating.shownAnswer = '';
    });
  }

  /** The info dump's reveal button (`SubjectInfoHeadlineView`): one stage further. */
  revealMore(): void {
    const s = this.session;
    if (s === null || s.currentQuestion === null) return;
    const current = this.floating.dumpStage ?? infoDump(this.app.get().prefs, s.currentQuestion.type, s.correct);
    this.floating.dumpStage = infoDumpNextStage(current);
    this.emit();
  }

  /** The lesson presentation's reveal button. */
  setDumpStage(stage: SubjectInfoDump | null): void {
    this.floating.dumpStage = stage;
    this.emit();
  }

  // --- lesson presentation -----------------------------------------------------------------------

  presentationNext(): Promise<void> {
    return this.act((s) => {
      if (s.state !== 'IN_LESSON_PRESENTATION' || s.currentItem === null) return;
      if (s.items.indexOf(s.currentItem) === s.items.length - 1) {
        s.startQuiz();
        this.addEvent(null, 'Started lesson quiz');
      } else {
        s.moveToNextLessonItem();
      }
    });
  }

  presentationPrevious(): Promise<void> {
    return this.act((s) => s.moveToPreviousLessonItem());
  }

  backToPresentation(): Promise<void> {
    return this.act((s) => {
      const before = s.state;
      s.goBackToPresentation();
      if (before !== 'IN_LESSON_PRESENTATION' && s.state === 'IN_LESSON_PRESENTATION') this.addEvent(null, 'Jumped back to lesson presentation');
    });
  }

  // --- ending ----------------------------------------------------------------------------------

  wrapUp(): Promise<void> {
    // The "Session wrapping up..." toast is the menu's (an Android toast, `AbstractActivity`).
    return this.act((s) => s.wrapup());
  }

  /** Abandon (`Session.finish` from the menu). */
  abandon(): Promise<void> {
    return this.act((s) => {
      if (s.state === 'INACTIVE') return;
      this.finished = { type: s.type as SessionKind, levelTestRound: this.meta.levelTestRound, abandoned: true };
      s.finish();
      this.eventList = [];
      this.meta = NO_META;
    });
  }

  /** The summary's Finish: report the pending items (delayed results), then `Session.finish`. */
  finish(): Promise<void> {
    return this.act((s) => {
      if (s.state === 'INACTIVE') return;
      this.finished = { type: s.type as SessionKind, levelTestRound: this.meta.levelTestRound, abandoned: false };
      if (s.isDelayed()) s.reportPending();
      s.finish();
      this.eventList = [];
      this.meta = NO_META;
    });
  }

  /** Clears `finished` once the screen has acted on it. */
  clearFinished(): void {
    if (this.finished === null) return;
    this.finished = null;
    this.emit();
  }

  /** The subject progress row (for the item info). */
  progressOf(id: number): ReturnType<typeof progressRow> {
    return progressRow(this.app.requireLearner(), id);
  }
}

/** `CloseEnoughAction.isShowToast`. */
function closeEnoughActionShowsToast(prefs: Preferences): boolean {
  const a = closeEnoughAction(prefs);
  return a === 'ACCEPT_WITH_TOAST' || a === 'ACCEPT_WITH_TOAST_NO_LM';
}

const runtimes = new WeakMap<AppController, SessionRuntime>();

/** The app's session runtime (created on first use). */
export function sessionRuntime(app: AppController, deps?: SessionRuntimeDeps): SessionRuntime {
  let rt = runtimes.get(app);
  if (rt === undefined) {
    rt = new SessionRuntime(app, deps);
    runtimes.set(app, rt);
  }
  return rt;
}

/** Replaces the app's runtime (tests: a fresh one with deps). */
export function setSessionRuntime(app: AppController, rt: SessionRuntime): void {
  runtimes.get(app)?.dispose();
  runtimes.set(app, rt);
}
