/**
 * Settings (skeleton): progress save/restore, appearance, links to the other settings screens,
 * storage, version and the known limitations of this build. More rows come with their screens.
 */
import { useEffect, useState } from 'react';
import { dateTime, megabytes } from '../../../app/format';
import { THEME_PREF_KEY, applyTheme, parseThemeChoice, type ThemeChoice } from '../../../app/theme';
import { Panel } from '../../components/Panel';
import { useApp, useReady } from '../../hooks/useApp';
import { paths } from '../../routes';
import { KnownLimitations } from './KnownLimitations';
import { ProgressSection } from './ProgressSection';

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

function LinksSection() {
  const { platform } = useReady();
  const links: { href: string; title: string; sub: string }[] = [
    { href: paths.curriculum(), title: 'Curriculum order', sub: 'WaniKani or JLPT order' },
    { href: paths.fastTravel(), title: 'Fast travel', sub: 'Jump ahead to a level' },
    { href: paths.levelTest(), title: 'Level test', sub: 'Find your level' },
    { href: paths.import(), title: 'WaniKani import', sub: 'Bring your WaniKani progress' },
    { href: paths.server(), title: 'Server', sub: 'Sync with WaniKani or OpenKani' },
    ...(platform.capabilities.audio ? [{ href: paths.audio(), title: 'Audio', sub: 'Download pronunciation audio' }] : []),
    { href: paths.about(), title: 'About', sub: 'Licenses and credits' },
  ];
  return (
    <Panel title="More">
      <ul className="kk-rows">
        {links.map((l) => (
          <li key={l.href}>
            <a className="kk-row" href={`#${l.href}`}>
              <span className="kk-row-main">
                <span className="kk-row-title">{l.title}</span>
                <span className="kk-row-sub">{l.sub}</span>
              </span>
              <span aria-hidden>›</span>
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
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
  return (
    <div className="kk-settings">
      <ProgressSection />
      <ThemeSection />
      <LinksSection />
      <StorageSection />
      <VersionSection />
      <Panel title="Known limitations">
        <KnownLimitations capabilities={platform.capabilities} />
      </Panel>
    </div>
  );
}
