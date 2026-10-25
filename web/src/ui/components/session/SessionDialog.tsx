/**
 * An `AlertDialog` with up to three buttons (negative, neutral, positive), as the Java session and level
 * test dialogs use. `ConfirmDialog` has two; this one adds the neutral button. Native `<dialog>`; Escape
 * and the back gesture press the negative button.
 */
import { useEffect, useId, useRef } from 'react';
import { useBackHandler } from '../../hooks/useRoute';

export interface SessionDialogProps {
  open: boolean;
  title: string;
  message: string;
  noLabel?: string;
  /** The neutral button; hidden when `onYesDontAsk` is absent. */
  neutralLabel?: string;
  yesLabel?: string;
  onNo(): void;
  onYesDontAsk?(): void;
  /** Absent: a message box with only the negative button (labelled `noLabel`, default OK). */
  onYes?(): void;
}

export function SessionDialog({
  open, title, message, noLabel, neutralLabel = "Yes and don't ask again", yesLabel = 'Yes', onNo, onYesDontAsk, onYes,
}: SessionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useBackHandler(() => { onNo(); return true; }, open);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog ref={ref} className="kk-dialog" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onNo(); }}>
      {open && (
        <>
          <h2 id={titleId}>{title}</h2>
          <div className="kk-dialog-body kk-pre-line">{message}</div>
          <div className="kk-dialog-actions kk-dialog-actions-3">
            <button type="button" className="kk-btn small secondary" onClick={onNo}>{noLabel ?? (onYes ? 'No' : 'OK')}</button>
            {onYesDontAsk && <button type="button" className="kk-btn small secondary" onClick={onYesDontAsk}>{neutralLabel}</button>}
            {onYes && <button type="button" className="kk-btn small" onClick={onYes}>{yesLabel}</button>}
          </div>
        </>
      )}
    </dialog>
  );
}
