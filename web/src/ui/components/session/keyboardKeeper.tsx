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
