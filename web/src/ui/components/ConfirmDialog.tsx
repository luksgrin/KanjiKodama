/**
 * A modal confirmation (native <dialog>): Escape, the back gesture and "Cancel" all cancel.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useBackHandler } from '../hooks/useRoute';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({ open, title, children, confirmLabel = 'OK', cancelLabel = 'Cancel', danger, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useBackHandler(() => { if (!busy) onCancel(); return true; }, open);

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
    <dialog ref={ref} className="kk-dialog" aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}>
      {open && (
        <>
          <h2 id={titleId}>{title}</h2>
          <div className="kk-dialog-body">{children}</div>
          <div className="kk-dialog-actions">
            <button type="button" className="kk-dialog-btn" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
            <button type="button" className={`kk-dialog-btn${danger ? ' danger' : ''}`} onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
          </div>
        </>
      )}
    </dialog>
  );
}
