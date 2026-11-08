/**
 * A modal with several actions (Android's AlertDialog negative / neutral / positive), for the
 * server-mode questions: the look of `settings/AlertDialog` (flat accent text
 * buttons, right-aligned, wrapping when they don't fit one row).
 */
import '../settings/alert.css';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useBackHandler } from '../../hooks/useRoute';

export interface ChoiceAction {
  label: string;
  onClick(): void;
  /** Secondary style (Cancel, neutral). */
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

export function ChoiceDialog({ open, title, children, actions, onCancel, busy, testId }: {
  open: boolean;
  title: string;
  children: ReactNode;
  actions: ChoiceAction[];
  onCancel(): void;
  busy?: boolean;
  testId?: string;
}) {
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
    <dialog ref={ref} className="kk-alert" aria-labelledby={titleId} data-testid={testId}
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }}>
      {open && (
        <div className="kk-alert-inner">
          <h2 id={titleId} className="kk-alert-title"><span>{title}</span></h2>
          <div className="kk-alert-body">{children}</div>
          <div className="kk-alert-buttons wrap">
            {actions.map((a) => (
              <button key={a.label} type="button" disabled={busy || a.disabled}
                className={`kk-alert-btn${a.danger ? ' danger' : ''}`} onClick={a.onClick}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </dialog>
  );
}
