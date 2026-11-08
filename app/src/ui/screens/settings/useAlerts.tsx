/**
 * A chain of dialogs on one screen: one dialog at a
 * time; `run` shows the non-cancelable busy dialog with its label while the work runs, then either
 * continues or shows "Something went wrong" with the error.
 *
 * Text fields inside a dialog are uncontrolled (read them through a ref in the button handler), as
 * the dialog spec is captured when it is shown.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AlertDialog, type AlertDialogProps } from './AlertDialog';
import { errorMessage } from './progressFlow';

export type AlertSpec = Omit<AlertDialogProps, 'open'>;

export interface Alerts {
  show(spec: AlertSpec): void;
  close(): void;
  /** Title (or none), text, OK. `then` runs after OK / cancel. */
  message(title: string | null, text: string, then?: () => void): void;
  /** The busy dialog, then the value, or the error dialog and undefined. */
  run<T>(label: string, work: () => Promise<T>): Promise<T | undefined>;
  /** True while a dialog is shown. */
  readonly open: boolean;
  /** Render once. */
  node: ReactNode;
}

export function useAlerts(): Alerts {
  const [spec, setSpec] = useState<AlertSpec | null>(null);
  const close = useCallback(() => setSpec(null), []);
  const message = useCallback((title: string | null, text: string, then?: () => void) => {
    const done = () => { setSpec(null); then?.(); };
    setSpec({ title, message: text, positive: { label: 'OK', onClick: done }, onCancel: done, testId: 'alert-message' });
  }, []);
  const run = useCallback(async <T,>(label: string, work: () => Promise<T>): Promise<T | undefined> => {
    setSpec({ message: label, cancelable: false, testId: 'alert-busy' });
    try {
      const r = await work();
      setSpec(null);
      return r;
    } catch (e) {
      message('Something went wrong', errorMessage(e));
      return undefined;
    }
  }, [message]);
  const node = <AlertDialog open={spec !== null} {...(spec ?? {})} />;
  return useMemo(() => ({ show: setSpec, close, message, run, open: spec !== null, node }), [close, message, run, spec, node]);
}
