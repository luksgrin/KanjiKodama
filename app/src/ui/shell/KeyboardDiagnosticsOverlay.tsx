/**
 * While the keyboard diagnostics are on (keyboardDiagnostics.ts): the last few log lines over the
 * top of the screen, so the owner sees what a tap did. It takes no touches (`pointer-events: none`):
 * a tap on it is a tap on what is under it.
 */
import { useEffect, useSyncExternalStore } from 'react';
import {
  keyboardDiagnosticsEnabled, keyboardDiagnosticsLines, startKeyboardDiagnostics, subscribeKeyboardDiagnostics,
} from './keyboardDiagnostics';

const SHOWN = 6;

export function KeyboardDiagnosticsOverlay() {
  const on = useSyncExternalStore(subscribeKeyboardDiagnostics, keyboardDiagnosticsEnabled, () => false);
  const count = useSyncExternalStore(subscribeKeyboardDiagnostics, () => keyboardDiagnosticsLines().length, () => 0);
  useEffect(() => { if (on) startKeyboardDiagnostics(); }, [on]);
  if (!on) return null;
  const lines = keyboardDiagnosticsLines().slice(-SHOWN);
  return (
    <div className="kk-kbd-diag-overlay" aria-hidden="true" data-testid="keyboard-diagnostics-overlay" data-count={count}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}
