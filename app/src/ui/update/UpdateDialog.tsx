/**
 * The self-update dialog (Android): "KanjiKodama X.Y.Z is available" with Update / Later, the
 * download's progress, the one-time "allow installs" explanation, and plain errors with a link to
 * the release page. Mounted once in the app shell, which also runs the start-up check.
 */
import { useEffect, useSyncExternalStore } from 'react';
import './update.css';
import { RELEASES_PAGE_URL } from '../../core/update';
import { useApp, useReady } from '../hooks/useApp';
import { AlertDialog } from '../screens/settings/AlertDialog';
import { toast } from '../shell/toast';
import { UpdateController } from './updateController';
import type { AppController } from '../../app/appController';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

const controllers = new WeakMap<AppController, UpdateController>();

/** The app's update controller; null on builds that don't update themselves (the web app). */
export function useUpdateController(): UpdateController | null {
  const app = useApp();
  const { platform } = useReady();
  const updater = platform.updater;
  if (!platform.capabilities.selfUpdate || updater === undefined) return null;
  let c = controllers.get(app);
  if (c === undefined) {
    c = new UpdateController({
      http: platform.http,
      updater,
      appVersion: __APP_VERSION__,
      now: () => app.clock.now(),
      prefs: () => app.get().prefs,
      setPreference: (k, v) => app.setPreference(k, v),
    });
    controllers.set(app, c);
  }
  return c;
}

const IDLE = { phase: 'idle' as const };
const NO_STATE = () => IDLE;
const noSubscribe = () => () => undefined;

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The dialog, plus the start-up check (once, when online). */
export function UpdateDialog() {
  const c = useUpdateController();
  const state = useSyncExternalStore(c?.subscribe ?? noSubscribe, c?.get ?? NO_STATE, c?.get ?? NO_STATE);

  useEffect(() => {
    if (c === null || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    void c.startupCheck();
  }, [c]);

  // "Check now" with nothing new: a toast, not a dialog.
  useEffect(() => {
    if (c !== null && state.phase === 'upToDate') {
      toast(`KanjiKodama ${__APP_VERSION__} is the latest version`);
      c.dismiss();
    }
  }, [c, state.phase]);

  if (c === null) return null;
  const later = () => void c.later();
  const close = () => c.dismiss();

  switch (state.phase) {
    case 'offer':
      return (
        <AlertDialog open title={`KanjiKodama ${state.offer.version} is available`} testId="dialog-update" onCancel={later}
          negative={{ label: 'Later', onClick: later, testId: 'update-later' }}
          positive={{ label: 'Update', onClick: () => void c.update(), testId: 'update-now' }}>
          <p className="kk-alert-message">
            You have {__APP_VERSION__}. The app downloads the new version
            {state.offer.apk.size ? ` (${mb(state.offer.apk.size)})` : ''}, Android asks you to confirm the update, then
            closes the app to install it. Your progress and settings stay.
          </p>
          <p className="kk-alert-message"><a href={state.offer.pageUrl} {...ext} data-testid="update-notes">What's new</a></p>
        </AlertDialog>
      );
    case 'notice':
      return (
        <AlertDialog open title={`KanjiKodama ${state.notice.version} is available`} testId="dialog-update-notice" onCancel={later}
          negative={{ label: 'Later', onClick: later, testId: 'update-later' }}
          positive={{ label: 'OK', onClick: later }}>
          <p className="kk-alert-message">
            {state.notice.reason === 'major'
              ? 'This is a new major version: install it from its release page.'
              : 'This release can\'t be installed from inside the app: get it from its release page.'}
          </p>
          <p className="kk-alert-message"><a href={state.notice.pageUrl} {...ext} data-testid="update-page">Open the release page</a></p>
        </AlertDialog>
      );
    case 'checking':
      return (
        <AlertDialog open title="Checking for updates…" testId="dialog-update-checking" cancelable={false}>
          <progress className="kk-update-progress" aria-label="Checking for updates" />
        </AlertDialog>
      );
    case 'downloading': {
      const { received, total } = state;
      return (
        <AlertDialog open title={`Downloading KanjiKodama ${state.offer.version}`} testId="dialog-update-downloading" cancelable={false}>
          <progress className="kk-update-progress" max={total > 0 ? total : undefined} value={total > 0 ? received : undefined}
            data-testid="update-progress" aria-label="Download progress" />
          <p className="kk-alert-message kk-small">{total > 0 ? `${mb(received)} of ${mb(total)}` : mb(received)}</p>
        </AlertDialog>
      );
    }
    case 'permission':
      return (
        <AlertDialog open title="Allow KanjiKodama to install updates" testId="dialog-update-permission" onCancel={later}
          negative={{ label: 'Later', onClick: later }}
          positive={{ label: 'Open settings', onClick: () => void c.allowInstalls(), testId: 'update-allow' }}>
          <p className="kk-alert-message">
            Android asks once whether KanjiKodama may install apps. In the screen that opens, turn on
            &quot;Allow from this source&quot;, then come back: the update continues.
          </p>
        </AlertDialog>
      );
    case 'installing':
      return (
        <AlertDialog open title={`Installing KanjiKodama ${state.offer.version}`} testId="dialog-update-installing" onCancel={close}
          positive={{ label: 'Close', onClick: close }}>
          <p className="kk-alert-message">Confirm the update in Android&apos;s dialog. Android then closes the app to update it: open it again to use the new version.</p>
        </AlertDialog>
      );
    case 'error':
      return (
        <AlertDialog open warning title="Update failed" testId="dialog-update-error" onCancel={close}
          positive={{ label: 'OK', onClick: close, testId: 'update-error-ok' }}>
          <p className="kk-alert-message" data-testid="update-error">{state.message}</p>
          <p className="kk-alert-message"><a href={state.pageUrl || RELEASES_PAGE_URL} {...ext}>Download it from the release page instead</a></p>
        </AlertDialog>
      );
    default:
      return null;
  }
}
