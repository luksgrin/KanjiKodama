/**
 * The alert dialog (also the settings' preference dialogs): optional warning icon and
 * title in the body font, a message, an optional view (list, text field), and flat accent-coloured
 * text buttons in one row: neutral at the left, then negative and positive at the right.
 * Back / Escape / a tap outside cancel it unless `cancelable` is false.
 *
 * `ChoiceList` is a single-choice list (radio buttons) or plain rows. Native `<dialog>`, so the
 * Android bars are dimmed with the scrim (`androidSystemUi`).
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useBackHandler } from '../../hooks/useRoute';
import './alert.css';

export interface AlertButton {
  label: string;
  onClick(): void;
  disabled?: boolean;
  testId?: string;
}

export interface AlertDialogProps {
  open: boolean;
  title?: string | null;
  /** `R.drawable.ic_baseline_warning_24px` before the title. */
  warning?: boolean;
  /** Plain text message; `\n` breaks lines. */
  message?: string;
  children?: ReactNode;
  positive?: AlertButton;
  negative?: AlertButton;
  neutral?: AlertButton;
  /** Back, Escape or a tap on the scrim. Omit with `cancelable={false}`. */
  onCancel?(): void;
  cancelable?: boolean;
  testId?: string;
}

export function AlertDialog({ open, title, warning, message, children, positive, negative, neutral, onCancel, cancelable = true, testId }: AlertDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const cancel = () => { if (cancelable) onCancel?.(); };
  useBackHandler(() => { cancel(); return true; }, open);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
      // No list item looks focused on open; a text field keeps the focus (and the keyboard).
      if (!d.querySelector('input')) d.querySelector<HTMLElement>('.kk-alert-inner')?.focus({ preventScroll: true });
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  const button = (b: AlertButton | undefined, cls: string) => b && (
    <button type="button" className={`kk-alert-btn ${cls}`} disabled={b.disabled} data-testid={b.testId} onClick={b.onClick}>{b.label}</button>
  );
  const hasButtons = positive !== undefined || negative !== undefined || neutral !== undefined;
  return (
    <dialog ref={ref} className="kk-alert" aria-labelledby={title ? titleId : undefined} data-testid={testId}
      onCancel={(e) => { e.preventDefault(); cancel(); }}
      onClick={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      {open && (
        <div className="kk-alert-inner" tabIndex={-1}>
          {title && (
            <h2 id={titleId} className="kk-alert-title">
              {warning && <WarningIcon />}
              <span>{title}</span>
            </h2>
          )}
          {message !== undefined && <p className="kk-alert-message">{message}</p>}
          {children}
          {hasButtons && (
            <div className="kk-alert-buttons">
              {button(neutral, 'neutral')}
              <span className="kk-alert-spacer" />
              {button(negative, 'negative')}
              {button(positive, 'positive')}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

function WarningIcon() {
  return (
    <svg className="kk-alert-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

export interface ChoiceItem {
  key: string;
  label: string;
  testId?: string;
}

/** `setSingleChoiceItems` (with `checked`) or `setItems` (without). */
export function ChoiceList({ items, checked, onPick, label }: { items: readonly ChoiceItem[]; checked?: string | null; onPick(key: string): void; label?: string }) {
  const radio = checked !== undefined;
  return (
    <ul className={`kk-alert-list${radio ? ' radio' : ''}`} role={radio ? 'radiogroup' : 'list'} aria-label={label}>
      {items.map((it) => (
        <li key={it.key}>
          <button type="button" className="kk-alert-item" role={radio ? 'radio' : undefined}
            aria-checked={radio ? it.key === checked : undefined} data-testid={it.testId} onClick={() => onPick(it.key)}>
            {radio && <span className="kk-radio" aria-hidden="true" />}
            <span className="kk-alert-item-label">{it.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
