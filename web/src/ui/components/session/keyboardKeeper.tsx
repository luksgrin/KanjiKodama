/**
 * Keeps the on-screen keyboard open from one question to the next, as the Java app does
 * (`showSoftInput` on every new unanswered question).
 *
 * Browsers only open the keyboard for a focus that happens during a tap (iOS) and close it when the
 * focused field goes away. A new question is a new answer field that appears after the tap's async work,
 * so the tap focuses this invisible field first (`holdKeyboard`), and the new answer field takes the focus
 * from it when it mounts: the keyboard stays. When the next screen has no answer field (Anki mode, the
 * summary, the lesson presentation) the session screen lets go (`releaseKeyboard`).
 */
import { useEffect } from 'react';

let keeper: HTMLInputElement | null = null;

export function KeyboardKeeper() {
  return (
    <input
      ref={(el) => { keeper = el; }}
      className="kk-keyboard-keeper"
      type="text"
      tabIndex={-1}
      aria-hidden="true"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      data-testid="keyboard-keeper"
    />
  );
}

/** Call in a tap / key handler that leads to a new question. */
export function holdKeyboard(): void {
  if (keeper !== null && keeper.isConnected) keeper.focus({ preventScroll: true });
}

/** Called after a render: drops the focus from the keeper when no answer field took it. */
export function releaseKeyboard(): void {
  if (keeper === null || document.activeElement !== keeper) return;
  const field = document.querySelector<HTMLInputElement>('input.kk-answer:not([readonly])');
  if (field !== null) field.focus({ preventScroll: true });
  else keeper.blur();
}

/** What a tap may focus or act on: these keep the browser's behaviour. */
const INTERACTIVE = 'input, textarea, select, button, a[href], label, summary, [contenteditable]:not([contenteditable="false"]), '
  + '[tabindex]:not([tabindex="-1"]), [role="button"], [role="menu"], [role="menuitem"], [role="option"], [role="slider"], '
  + 'dialog, [role="dialog"], [role="alertdialog"]';

/** The focused element is the quiz's answer field (or the keeper holding the keyboard for it). */
function answerFieldFocused(): boolean {
  const a = document.activeElement;
  return a instanceof HTMLInputElement && !a.readOnly && (a.classList.contains('kk-answer') || a === keeper);
}

/**
 * The mousedown handler of `useKeepAnswerFocus`: a press on a part of the screen that does nothing with
 * the focus (the question, the banner, the empty space, the toolbar's title) doesn't take it from the
 * answer field, so the keyboard stays. Buttons, links, fields, menus and dialogs work as usual. Only the
 * (compatibility) mousedown is cancelled, whose default moves the focus in every engine: cancelling a
 * touch's pointerdown would also drop its click in WebKit (iOS), e.g. the question's font toggle.
 */
export function keepAnswerFocus(e: Pick<MouseEvent, 'button' | 'target' | 'preventDefault'>, dialogOpen: boolean): boolean {
  if (e.button !== 0 || dialogOpen || !answerFieldFocused()) return false;
  const t = e.target;
  if (!(t instanceof Element) || t.closest(INTERACTIVE) !== null) return false;
  e.preventDefault();
  return true;
}

/**
 * While the unanswered question shows (`active`), taps outside the interactive elements leave the
 * keyboard open (an owner's request: Java hides it). Answered screens, the item info and the lesson
 * presentation keep the browser's behaviour (the keyboard may hide).
 */
export function useKeepAnswerFocus(active: boolean, dialogOpen: () => boolean): void {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => { keepAnswerFocus(e, dialogOpen()); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [active, dialogOpen]);
}
