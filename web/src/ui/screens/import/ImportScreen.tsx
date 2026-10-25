/**
 * Settings → Import progress from WaniKani (`ProgressPreferences.askToken` / `checkToken`,
 * `WaniKaniImporter`): paste a token, check it, confirm the override, download and replace local
 * progress (core `applyWaniKaniImport` through `app.write`, `persist: 'replace'`: rows of subjects the
 * content lacks are dropped too, as `ProgressStore.resetProgress` does). Local mode only, so the
 * server is WaniKani's, as Java's `ApiTask.getBaseUrl()` returns in local mode.
 */
import { useState } from 'react';
import { applyWaniKaniImport } from '../../../core/importer';
import type { ServerUser } from '../../../core/server';
import { getHttp } from '../../../platform';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Panel } from '../../components/Panel';
import { useApp, useReady } from '../../hooks/useApp';
import { LocalOnly } from '../settings/LocalOnly';
import { SESSION_RUNNING, afterProgressChange, errorMessage, sessionRunning } from '../settings/progressFlow';
import { checkWaniKaniToken, downloadWaniKani } from './wanikaniImport';
import '../settings/settings.css';

/** `ProgressPreferences.OVERRIDE_WARNING`. */
export const OVERRIDE_WARNING = 'This replaces ALL progress in KanjiKodama (levels, SRS stages,'
  + ' review history and notes) on this device. It cannot be undone. Save your current progress first'
  + ' if you might want it back.';

type Step =
  | { kind: 'token' }
  | { kind: 'busy'; label: string }
  | { kind: 'confirm'; user: ServerUser; token: string };

function Import() {
  const app = useApp();
  const { platform } = useReady();
  const [token, setToken] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'token' });
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const busy = step.kind === 'busy';

  const next = async () => {
    const key = token.trim();
    if (key === '') return;
    setMessage(null);
    setStep({ kind: 'busy', label: 'Checking the token…' });
    try {
      const user = await checkWaniKaniToken({ http: await getHttp(), token: key, appVersion: __APP_VERSION__ });
      setStep({ kind: 'confirm', user, token: key });
    } catch (e) {
      setMessage({ error: true, text: errorMessage(e) });
      setStep({ kind: 'token' });
    }
  };

  const importAll = async () => {
    if (step.kind !== 'confirm') return;
    const { user, token: key } = step;
    if (await sessionRunning(app)) {
      setMessage({ error: true, text: SESSION_RUNNING });
      setStep({ kind: 'token' });
      return;
    }
    setStep({ kind: 'busy', label: 'Importing from WaniKani…' });
    try {
      const download = await downloadWaniKani({ http: await getHttp(), token: key, appVersion: __APP_VERSION__ }, user);
      const summary = await app.write((l, now) => applyWaniKaniImport(l, download, now), { persist: 'replace' });
      setMessage({ error: false, text: summary });
      setToken('');
      afterProgressChange(app, platform);
    } catch (e) {
      setMessage({ error: true, text: errorMessage(e) });
    }
    setStep({ kind: 'token' });
  };

  return (
    <>
      {message && (
        <div className={`kk-banner${message.error ? ' error' : ' ok'}`} role="status" data-testid="import-message">
          <span className="kk-banner-text">{message.text}</span>
        </div>
      )}
      <Panel title="Import from WaniKani">
        <p>Paste a WaniKani personal access token (wanikani.com, Settings, API Tokens). A read-only token is enough.</p>
        <form onSubmit={(e) => { e.preventDefault(); void next(); }}>
          <p>
            <input className="kk-input kk-input-block" type="text" placeholder="API token" aria-label="API token" value={token}
              autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={busy}
              data-testid="import-token" onChange={(e) => setToken(e.currentTarget.value)} />
          </p>
          <div className="kk-btn-row">
            <button type="submit" className="kk-btn" disabled={busy || token.trim() === ''} data-testid="import-next">Next</button>
          </div>
        </form>
        {busy && <p role="status" className="kk-small kk-muted" data-testid="import-busy">{step.label}</p>}
        <p className="kk-small kk-muted">
          The token is sent only to WaniKani and is not stored. Lesson content stays the app's own; only your progress is imported.
        </p>
      </Panel>
      <ConfirmDialog open={step.kind === 'confirm'} title="Override local progress?" confirmLabel="Import and override" danger
        onConfirm={() => void importAll()} onCancel={() => setStep({ kind: 'token' })}>
        {step.kind === 'confirm' && (
          <p className="kk-pre-line" data-testid="import-confirm">
            {`WaniKani account ${step.user.username ?? ''} is at level ${step.user.level}.\n\nImporting downloads that account's progress. ${OVERRIDE_WARNING}`}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

export function ImportScreen() {
  return <LocalOnly><Import /></LocalOnly>;
}
