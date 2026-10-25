/**
 * Settings: progress save/restore and the progress screens (Java's "Progress" category), the basic
 * settings (`schema.ts` `MAIN_GROUPS`), a link to the Advanced page, appearance, storage, version and
 * the known limitations of this build.
 */
import { useEffect, useState } from 'react';
import { dateTime, megabytes } from '../../../app/format';
import { THEME_PREF_KEY, applyTheme, parseThemeChoice, type ThemeChoice } from '../../../app/theme';
import { CURRICULUM_MODE_LABEL } from '../../../core/curriculum';
import { advancedEnabled } from '../../../core/settings';
import { serverPreferenceSummary } from '../../../core/server';
import type { NotificationPermission } from '../../../platform';
import { ServerStore } from '../../../sync/store';
import { Panel } from '../../components/Panel';
import { useApp, useReady } from '../../hooks/useApp';
import { paths } from '../../routes';
import { InstallHint } from '../about/InstallHint';
import { KnownLimitations } from './KnownLimitations';
import { ProgressSection } from './ProgressSection';
import { MAIN_GROUPS, XML_DEFAULT_DIFFERS_FROM_GETTER, shownValue, type BoolSetting } from './schema';
import { SettingGroupPanel, useSettingWriter } from './SettingRows';
import './settings.css';

const THEMES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function ThemeSection() {
  const app = useApp();
  const { state } = useReady();
  const choice = parseThemeChoice(state.prefs[THEME_PREF_KEY]);
  const pick = (value: ThemeChoice) => {
    applyTheme(value);
    void app.setPreference(THEME_PREF_KEY, value);
  };
  return (
    <Panel title="Appearance">
      <div className="kk-segmented" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t.value} type="button" role="radio" aria-checked={choice === t.value}
            className={`kk-btn small${choice === t.value ? '' : ' secondary'}`} onClick={() => pick(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
    </Panel>
  );
}

interface Link { href: string; title: string; sub: string; testId: string }

function LinkRows({ links }: { links: readonly Link[] }) {
  return (
    <ul className="kk-rows">
      {links.map((l) => (
        <li key={l.href}>
          <a className="kk-row" href={`#${l.href}`} data-testid={l.testId}>
            <span className="kk-row-main">
              <span className="kk-row-title">{l.title}</span>
              <span className="kk-row-sub">{l.sub}</span>
            </span>
            <span aria-hidden>›</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Java's "Progress" category rows that open screens; the local-only ones are hidden in server mode (`LocalMode`). */
function ProgressLinks() {
  const app = useApp();
  const { state, learner } = useReady();
  const local = state.mode !== 'server';
  const [baseUrl, setBaseUrl] = useState('');
  useEffect(() => {
    if (local) return;
    let live = true;
    new ServerStore(app.db).baseUrl().then((b) => { if (live) setBaseUrl(b ?? ''); }, () => undefined);
    return () => { live = false; };
  }, [app, local]);
  const links: Link[] = [
    { href: paths.server(), title: 'Server connection', sub: serverPreferenceSummary(!local, baseUrl), testId: 'link-server' },
    ...(local ? [
      { href: paths.curriculum(), title: 'Curriculum order', sub: `${CURRICULUM_MODE_LABEL[learner.progress.curriculum]}. Tap to switch; progress on every item is kept.`, testId: 'link-curriculum' },
      { href: paths.levelTest(), title: 'Kanji level test', sub: 'Two short quizzes estimate your JLPT kanji level; then you can start there', testId: 'link-level-test' },
      { href: paths.fastTravel(), title: 'Fast travel', sub: 'JLPT order only: jump up to 5 levels ahead and prove what you already know', testId: 'link-fast-travel' },
      { href: paths.import(), title: 'Import progress from WaniKani', sub: "Replace local progress with your WaniKani account's progress, using an API token", testId: 'link-import' },
    ] : []),
  ];
  return <Panel title="Progress screens"><LinkRows links={links} /></Panel>;
}

function MoreLinks() {
  const { platform, state } = useReady();
  const links: Link[] = [
    { href: paths.advancedSettings(), title: 'Advanced settings', sub: advancedEnabled(state.prefs) ? 'On' : 'Off. Only for experienced users!', testId: 'link-advanced' },
    ...(platform.capabilities.audioDownload ? [{ href: paths.audio(), title: 'Audio', sub: 'Download pronunciation audio', testId: 'link-audio' }] : []),
    { href: paths.about(), title: 'About this app', sub: 'Version, licenses and credits', testId: 'link-about' },
  ];
  return <Panel title="More"><LinkRows links={links} /></Panel>;
}

/** `grant_notification_permission`: shown while the permission is not granted (Android 13+). */
function NotificationPermissionRow() {
  const { platform } = useReady();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const api = platform.notifications;
  const supported = platform.capabilities.notifications && api?.supported === true;
  useEffect(() => {
    if (!supported) return;
    let live = true;
    api.permission().then((p) => { if (live) setPermission(p); }, () => undefined);
    return () => { live = false; };
  }, [api, supported]);
  if (!supported || permission === null || permission === 'granted') return null;
  return (
    <Panel>
      <div className="kk-row" data-testid="grant-notification-permission">
        <span className="kk-row-main">
          <span className="kk-row-title">Grant notification permission</span>
          <span className="kk-row-sub">Open system settings to allow this app to send notifications</span>
        </span>
        <button type="button" className="kk-btn small" onClick={() => void api.requestPermission().then((ok) => setPermission(ok ? 'granted' : 'denied'), () => undefined)}>Allow</button>
      </div>
    </Panel>
  );
}

/**
 * AndroidX writes a row's XML default when a settings screen first shows it; for the keys whose
 * getter default differs, do the same so the app then behaves as the screen shows.
 */
function usePersistShownDefaults() {
  const app = useApp();
  useEffect(() => {
    const prefs = app.get().prefs;
    for (const g of MAIN_GROUPS) {
      for (const r of g.rows) {
        if (r.type === 'bool' && XML_DEFAULT_DIFFERS_FROM_GETTER.includes(r.key) && typeof prefs[r.key] !== 'boolean') {
          void app.setPreference(r.key, shownValue(r as BoolSetting, prefs));
        }
      }
    }
  }, [app]);
}

function StorageSection() {
  const { state, platform } = useReady();
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    let live = true;
    platform.storage.estimate().then((e) => { if (live) setEstimate(e); }, () => undefined);
    return () => { live = false; };
  }, [platform, state.revision]);
  const p = state.persistence;
  return (
    <Panel title="Storage">
      <dl className="kk-dl" data-testid="storage-info">
        <dt>Persistent</dt>
        <dd>
          {p === null ? 'Checking…' : p.persisted ? 'Yes' : 'No (the system may clear it)'}
          {p?.error ? ` (${p.error})` : ''}
        </dd>
        {p && <><dt>Checked</dt><dd>{dateTime(p.checkedAt)}</dd></>}
        {estimate && <><dt>Used</dt><dd>{megabytes(estimate.usage)} of {megabytes(estimate.quota)}</dd></>}
      </dl>
    </Panel>
  );
}

function VersionSection() {
  const { content } = useReady();
  const m = content.manifest;
  return (
    <Panel title="Version">
      <dl className="kk-dl" data-testid="version-info">
        <dt>App</dt><dd>{__APP_VERSION__}</dd>
        <dt>Built</dt><dd>{dateTime(Date.parse(__BUILD_TIME__))}</dd>
        {m && <><dt>Content</dt><dd>{m.variant}, {m.sha256.slice(0, 12)}</dd></>}
      </dl>
    </Panel>
  );
}

export function SettingsScreen() {
  const { platform } = useReady();
  const { write, dialog } = useSettingWriter();
  usePersistShownDefaults();
  return (
    <div className="kk-settings">
      <InstallHint />
      <ProgressSection />
      <ProgressLinks />
      <NotificationPermissionRow />
      {MAIN_GROUPS.map((g) => <SettingGroupPanel key={g.id} group={g} write={write} gateAdvanced />)}
      <MoreLinks />
      <ThemeSection />
      <StorageSection />
      <VersionSection />
      <Panel title="Known limitations">
        <KnownLimitations capabilities={platform.capabilities} />
      </Panel>
      {dialog}
    </div>
  );
}
