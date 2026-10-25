/**
 * The Java session and level test dialogs (`AlertDialog.Builder` with up to three buttons): optional
 * warning icon (`setIcon(R.drawable.ic_baseline_warning_24px)`) and the title in the body font, the
 * message (`\n` breaks lines), and flat text buttons in one row, neutral at the left, then negative and
 * positive at the right ("YES AND DON'T ASK AGAIN · NO · YES"). Native `<dialog>` (the Android bars are
 * dimmed like Java's scrim); Escape and the back gesture press the negative button.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useBackHandler } from '../../hooks/useRoute';
import './session.css';

export interface SessionDialogProps {
  open: boolean;
  /** Empty or absent: no title (`setTitle(null)`). */
  title?: string;
  message: string;
  /** The warning icon before the title (Java's abandon / wrap-up / star rating confirmations). */
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
  /** No buttons at all (Java's non-cancelable "Picking kanji…" box); back does nothing. */
  noButtons?: boolean;
  /** Extra content under the message. */
  children?: ReactNode;
  testId?: string;
}

export function SessionDialog({
  open, title, message, warning = false, noLabel, neutralLabel = "Yes and don't ask again", yesLabel = 'Yes', onNo, onYesDontAsk, onYes,
  busy = false, noButtons = false, children, testId,
}: SessionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const before = useRef<Element | null>(null);
  useBackHandler(() => { if (!busy && !noButtons) onNo(); return true; }, open);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      before.current = document.activeElement;
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
      // Like Java, no button looks focused when the dialog opens.
      d.focus({ preventScroll: true });
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
      // Back to the answer field (Java's dialog leaves the keyboard and the field's focus alone).
      const el = before.current;
      before.current = null;
      if (el instanceof HTMLElement && el.isConnected) el.focus({ preventScroll: true });
    }
  }, [open]);
  return (
    <dialog ref={ref} tabIndex={-1} className="kk-dialog kk-sdialog" aria-labelledby={title ? titleId : undefined} data-testid={testId}
      onCancel={(e) => { e.preventDefault(); if (!busy && !noButtons) onNo(); }}>
      {open && (
        <>
          {title !== undefined && title !== '' && <h2 id={titleId} className="kk-sdialog-title">
            {warning && (
              <svg className="kk-sdialog-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
            )}
            <span>{title}</span>
          </h2>}
          <div className="kk-dialog-body kk-sdialog-message kk-pre-line">{message}</div>
          {children}
          {!noButtons && <div className="kk-sdialog-buttons">
            {onYesDontAsk && <button type="button" className="kk-sdialog-btn neutral" disabled={busy} onClick={onYesDontAsk}>{neutralLabel}</button>}
            <span className="kk-sdialog-spacer" />
            <button type="button" className="kk-sdialog-btn negative" disabled={busy} onClick={onNo}>{noLabel ?? (onYes ? 'No' : 'OK')}</button>
            {onYes && <button type="button" className="kk-sdialog-btn positive" disabled={busy} onClick={onYes}>{yesLabel}</button>}
          </div>}
        </>
      )}
    </dialog>
  );
}
