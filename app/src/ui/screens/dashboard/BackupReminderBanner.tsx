/**
 * The PWA's "last saved N days ago" reminder (`progress/backup.ts` `backupReminder`). Not shown
 * where the platform makes automatic backups (Android). "Save now" saves straight from the tap.
 */
import { useState } from 'react';
import { useApp, useReady } from '../../hooks/useApp';

export function BackupReminderBanner() {
  const app = useApp();
  const { platform } = useReady();
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (platform.capabilities.autoBackup || hidden) return null;
  const reminder = app.backupReminder();
  if (!reminder.show && message === null) return null;

  const save = () => {
    app.saveProgress().then(
      (r) => setMessage(r.result === 'saved' ? 'Progress saved.' : null),
      (e: unknown) => setMessage(`Save failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  };

  if (!reminder.show) {
    return <div className="kk-banner ok" role="status"><span className="kk-banner-text">{message}</span></div>;
  }
  return (
    <div className="kk-banner" role="status" data-testid="backup-reminder">
      <span className="kk-banner-text">
        {reminder.state === 'never'
          ? 'Your progress has never been saved to a file.'
          : `Progress last saved ${reminder.daysAgo} days ago.`}
        {' '}This app's storage can be cleared; save a copy.
        {message !== null && <span className="kk-small kk-muted"> {message}</span>}
      </span>
      <button type="button" className="kk-btn small" onClick={save}>Save</button>
      <button type="button" className="kk-icon-btn" aria-label="Hide until next start" onClick={() => setHidden(true)}>✕</button>
    </div>
  );
}
