/** Shown until the app is ready: loading steps, or the start-up error with "Try again" / "Reload". */
import type { AppStatus } from '../../app/appController';

const STEP_TEXT = { storage: 'Opening your progress…', content: 'Loading kanji…', progress: 'Preparing your reviews…' } as const;

export function StartupScreen({ status, onRetry }: { status: AppStatus; onRetry(): void }) {
  if (status.kind === 'error') {
    const { error } = status;
    return (
      <main className="kk-startup" role="alert">
        <div className="kk-startup-box">
          <div className="kk-logo" lang="ja" aria-hidden>木霊</div>
          <h1>Can't start</h1>
          <p>{error.message}</p>
          <div className="kk-btn-row">
            {error.retryable
              ? <button type="button" className="kk-btn" onClick={onRetry}>Try again</button>
              : <button type="button" className="kk-btn" onClick={() => window.location.reload()}>Reload</button>}
          </div>
          {error.detail && <p className="kk-startup-detail">{error.detail}</p>}
        </div>
      </main>
    );
  }
  const text = status.kind === 'loading' ? STEP_TEXT[status.step] : 'Starting…';
  return (
    <main className="kk-startup" aria-busy="true">
      <div className="kk-startup-box">
        <div className="kk-logo" lang="ja" aria-hidden>木霊</div>
        <h1>KanjiKodama</h1>
        <p role="status" className="kk-muted">{text}</p>
      </div>
    </main>
  );
}
