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
  return isAnswerField(document.activeElement);
}

function isAnswerField(a: EventTarget | null): a is HTMLInputElement {
  return a instanceof HTMLInputElement && !a.readOnly && (a.classList.contains('kk-answer') || a === keeper);
}

/** A press on `target` leaves the focus in the answer field: nothing interactive there, no session dialog. */
function keepsFocus(target: EventTarget | null, dialogOpen: boolean): boolean {
  if (dialogOpen || !answerFieldFocused()) return false;
  return target instanceof Element && target.closest(INTERACTIVE) === null;
}

/**
 * The mousedown handler of `useKeepAnswerFocus`: a press on a part of the screen that does nothing with
 * the focus (the question, the banner, the empty space, the toolbar's title) doesn't take it from the
 * answer field, so the keyboard stays. Buttons, links, fields, menus and dialogs work as usual. The
 * (compatibility) mousedown's default moves the focus in every engine (a tap, a mouse click).
 */
export function keepAnswerFocus(e: Pick<MouseEvent, 'button' | 'target' | 'preventDefault'>, dialogOpen: boolean): boolean {
  if (e.button !== 0 || !keepsFocus(e.target, dialogOpen)) return false;
  e.preventDefault();
  return true;
}

/**
 * Chromium and Gecko (Android): a touch's pointerdown is cancelled too. A long press moves the focus
 * without any mousedown the page could cancel: Chromium's long press (from Android's long-press timeout,
 * 400 ms, shorter on some phones) focuses the pressed point's focusable ancestor, the body here
 * (`GestureManager::SendContextMenuEventForGesture` → `MouseEventManager::HandleMouseFocus`), and the
 * WebView hides the keyboard. A cancelled pointerdown suppresses the touch's mouse events and that focus
 * change, for taps and long presses alike; its click still fires (the question's font toggle) and a long
 * press still selects text. Not in WebKit (iOS), where a cancelled pointerdown also drops the click.
 */
export function keepAnswerFocusOnTouch(
  e: Pick<PointerEvent, 'pointerType' | 'isPrimary' | 'button' | 'target' | 'preventDefault'>,
  dialogOpen: boolean,
  engineKeepsClick: boolean = touchPointerDownCancellable(),
): boolean {
  if (!engineKeepsClick || e.pointerType !== 'touch' || !e.isPrimary || e.button !== 0) return false;
  if (!keepsFocus(e.target, dialogOpen)) return false;
  e.preventDefault();
  return true;
}

/** Cancelling a touch's pointerdown keeps its click: Chromium and Gecko, i.e. Android (not WebKit). */
export function touchPointerDownCancellable(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Android/i.test(ua);
}

/**
 * The last resort, for any path that still takes the focus (another engine, a future WebView): when the
 * answer field loses the focus to nothing during a press beside it, it takes it back at once, inside the
 * same input event, before the keyboard's state is sent to the system (and a focus during a user gesture
 * shows the keyboard again in every engine). Not when a text selection took it, when a session dialog is open, or when the window lost the
 * focus.
 */
export function restoreAnswerFocus(e: Pick<FocusEvent, 'target' | 'relatedTarget'>, pressing: boolean, dialogOpen: boolean): boolean {
  const field = e.target;
  if (!pressing || dialogOpen || e.relatedTarget !== null || !isAnswerField(field) || !field.isConnected) return false;
  if (!document.hasFocus()) return false;
  const sel = document.getSelection();
  if (sel !== null && sel.type === 'Range' && !(sel.anchorNode?.contains(field) ?? false)) return false;
  field.focus({ preventScroll: true });
  return document.activeElement === field;
}

/**
 * A long press starts a selection: Chromium puts a caret in the pressed block (`selectstart`, then
 * `selectionchange`) while the DOM focus stays in the answer field, or selects the pressed word and the
 * focus goes. Either way the focused field no longer holds the selection, the page reports no text input
 * and the WebView hides the keyboard. Nothing on the unanswered question is selectable (owner's request;
 * Java's banner, counter and title aren't either, and its question view is a long-clickable view with the
 * title action mode), so a selection starting outside the fields is cancelled; `:root.kk-keep-answer`
 * (session.css) also makes the screen `user-select: none` but the fields.
 */
export function keepAnswerSelection(e: Pick<Event, 'target' | 'preventDefault'>, dialogOpen: boolean): boolean {
  const t = e.target;
  const el = t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
  if (!keepsFocus(el, dialogOpen)) return false;
  e.preventDefault();
  return true;
}

/**
 * The selection left the focused answer field for a non-editable place (any path the cancelled events
 * above miss): it is put back into the field, and the keyboard asked for again (a focus during the
 * press shows it in every engine), as the WebView may already have hidden it.
 */
export function restoreAnswerSelection(dialogOpen: boolean, refocus: (field: HTMLInputElement) => void): boolean {
  const field = document.activeElement;
  if (dialogOpen || !isAnswerField(field)) return false;
  const sel = document.getSelection();
  if (sel === null || sel.rangeCount === 0 || sel.anchorNode === null || sel.anchorNode.contains(field)) return false;
  if (sel.type === 'Range') return false; // a text selection the user made
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  field.setSelectionRange(start, end);
  refocus(field);
  return true;
}

/** How long after the finger lifts a press may still move the focus (a tap's mouse events follow it). */
const PRESS_TAIL_MS = 600;

/**
 * While the unanswered question shows (`active`), taps and long presses outside the interactive elements
 * (and nothing selects there) leave the keyboard open (an owner's request: Java hides it). Answered screens, the item info and the
 * lesson presentation keep the browser's behaviour (the keyboard may hide).
 */
export function useKeepAnswerFocus(active: boolean, dialogOpen: () => boolean): void {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.classList.add('kk-keep-answer');
    // A primary press beside the field: from its pointerdown until a little after it ends.
    let pressFrom = -1;
    let pressUntil = -1;
    const now = () => performance.now();
    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      const keep = keepsFocus(e.target, dialogOpen());
      pressFrom = keep ? now() : -1;
      pressUntil = keep ? Infinity : -1;
      if (keep) keepAnswerFocusOnTouch(e, false);
    };
    const onPointerEnd = (e: PointerEvent) => {
      if (e.isPrimary && pressFrom >= 0) pressUntil = now() + PRESS_TAIL_MS;
    };
    const onMouseDown = (e: MouseEvent) => { keepAnswerFocus(e, dialogOpen()); };
    const pressing = () => pressFrom >= 0 && now() <= pressUntil;
    let refocusing = false;
    const onFocusOut = (e: FocusEvent) => {
      if (!refocusing) restoreAnswerFocus(e, pressing(), dialogOpen());
    };
    const onSelectStart = (e: Event) => { keepAnswerSelection(e, dialogOpen()); };
    const onSelectionChange = () => {
      if (!pressing()) return;
      restoreAnswerSelection(dialogOpen(), (field) => {
        refocusing = true;
        try {
          field.blur();
          field.focus({ preventScroll: true });
        } finally {
          refocusing = false;
        }
      });
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerEnd, true);
    document.addEventListener('pointercancel', onPointerEnd, true);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('selectstart', onSelectStart, true);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      root.classList.remove('kk-keep-answer');
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerEnd, true);
      document.removeEventListener('pointercancel', onPointerEnd, true);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('selectstart', onSelectStart, true);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [active, dialogOpen]);
}
