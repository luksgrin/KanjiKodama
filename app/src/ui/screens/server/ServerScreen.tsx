/**
 * Server connection: ask for the server, the token, check it, confirm, show the connection, and go
 * back to local mode, on one screen instead of a chain of dialogs.
 *
 * Local mode: address (presets WaniKani and OpenKani) and token, or "Use WaniKani token" (an OpenKani
 * server copies the WaniKani account once and gives back its own token), test, connect, the switch
 * question with "Save first". The PWA refuses http:// addresses (mixed content, Known limitations #5).
 * Server mode: the connection, last sync, unsent answers, "Sync now", a new token after "token
 * rejected", and back to local mode (start at level 1 or bring the progress), never silently
 * dropping unsent answers.
 */
import { useCallback, useEffect, useState } from 'react';
import { dateTime } from '../../../app/format';
import {
  normalizeServerUrl,
  serverLabel,
  serverStatusMessage,
  switchToLocalQuestion,
  switchToServerQuestion,
  WANIKANI_API_BASE_URL,
  type ServerUser,
} from '../../../core/server';
import { checkConnection, migrateFromWaniKani, type SyncStatus } from '../../../sync/engine';
import { downloadForLocal, switchToLocal, switchToServer } from '../../../sync/modeSwitch';
import { ServerStore } from '../../../sync/store';
import { Panel } from '../../components/Panel';
import { useApp, useReady } from '../../hooks/useApp';
import { useToolbar } from '../../shell/toolbar';
import { ChoiceDialog } from './ChoiceDialog';
import './server.css';

export const OPENKANI_URL = 'https://openkani.vercel.app';

export const PRESETS: readonly { label: string; url: string }[] = [
  { label: 'WaniKani', url: WANIKANI_API_BASE_URL },
  { label: 'OpenKani', url: OPENKANI_URL },
];

/** The server question's message. */
export const CONNECT_MESSAGE = 'In server mode the server decides SRS stages, unlocks and level-ups, and lessons and'
  + ' reviews are sent to it. JLPT order, the extra kanji, fast travel and the level test are'
  + ' only available in local mode.\n\nPaste a token for the server. An OpenKani server can'
  + ' instead copy your data from WaniKani once and give back its own token: leave the token'
  + ' empty and use a WaniKani token. Your progress then lives on that server, so use one you'
  + ' run yourself or trust.';

export const NO_TOKEN_MESSAGE = 'Paste an API token for the server, or use a WaniKani token to copy your WaniKani data to it.';

/** Known limitations #5 (PWA). */
export const MIXED_CONTENT_MESSAGE = "Server mode needs an https:// server. An https app can't call http:// servers"
  + " (mixed content), so LAN servers without TLS don't work here.";

export function wkKeyMessage(base: string): string {
  const label = serverLabel(base);
  return 'Paste a WaniKani personal access token (wanikani.com, Settings, API Tokens). '
    + `${label} downloads your WaniKani data once into its own database and`
    + ` gives back a token for it. The WaniKani token is sent to ${label}`
    + '. If it copied your data before, it gives back the existing token. This can take a few minutes.';
}

type Dialog =
  | null
  | { kind: 'message'; title: string | null; text: string }
  | { kind: 'wkKey'; base: string }
  | { kind: 'confirmServer'; base: string; token: string; user: ServerUser }
  | { kind: 'askLocal'; base: string; pending: number };

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type Note = { ok: boolean; text: string } | null;

export function ServerScreen() {
  const { state } = useReady();
  // Kept across the switch: the message of a mode switch shows in the other mode's view.
  const [note, setNote] = useState<Note>(null);
  useToolbar({ title: 'Server connection' });
  return state.mode === 'server' ? <ServerModeView note={note} setNote={setNote} /> : <ConnectView note={note} setNote={setNote} />;
}

// --- Local mode: connect ------------------------------------------------------------------------

function ConnectView({ note, setNote }: { note: Note; setNote(n: Note): void }) {
  const app = useApp();
  const { platform } = useReady();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [wkKey, setWkKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  // `askServer`: the saved address, unless it is WaniKani's (no default server).
  useEffect(() => {
    let live = true;
    new ServerStore(app.db).baseUrl().then((b) => {
      if (live && b !== null && url === '') setUrl(b);
    }, () => undefined);
    return () => { live = false; };
  }, [app]);

  const message = (title: string | null, text: string) => setDialog({ kind: 'message', title, text });

  /** `withUrl`: normalize, and on the PWA refuse http://. */
  const withUrl = (action: (base: string) => void) => {
    let base: string;
    try {
      base = normalizeServerUrl(url);
    } catch (e) {
      message('Server address', errorText(e));
      return;
    }
    if (!platform.capabilities.cleartextHttp && base.toLowerCase().startsWith('http://')) {
      message('Server address', MIXED_CONTENT_MESSAGE);
      return;
    }
    action(base);
  };

  async function work<T>(label: string, run: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setNote(null);
    try {
      return await run();
    } catch (e) {
      message(null, errorText(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const check = (base: string, t: string) =>
    work('Checking the connection…', () => checkConnection({ ...app.connectionOptions(), http: platform.http, baseUrl: base, token: t }));

  const onTest = () => withUrl(async (base) => {
    const t = token.trim();
    if (t === '') {
      message('No token', NO_TOKEN_MESSAGE);
      return;
    }
    const user = await check(base, t);
    if (user) setNote({ ok: true, text: `Connected to ${serverLabel(base)} as ${user.username}, level ${user.level}.` });
  });

  const checkServer = async (base: string, t: string) => {
    const user = await check(base, t);
    if (user) setDialog({ kind: 'confirmServer', base, token: t, user });
  };

  const onConnect = () => withUrl((base) => {
    const t = token.trim();
    if (t === '') {
      message('No token', NO_TOKEN_MESSAGE);
      return;
    }
    void checkServer(base, t);
  });

  const onUseWaniKani = () => withUrl((base) => {
    setWkKey('');
    setDialog({ kind: 'wkKey', base });
  });

  const onWkNext = async (base: string) => {
    const k = wkKey.trim();
    if (k === '') return;
    setDialog(null);
    const t = await work(`Copying your WaniKani data to ${serverLabel(base)}…`,
      () => migrateFromWaniKani({ appVersion: app.connectionOptions().appVersion, http: platform.http, baseUrl: base, wkApiKey: k }));
    if (t !== undefined) {
      setToken(t);
      await checkServer(base, t);
    }
  };

  const onSaveFirst = async (d: Extract<Dialog, { kind: 'confirmServer' }>) => {
    // The backup offer (`backupBeforeServerSwitch`): app.saveProgress builds the file text before any
    // await, so iOS keeps the tap's user activation for the share sheet.
    setDialog(null);
    try {
      await app.saveProgress();
    } catch (e) {
      message(null, errorText(e));
      return;
    }
    setDialog(d);
  };

  const onSwitch = async (d: Extract<Dialog, { kind: 'confirmServer' }>) => {
    setDialog(null);
    const text = await work('Switching to server mode…', async () => {
      const msg = await switchToServer(app.db, { baseUrl: d.base, token: d.token, user: d.user, tokens: app.tokenStore() });
      await app.reload(); // starts the first sync
      return msg;
    });
    if (text !== undefined) setNote({ ok: true, text });
  };

  return (
    <div className="kk-server">
      <Panel title="Connect to a server">
        <p className="kk-server-text">{CONNECT_MESSAGE}</p>
        <label className="kk-server-field">
          <span className="kk-small">Server address</span>
          <input className="kk-input kk-input-block" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false}
            placeholder="Server address, e.g. https://my-openkani.vercel.app" aria-label="Server address"
            value={url} onChange={(e) => setUrl(e.currentTarget.value)} disabled={busy !== null} data-testid="server-url" />
        </label>
        <div className="kk-btn-row" role="group" aria-label="Presets">
          {PRESETS.map((p) => (
            <button key={p.url} type="button" className="kk-btn small secondary" disabled={busy !== null}
              onClick={() => setUrl(p.url)} data-testid={`preset-${p.label}`}>{p.label}</button>
          ))}
        </div>
        <label className="kk-server-field">
          <span className="kk-small">API token</span>
          <input className="kk-input kk-input-block" type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off"
            placeholder="API token for this server" aria-label="API token for this server"
            value={token} onChange={(e) => setToken(e.currentTarget.value)} disabled={busy !== null} data-testid="server-token" />
        </label>
        <div className="kk-btn-row">
          <button type="button" className="kk-btn small secondary" onClick={onTest} disabled={busy !== null} data-testid="server-test">Test connection</button>
          <button type="button" className="kk-btn small secondary" onClick={onUseWaniKani} disabled={busy !== null} data-testid="server-use-wk">Use WaniKani token</button>
          <button type="button" className="kk-btn small" onClick={onConnect} disabled={busy !== null} data-testid="server-connect">Connect</button>
        </div>
        {busy !== null && <p className="kk-muted" role="status" data-testid="server-busy">{busy}</p>}
        {note && <div className={`kk-banner ${note.ok ? 'ok' : 'error'}`} role="status" data-testid="server-note"><span className="kk-banner-text">{note.text}</span></div>}
      </Panel>

      <MessageDialog dialog={dialog} onClose={() => setDialog(null)} />

      <ChoiceDialog open={dialog?.kind === 'wkKey'} testId="dialog-wk-key"
        title={dialog?.kind === 'wkKey' ? `Copy your WaniKani data to ${serverLabel(dialog.base)}` : ''}
        onCancel={() => setDialog(null)}
        actions={[
          { label: 'Cancel', secondary: true, onClick: () => setDialog(null) },
          { label: 'Next', disabled: wkKey.trim() === '', onClick: () => { if (dialog?.kind === 'wkKey') void onWkNext(dialog.base); } },
        ]}>
        {dialog?.kind === 'wkKey' && (
          <>
            <p className="kk-server-text">{wkKeyMessage(dialog.base)}</p>
            <input className="kk-input kk-input-block" type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off"
              placeholder="WaniKani API token" aria-label="WaniKani API token" value={wkKey}
              onChange={(e) => setWkKey(e.currentTarget.value)} data-testid="server-wk-key" />
          </>
        )}
      </ChoiceDialog>

      <ChoiceDialog open={dialog?.kind === 'confirmServer'} title="Switch to server mode?" testId="dialog-confirm-server"
        onCancel={() => setDialog(null)}
        actions={dialog?.kind === 'confirmServer' ? [
          { label: 'Cancel', secondary: true, onClick: () => setDialog(null) },
          { label: 'Save first', secondary: true, onClick: () => void onSaveFirst(dialog) },
          { label: 'Switch', onClick: () => void onSwitch(dialog) },
        ] : []}>
        {dialog?.kind === 'confirmServer' && (
          <p className="kk-server-text">{switchToServerQuestion(dialog.base, dialog.user.username, dialog.user.level)}</p>
        )}
      </ChoiceDialog>
    </div>
  );
}

function MessageDialog({ dialog, onClose }: { dialog: Dialog; onClose(): void }) {
  const open = dialog?.kind === 'message';
  return (
    <ChoiceDialog open={open} title={open ? dialog.title ?? 'Server' : ''} testId="dialog-message" onCancel={onClose}
      actions={[{ label: 'OK', onClick: onClose }]}>
      {open && <p className="kk-server-text" data-testid="dialog-message-text">{dialog.text}</p>}
    </ChoiceDialog>
  );
}

// --- Server mode ----------------------------------------------------------------------------------

function useSyncStatus(): SyncStatus | null {
  const app = useApp();
  const { state } = useReady();
  const engine = app.syncEngine();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const read = useCallback(() => {
    if (!engine) return;
    engine.status().then(setStatus, () => undefined);
  }, [engine]);
  useEffect(() => {
    read();
    return engine?.subscribe(read);
  }, [engine, read, state.revision]);
  return status;
}

function ServerModeView({ note, setNote }: { note: Note; setNote(n: Note): void }) {
  const app = useApp();
  const { platform } = useReady();
  const status = useSyncStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [newToken, setNewToken] = useState('');
  // The "V2 API token" (`api_key`) field opens with the saved token.
  const keyRejected = status?.apiState === 'API_KEY_REJECTED';
  useEffect(() => {
    if (!keyRejected) return;
    let live = true;
    app.tokenStore().get().then((t) => { if (live) setNewToken((cur) => (cur === '' ? (t ?? '') : cur)); }, () => undefined);
    return () => { live = false; };
  }, [app, keyRejected]);

  async function work<T>(label: string, run: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setNote(null);
    try {
      return await run();
    } catch (e) {
      setDialog({ kind: 'message', title: null, text: errorText(e) });
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  if (!status || status.baseUrl === null) return <Panel title="Server mode"><p className="kk-muted">Checking unsent answers…</p></Panel>;
  const base = status.baseUrl;
  const label = serverLabel(base);

  const onSync = async () => {
    const r = await work('Syncing…', () => app.syncNow({ manual: true }));
    if (r && !r.ok && r.message) setNote({ ok: false, text: r.message });
  };

  const onNewToken = async () => {
    const t = newToken.trim();
    if (t === '') return;
    const r = await work('Checking the connection…', async () => {
      await checkConnection({ ...app.connectionOptions(), http: platform.http, baseUrl: base, token: t }); // ServerError: rejected / unreachable
      await app.syncEngine()?.setToken(t);
      return app.syncNow({ manual: true });
    });
    if (r !== undefined) {
      setNewToken('');
      setNote(r?.ok ? { ok: true, text: `Connected to ${label}.` } : r?.message ? { ok: false, text: r.message } : null);
    }
  };

  // `showServer`: "Checking unsent answers…", then the question with the current count.
  const onAskLocal = async () => {
    const st = await work('Checking unsent answers…', async () => app.syncEngine()?.status() ?? null);
    if (st !== undefined) setDialog({ kind: 'askLocal', base, pending: st?.pending ?? status.pending });
  };

  const onSendNow = async () => {
    setDialog(null);
    await work(`Sending to ${label}…`, () => app.flushUploads({ manual: true }));
    const st = await app.syncEngine()?.status();
    setDialog({ kind: 'askLocal', base, pending: st?.pending ?? 0 });
  };

  const toLocal = async (bring: boolean, pending: number) => {
    setDialog(null);
    const bundled = app.bundledContent();
    if (!bundled) return;
    const text = await work(bring ? `Downloading from ${label}…` : 'Switching to local mode…', async () => {
      const tokens = app.tokenStore();
      const download = bring ? await downloadForLocal(app.db, { ...app.connectionOptions(), http: platform.http, tokens }) : null;
      // The question said how many unsent answers will be lost: discarding them is explicit here.
      const msg = await switchToLocal(app.db, {
        content: bundled.content, jlptKanji: bundled.jlptKanji, now: app.clock.now(), download,
        discardPendingUploads: pending > 0, tokens,
      });
      await app.reload();
      return msg;
    });
    if (text !== undefined) setNote({ ok: true, text });
  };

  const rejected = status.apiState === 'API_KEY_REJECTED';

  return (
    <div className="kk-server">
      <Panel title="Server mode">
        <p className="kk-server-text" data-testid="server-status-message">{serverStatusMessage(base, status.pending)}</p>
        {status.banner && (
          <div className="kk-banner error" role="alert" data-testid="server-banner">
            <span className="kk-banner-text">{status.banner.text}</span>
          </div>
        )}
        <dl className="kk-dl" data-testid="server-info">
          <dt>Account</dt><dd>{status.username ?? '—'}</dd>
          <dt>Last sync</dt><dd data-testid="server-last-sync">{status.lastSyncAt > 0 ? dateTime(status.lastSyncAt) : 'Never'}</dd>
          <dt>Unsent</dt><dd data-testid="server-pending">{status.pending}</dd>
          {status.lastError && status.apiState === 'ERROR' && <><dt>Error</dt><dd>{status.lastError}</dd></>}
        </dl>
        {(status.syncing || busy !== null) && <p className="kk-muted" role="status" data-testid="server-busy">{busy ?? 'Syncing…'}</p>}
        {note && <div className={`kk-banner ${note.ok ? 'ok' : 'error'}`} role="status" data-testid="server-note"><span className="kk-banner-text">{note.text}</span></div>}
        <div className="kk-btn-row">
          <button type="button" className="kk-btn small" onClick={() => void onSync()} disabled={busy !== null || rejected} data-testid="server-sync-now">Sync now</button>
          <button type="button" className="kk-btn small secondary" onClick={() => void onAskLocal()} disabled={busy !== null} data-testid="server-to-local">Switch to local mode</button>
        </div>
      </Panel>

      {rejected && (
        <Panel title="New API token">
          <p className="kk-server-text">{`${label} rejected the token. Unsent answers are kept; paste a new token to send them.`}</p>
          <input className="kk-input kk-input-block" type="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off"
            placeholder="API token for this server" aria-label="New API token" value={newToken}
            onChange={(e) => setNewToken(e.currentTarget.value)} disabled={busy !== null} data-testid="server-new-token" />
          <div className="kk-btn-row">
            <button type="button" className="kk-btn small" onClick={() => void onNewToken()} disabled={busy !== null || newToken.trim() === ''}
              data-testid="server-new-token-save">Use this token</button>
          </div>
        </Panel>
      )}

      <MessageDialog dialog={dialog} onClose={() => setDialog(null)} />

      <ChoiceDialog open={dialog?.kind === 'askLocal'} title="Switch to local mode?" testId="dialog-ask-local"
        onCancel={() => setDialog(null)}
        actions={dialog?.kind === 'askLocal' ? [
          { label: 'Cancel', secondary: true, onClick: () => setDialog(null) },
          ...(dialog.pending > 0 ? [{ label: 'Send now', secondary: true, onClick: () => void onSendNow() }] : []),
          { label: 'Start at level 1', secondary: true, danger: dialog.pending > 0, onClick: () => void toLocal(false, dialog.pending) },
          { label: 'Bring progress', danger: dialog.pending > 0, onClick: () => void toLocal(true, dialog.pending) },
        ] : []}>
        {dialog?.kind === 'askLocal' && <p className="kk-server-text" data-testid="ask-local-text">{switchToLocalQuestion(dialog.base, dialog.pending)}</p>}
      </ChoiceDialog>
    </div>
  );
}

