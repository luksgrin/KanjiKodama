/**
 * Settings → Progress: save the progress file (picker / share sheet) and restore one (pick, show the
 * summary, confirm, replace), like `ProgressPreferences`. Restore is local mode only (`LocalMode.LOCAL_PREFERENCES`).
 */
import { useState } from 'react';
import type { OpenedProgressFile } from '../../../app/appController';
import { dateTime } from '../../../app/format';
import { ProgressImportError } from '../../../progress/importFile';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Panel } from '../../components/Panel';
import { useApp, useReady } from '../../hooks/useApp';

type Status = { kind: 'ok' | 'error'; text: string } | null;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function ProgressSection() {
  const app = useApp();
  const { state, platform } = useReady();
  const [status, setStatus] = useState<Status>(null);
  const [pending, setPending] = useState<OpenedProgressFile | null>(null);
  const [busy, setBusy] = useState(false);

  // Called straight from the tap: saveProgress builds the text synchronously (iOS user activation).
  const save = () => {
    setStatus(null);
    app.saveProgress().then(
      (r) => setStatus(r.result === 'saved' ? { kind: 'ok', text: `Saved ${r.name}.` } : null),
      (e: unknown) => setStatus({ kind: 'error', text: `Save failed: ${message(e)}` }),
    );
  };

  const pick = async () => {
    setStatus(null);
    try {
      const opened = await app.openProgressFile();
      if (opened) setPending(opened);
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof ProgressImportError ? e.message : `Could not open the file: ${message(e)}` });
    }
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const msg = await app.restoreProgress(pending.text);
      setStatus({ kind: 'ok', text: msg });
    } catch (e) {
      setStatus({ kind: 'error', text: `Restore failed, nothing changed: ${message(e)}` });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const lastSaved = state.lastSavedAt === null ? 'Never saved to a file.' : `Last saved ${dateTime(state.lastSavedAt)}.`;
  return (
    <Panel title="Progress" labelledBy="settings-progress">
      <p className="kk-small kk-muted" data-testid="last-saved">
        {lastSaved}
        {platform.capabilities.autoBackup && ' An automatic backup is also kept after each session.'}
      </p>
      <div className="kk-btn-row">
        <button type="button" className="kk-btn" onClick={save}>Save progress</button>
        {state.mode !== 'server' && (
          <button type="button" className="kk-btn secondary" onClick={() => void pick()}>Restore progress</button>
        )}
      </div>
      {status && (
        <p role="status" className={`kk-small ${status.kind === 'error' ? 'kk-error-text' : ''}`} data-testid="progress-status">
          {status.text}
        </p>
      )}
      <ConfirmDialog
        open={pending !== null}
        title="Restore progress?"
        confirmLabel="Restore"
        danger
        busy={busy}
        onConfirm={() => void restore()}
        onCancel={() => setPending(null)}
      >
        <p>{pending?.summary}</p>
        <p className="kk-small">This replaces all progress on this device. Save your current progress first if you may want it back.</p>
      </ConfirmDialog>
    </Panel>
  );
}
