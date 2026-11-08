/**
 * Test-side emulation of the session screen around the answer field for `kana/keys-session.json`:
 * the session switching between the unanswered screen (`UnansweredSessionFragment` in the fixture:
 * answer field, Submit and Don't know buttons) and the answered one (`AnsweredSessionFragment`: Next
 * button, focused), with keys routed by focus the way Android does.
 *
 * The session itself is a stub for the fixture's one-item self-study session (kanji 一, seed 1, so the
 * reading question comes first); question choice and the progress text follow the session
 * ("Wrapup: " once every active item is started; finished/live items). The answer check is
 * `core/answer` `submitCheck`.
 */
import type { ContentSubject } from '../../src/core/content';
import type { QuestionType } from '../../src/core/answer';
import { submitCheck } from '../../src/core/answer/submit';
import { FixupWatcher, handleEditorAction } from '../../src/core/kana/answerField';
import { SimClipboard, SimKeyField, type SimKeyEvent } from './textView';

/** A one-item session stub (see the file comment). */
export class StubSession {
  private readonly remaining: QuestionType[];
  current: QuestionType | null;
  answered = false;
  correct = false;
  private started = false;
  private readonly done = new Set<QuestionType>();

  constructor(readonly subject: ContentSubject, order: QuestionType[]) {
    this.remaining = [...order];
    this.current = this.remaining[0] ?? null;
  }

  /** `Session.submit`: the verdict; answered unless it is a retry. */
  submit(answer: string): { ok: boolean; retry: boolean } {
    if (this.current === null || this.answered) return { ok: false, retry: false };
    const s = this.subject;
    const check = submitCheck(this.current, { meanings: s.meanings, auxiliaryMeanings: s.auxiliaryMeanings,
      readings: s.readings, characters: s.characters }, answer,
    { closeEnoughAction: 'ACCEPT_WITH_TOAST', requireOnInKatakana: false, meaningSynonyms: [] });
    const v = check.verdict;
    if (v.retry) return { ok: false, retry: true };
    this.record(v.ok);
    return { ok: v.ok, retry: false };
  }

  /** `Session.submitDontKnow`: answered wrong. */
  dontKnow(): void {
    if (this.current === null || this.answered) return;
    this.record(false);
  }

  private record(ok: boolean): void {
    this.answered = true;
    this.correct = ok;
    this.started = true;
    if (ok && this.current !== null) this.done.add(this.current);
  }

  /** `Session.advance`: the next unfinished question, another one than the last if there is one. */
  advance(): void {
    if (!this.answered || this.current === null) return;
    const last = this.current;
    const open = this.remaining.filter((q) => !this.done.has(q));
    this.current = open.find((q) => q !== last) ?? open[0] ?? null;
    this.answered = false;
  }

  /** `Session.getProgressText` for one active item. */
  progressText(): string {
    const finished = this.remaining.every((q) => this.done.has(q)) ? 1 : 0;
    return `${this.started ? 'Wrapup: ' : ''}${finished}/1`;
  }
}

type Focus = 'questionEdit' | 'nextButton' | null;

export class SimSessionScreen {
  fragment: 'UnansweredSessionFragment' | 'AnsweredSessionFragment' = 'UnansweredSessionFragment';
  field: SimKeyField | null = null;
  /** `questionEdit.getTag()`: the field accepts input. */
  fieldActive = true;
  focus: Focus = 'questionEdit';
  private readonly clipboard = new SimClipboard();
  /** The Next button is pressed (a confirm key went down on it). */
  private nextPressed = false;

  constructor(readonly session: StubSession) {
    this.showUnanswered();
  }

  private isKana(): boolean {
    return this.session.current === 'WANIKANI_KANJI_READING' || this.session.current === 'WANIKANI_VOCAB_READING';
  }

  private showUnanswered(): void {
    this.fragment = 'UnansweredSessionFragment';
    this.fieldActive = true;
    // The field's watcher: active tag and kana question.
    const watcher = new FixupWatcher(() => this.fieldActive, () => this.isKana());
    this.field = new SimKeyField(this.clipboard, (actionId, e) => this.onEditorAction(actionId, e), watcher);
    this.focus = 'questionEdit';
  }

  private showAnswered(): void {
    this.fragment = 'AnsweredSessionFragment';
    this.field = null;
    this.focus = 'nextButton';
    this.nextPressed = false;
  }

  /** The fragment's `handleEditorAction`, wired to the session. */
  private onEditorAction(actionId: number, e: SimKeyEvent | null): boolean {
    const r = handleEditorAction(actionId, e, { active: this.fieldActive, interactionEnabled: true, answered: this.session.answered });
    if (r.submit) this.submit();
    return r.handled;
  }

  /** The fragment's submit: field inactive, `Session.submit`, active again on a retry. */
  private submit(): void {
    if (this.field === null) return;
    this.fieldActive = false;
    const verdict = this.session.submit(this.field.text.toString());
    if (verdict.retry) this.fieldActive = true;
  }

  /** What the screen shows once the main thread is idle (the fragment follows the session state). */
  settle(): void {
    if (this.session.answered && this.fragment === 'UnansweredSessionFragment') this.showAnswered();
    else if (!this.session.answered && this.fragment === 'AnsweredSessionFragment') this.showUnanswered();
  }

  /** A hardware key through `ViewRootImpl` to the focused view. */
  sendKey(e: SimKeyEvent): void {
    if (this.focus === 'questionEdit' && this.field !== null) {
      const handled = this.field.dispatch(e);
      this.deliverImeEnter();
      // ViewRootImpl: an unhandled Escape clears the focus (keyboard navigation).
      if (!handled && e.action === 'down' && e.keyCode === 'ESCAPE') this.focus = null;
      return;
    }
    if (this.focus === 'nextButton') {
      // A Button: View.onKeyDown/onKeyUp confirm keys press and click it; other keys do nothing.
      const confirm = ['DPAD_CENTER', 'ENTER', 'NUMPAD_ENTER', 'SPACE'].includes(e.keyCode)
        && !e.meta.has('shift') && !e.meta.has('ctrl') && !e.meta.has('alt');
      if (!confirm) return;
      if (e.action === 'down' && e.repeat === 0) this.nextPressed = true;
      else if (e.action === 'up' && this.nextPressed) {
        this.nextPressed = false;
        this.click('next');
      }
    }
  }

  /** `performEditorAction` turned into a soft-keyboard Enter (posted to the focused field). */
  private deliverImeEnter(): void {
    const f = this.field;
    if (f === null || !f.pendingImeEnter) return;
    f.pendingImeEnter = false;
    for (const action of ['down', 'up'] as const) f.dispatch({ action, keyCode: 'ENTER', repeat: 0, meta: new Set() });
  }

  performEditorAction(actionId: number): void {
    this.field?.performEditorAction(actionId);
    this.deliverImeEnter();
  }

  /** `InputConnection.sendKeyEvent`: down and up to the focused view. */
  imeSendKey(keyCode: string): void {
    for (const action of ['down', 'up'] as const) this.sendKey({ action, keyCode, repeat: 0, meta: new Set() });
  }

  commitText(text: string): void {
    this.field?.conn.commitText(text, 1);
  }

  click(button: 'submit' | 'next' | 'dontKnow'): void {
    if (button === 'submit') {
      if (this.fragment === 'UnansweredSessionFragment' && this.fieldActive && !this.session.answered) this.submit();
    } else if (button === 'dontKnow') {
      if (this.fragment === 'UnansweredSessionFragment' && !this.session.answered) {
        this.fieldActive = false;
        this.session.dontKnow();
      }
    } else if (this.fragment === 'AnsweredSessionFragment') {
      this.session.advance();
    }
  }

  state(): Record<string, unknown> {
    const s = this.session;
    return {
      fragment: this.fragment,
      current: s.current === null ? null : [s.subject.id, s.current],
      answered: s.answered,
      correct: s.correct,
      field: this.field === null ? null : this.field.text.toString(),
      fieldActive: this.field === null ? null : this.fieldActive,
      focus: this.focus,
      progress: s.progressText(),
    };
  }
}
