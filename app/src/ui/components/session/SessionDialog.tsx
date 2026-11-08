/**
 * The session and level test dialogs (up to three buttons): an optional warning icon and the title in
 * the body font, the
 * message (`\n` breaks lines), and flat text buttons in one row, neutral at the left, then negative and
 * positive at the right ("YES AND DON'T ASK AGAIN · NO · YES").
 *
 * It leaves the keyboard and the answer field alone: an overlay (scrim +
 * `role="alertdialog"`), not a modal `<dialog>` (`showModal` makes the page inert, which takes the focus
 * out of the answer field and closes the keyboard). While it is open:
 * - the focus stays where it was when that is a text field (the quiz's answer field, keyboard open);
 *   otherwise the dialog itself takes the focus and gives it back on close;
 * - tapping a button doesn't move the focus (pointerdown is cancelled), so the keyboard stays;
 * - the page behind gets no taps (the scrim), no typing and no Enter (the field doesn't submit);
 * - Tab moves into the dialog and cycles through its buttons; Escape, the back gesture and a tap on the
 *   scrim press the negative button (cancel), except while busy or without buttons;
 * - the title and message are announced (`aria-live`), the dialog is labelled by its title.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackHandler } from '../../hooks/useRoute';
import './session.css';

export interface SessionDialogProps {
  open: boolean;
  /** Empty or absent: no title (`setTitle(null)`). */
  title?: string;
  message: string;
  /** The warning icon before the title (the abandon / wrap-up / star rating confirmations). */
  warning?: boolean;
  noLabel?: string;
  /** The neutral button; hidden when `onYesDontAsk` is absent. */
  neutralLabel?: string;
  yesLabel?: string;
  onNo(): void;
  onYesDontAsk?(): void;
  /** Absent: a message box with only the negative button (labelled `noLabel`, default OK). */
  onYes?(): void;
  /** Disables the buttons (work in progress). */
  busy?: boolean;
  /** No buttons at all (the non-cancelable "Picking kanji…" box); back does nothing. */
  noButtons?: boolean;
  /** Extra content under the message. */
  children?: ReactNode;
  testId?: string;
}

let openCount = 0;
const dialogListeners = new Set<() => void>();

/** A session dialog is open (the answer field doesn't submit meanwhile). */
export function sessionDialogOpen(): boolean {
  return openCount > 0;
}

/** Called after a session dialog opens or closes (the native keep-keyboard mode). */
export function subscribeSessionDialogs(listener: () => void): () => void {
  dialogListeners.add(listener);
  return () => { dialogListeners.delete(listener); };
}

function dialogsChanged(): void {
  for (const l of dialogListeners) l();
}

/** A text field that keeps the keyboard open (the answer field). */
function isTextField(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el.readOnly || el.disabled) return false;
  return !(el instanceof HTMLInputElement) || ['text', 'search', ''].includes(el.type);
}

export function SessionDialog({
  open, title, message, warning = false, noLabel, neutralLabel = "Yes and don't ask again", yesLabel = 'Yes', onNo, onYesDontAsk, onYes,
  busy = false, noButtons = false, children, testId,
}: SessionDialogProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();
  const before = useRef<Element | null>(null);
  const cancel = useRef<() => void>(() => undefined);
  cancel.current = () => { if (!busy && !noButtons) onNo(); };
  useBackHandler(() => { cancel.current(); return true; }, open);

  // The overlay goes into the app shell (outside the screen's slide-in transform).
  useLayoutEffect(() => {
    setHost(anchor.current?.closest<HTMLElement>('.kk-shell') ?? anchor.current?.parentElement ?? document.body);
  }, []);

  useLayoutEffect(() => {
    if (!open || host === null) return;
    openCount++;
    dialogsChanged();
    before.current = document.activeElement;
    if (!isTextField(before.current)) ref.current?.focus({ preventScroll: true });
    return () => {
      openCount--;
      const el = before.current;
      before.current = null;
      if (el instanceof HTMLElement && el.isConnected && document.activeElement !== el) el.focus({ preventScroll: true });
      dialogsChanged();
    };
  }, [open, host]);

  // Keys and typing outside the dialog don't reach the page (the dialog has the input focus).
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => t instanceof Node && ref.current?.contains(t) === true;
    const buttons = () => [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const list = buttons();
        if (list.length === 0) { e.preventDefault(); return; }
        const i = list.indexOf(document.activeElement as HTMLButtonElement);
        const next = i < 0 ? (e.shiftKey ? list.length - 1 : 0) : (i + (e.shiftKey ? list.length - 1 : 1)) % list.length;
        e.preventDefault();
        e.stopPropagation();
        list[next]!.focus();
        return;
      }
      if (inside(e.target) || e.key === 'Escape') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onBeforeInput = (e: Event) => {
      if (inside(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('beforeinput', onBeforeInput, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('beforeinput', onBeforeInput, true);
    };
  }, [open]);

  const keepFocus = (e: React.MouseEvent) => {
    // A tap on the dialog doesn't take the focus from the answer field (the keyboard stays open). Only the
    // mousedown: cancelling a touch's pointerdown also drops its click in WebKit (iOS), i.e. Yes / No.
    const t = e.target as Element;
    if (t.closest('input, textarea, select') === null && isTextField(document.activeElement)) e.preventDefault();
  };
  const hasTitle = title !== undefined && title !== '';
  const overlay = open ? (
    <div className="kk-sdialog-layer" onMouseDown={keepFocus}
      onClick={(e) => { if (e.target === e.currentTarget) cancel.current(); }}>
      <div ref={ref} role="alertdialog" aria-modal="false" tabIndex={-1} className="kk-dialog kk-sdialog"
        aria-labelledby={hasTitle ? titleId : undefined} aria-describedby={messageId} data-testid={testId}>
        <div aria-live="assertive" aria-atomic="true">
          {hasTitle && <h2 id={titleId} className="kk-sdialog-title">
            {warning && (
              <svg className="kk-sdialog-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
            )}
            <span>{title}</span>
          </h2>}
          <div id={messageId} className="kk-dialog-body kk-sdialog-message kk-pre-line">{message}</div>
        </div>
        {children}
        {!noButtons && <div className="kk-sdialog-buttons">
          {onYesDontAsk && <button type="button" className="kk-sdialog-btn neutral" disabled={busy} onClick={onYesDontAsk}>{neutralLabel}</button>}
          <span className="kk-sdialog-spacer" />
          <button type="button" className="kk-sdialog-btn negative" disabled={busy} onClick={onNo}>{noLabel ?? (onYes ? 'No' : 'OK')}</button>
          {onYes && <button type="button" className="kk-sdialog-btn positive" disabled={busy} onClick={onYes}>{yesLabel}</button>}
        </div>}
      </div>
    </div>
  ) : null;
  return (
    <>
      <span ref={anchor} hidden />
      {host !== null && overlay !== null ? createPortal(overlay, host) : null}
    </>
  );
}
