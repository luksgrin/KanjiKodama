/**
 * Import progress from WaniKani (`ProgressPreferences.askToken` / `checkToken`, `WaniKaniImporter`)
 * as the Java dialogs: "Import from WaniKani" with the token field (Cancel / Next), "Checking the
 * token…", "Override local progress?" (Cancel / Import and override), "Importing from WaniKani…" and
 * the summary. The download replaces local progress through core `applyWaniKaniImport`
 * (`persist: 'replace'`: rows of subjects the content lacks are dropped too, as
 * `ProgressStore.resetProgress` does). Local mode only, so the server is WaniKani's, as Java's
 * `ApiTask.getBaseUrl()` returns in local mode. The token is not stored.
 */
import { useRef } from 'react';
import { applyWaniKaniImport } from '../../../core/importer';
import { getHttp } from '../../../platform';
import { useApp, useReady } from '../../hooks/useApp';
import { SESSION_RUNNING, afterProgressChange, sessionRunning } from '../settings/progressFlow';
import type { Alerts } from '../settings/useAlerts';
import { checkWaniKaniToken, downloadWaniKani } from './wanikaniImport';

/** `ProgressPreferences.OVERRIDE_WARNING`. */
export const OVERRIDE_WARNING = 'This replaces ALL progress in KanjiKodama (levels, SRS stages,'
  + ' review history and notes) on this device. It cannot be undone. Save your current progress first'
  + ' if you might want it back.';

export const IMPORT_MESSAGE = 'Paste a WaniKani personal access token (wanikani.com, Settings, API Tokens). A read-only token is enough.';

export function useImportFlow(alerts: Alerts): (onDone?: () => void) => void {
  const app = useApp();
  const { platform } = useReady();
  const tokenRef = useRef<HTMLInputElement>(null);

  const importAll = async (key: string, user: Awaited<ReturnType<typeof checkWaniKaniToken>>, done: () => void) => {
    if (await sessionRunning(app)) { alerts.message(null, SESSION_RUNNING, done); return; }
    const summary = await alerts.run('Importing from WaniKani…', async () => {
      const download = await downloadWaniKani({ http: await getHttp(), token: key, appVersion: __APP_VERSION__ }, user);
      return app.write((l, now) => applyWaniKaniImport(l, download, now), { persist: 'replace' });
    });
    if (summary === undefined) return;
    afterProgressChange(app, platform);
    alerts.message(null, summary, done);
  };

  const checkToken = async (key: string, done: () => void) => {
    const user = await alerts.run('Checking the token…', async () => checkWaniKaniToken({ http: await getHttp(), token: key, appVersion: __APP_VERSION__ }));
    if (!user) return;
    const cancel = () => { alerts.close(); done(); };
    alerts.show({
      title: 'Override local progress?',
      message: `WaniKani account ${user.username ?? ''} is at level ${user.level}.\n\nImporting downloads that account's progress. ${OVERRIDE_WARNING}`,
      testId: 'dialog-import-confirm',
      onCancel: cancel,
      negative: { label: 'Cancel', onClick: cancel },
      positive: { label: 'Import and override', onClick: () => void importAll(key, user, done) },
    });
  };

  return (onDone) => {
    const done = () => onDone?.();
    const cancel = () => { alerts.close(); done(); };
    const next = () => {
      const key = (tokenRef.current?.value ?? '').trim();
      if (key === '') { cancel(); return; }
      void checkToken(key, done);
    };
    alerts.show({
      title: 'Import from WaniKani',
      message: IMPORT_MESSAGE,
      testId: 'dialog-import',
      onCancel: cancel,
      negative: { label: 'Cancel', onClick: cancel },
      positive: { label: 'Next', onClick: next, testId: 'import-next' },
      children: (
        <form className="kk-alert-form" onSubmit={(e) => { e.preventDefault(); next(); }}>
          <input ref={tokenRef} className="kk-alert-field" type="text" placeholder="API token" aria-label="API token"
            autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} data-testid="import-token" />
        </form>
      ),
    });
  };
}
