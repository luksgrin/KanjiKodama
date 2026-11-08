/**
 * About: the hidden keyboard diagnostics (ui/shell/keyboardDiagnostics.ts). Tapping the app version
 * seven times turns them on or off; while on, this section shows the log with Copy, Share, Clear and
 * Turn off. The log has no answers and no token (elements by tag and class only).
 */
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useReady } from '../../hooks/useApp';
import {
  clearKeyboardDiagnostics, keyboardDiagnosticsEnabled, keyboardDiagnosticsLines, keyboardDiagnosticsText,
  setKeyboardDiagnosticsEnabled, subscribeKeyboardDiagnostics,
} from '../../shell/keyboardDiagnostics';
import { toast } from '../../shell/toast';

const TAPS = 7;
const TAP_WINDOW_MS = 3000;

/** onClick for the version: seven taps within 3 s toggle the diagnostics. */
export function useDiagnosticsTaps(): () => void {
  const taps = useRef<number[]>([]);
  return () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < TAP_WINDOW_MS), now];
    if (taps.current.length < TAPS) return;
    taps.current = [];
    const on = !keyboardDiagnosticsEnabled();
    setKeyboardDiagnosticsEnabled(on);
    toast(on ? 'Keyboard diagnostics on' : 'Keyboard diagnostics off');
  };
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function KeyboardDiagnosticsSection() {
  const { platform } = useReady();
  const on = useSyncExternalStore(subscribeKeyboardDiagnostics, keyboardDiagnosticsEnabled, () => false);
  const count = useSyncExternalStore(subscribeKeyboardDiagnostics, () => keyboardDiagnosticsLines().length, () => 0);
  const pre = useRef<HTMLPreElement>(null);
  // The newest lines are at the bottom: keep the log scrolled there.
  useLayoutEffect(() => { if (pre.current) pre.current.scrollTop = pre.current.scrollHeight; }, [count, on]);
  if (!on) return null;
  const files = platform.files;
  const name = `kanjikodama-keyboard-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  return (
    <section className="kk-kbd-diag" data-testid="keyboard-diagnostics">
      <h4>Keyboard diagnostics</h4>
      <p>
        On: what the focus, the selection and the keyboard do is logged ({count} lines; the last ones show at the
        top of the screen). Reproduce the problem, come back here and copy or share the log. It has no answers and
        no token.
      </p>
      <div className="kk-kbd-diag-actions">
        <button type="button" className="kk-btn" onClick={() => {
          void copy(keyboardDiagnosticsText()).then((ok) => toast(ok ? 'Log copied' : 'Copy failed'));
        }}>Copy</button>
        <button type="button" className="kk-btn" onClick={() => {
          const text = keyboardDiagnosticsText();
          void (files.shareText ? files.shareText(name, text) : files.saveText(name, text)).catch(() => toast('Share failed'));
        }}>{files.shareText ? 'Share' : 'Save'}</button>
        <button type="button" className="kk-btn" onClick={() => clearKeyboardDiagnostics()}>Clear</button>
        <button type="button" className="kk-btn" onClick={() => {
          setKeyboardDiagnosticsEnabled(false);
          toast('Keyboard diagnostics off');
        }}>Turn off</button>
      </div>
      <pre ref={pre} className="kk-kbd-diag-log" data-testid="keyboard-diagnostics-log">{keyboardDiagnosticsLines().slice(-300).join('\n')}</pre>
    </section>
  );
}
