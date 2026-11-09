/**
 * About: toolbar "About KanjiKodama", then one text document with 8 px padding, links in the accent
 * colour: credits, this build's components and fonts, install steps (web build), known limitations,
 * version and storage.
 */
import { Fragment, useEffect, useState } from 'react';
import { dateTime, megabytes } from '../../../app/format';
import { useReady } from '../../hooks/useApp';
import { useToolbar } from '../../shell/toolbar';
import { KnownLimitations } from '../settings/KnownLimitations';
import { InstallSection } from './InstallHint';
import { KeyboardDiagnosticsSection, useDiagnosticsTaps } from './KeyboardDiagnostics';
import './about.css';

const BASE = import.meta.env.BASE_URL;

const FONTS: readonly { name: string; url: string; author: string; license: string }[] = [
  { name: 'Silkscreen', url: 'https://fonts.google.com/specimen/Silkscreen', author: 'Jason Kottke', license: 'licenses/OFL-silkscreen.txt' },
  { name: 'Pixelify Sans', url: 'https://fonts.google.com/specimen/Pixelify+Sans', author: 'Stefie Justprince', license: 'licenses/OFL-pixelifysans.txt' },
  { name: 'DotGothic16', url: 'https://fonts.google.com/specimen/DotGothic16', author: 'Fontworks Inc.', license: 'licenses/OFL-dotgothic16.txt' },
  { name: 'Zen Maru Gothic', url: 'https://fonts.google.com/specimen/Zen+Maru+Gothic', author: 'Yoshimichi Ohira', license: 'licenses/OFL-zenmarugothic.txt' },
];

const COMPONENTS: readonly { name: string; url: string; license: string }[] = [
  { name: 'React', url: 'https://react.dev/', license: 'MIT' },
  { name: 'Dexie.js', url: 'https://dexie.org/', license: 'Apache License 2.0' },
  { name: 'sql.js', url: 'https://github.com/sql-js/sql.js', license: 'MIT' },
  { name: 'Workbox', url: 'https://developer.chrome.com/docs/workbox', license: 'MIT' },
  { name: 'Capacitor', url: 'https://capacitorjs.com/', license: 'MIT' },
];

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

function StorageInfo() {
  const { state, platform } = useReady();
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    let live = true;
    platform.storage.estimate().then((e) => { if (live) setEstimate(e); }, () => undefined);
    return () => { live = false; };
  }, [platform, state.revision]);
  const p = state.persistence;
  return (
    <dl className="kk-dl" data-testid="storage-info">
      <dt>Persistent storage</dt>
      <dd>
        {p === null ? 'Checking…' : p.persisted ? 'Yes' : 'No (the system may clear it)'}
        {p?.error ? ` (${p.error})` : ''}
      </dd>
      {p && <><dt>Checked</dt><dd>{dateTime(p.checkedAt)}</dd></>}
      {estimate && <><dt>Used</dt><dd>{megabytes(estimate.usage)} of {megabytes(estimate.quota)}</dd></>}
    </dl>
  );
}

/** The text with a line-break opportunity after every "/", as Android's line breaker has in URLs. */
function breakAfterSlashes(text: string) {
  return text.split('/').map((part, i, all) => (i < all.length - 1 ? <Fragment key={i}>{part}/<wbr /></Fragment> : part));
}

export function AboutScreen() {
  const { platform, content } = useReady();
  useToolbar({ title: 'About KanjiKodama' });
  const m = content.manifest;
  const wkContent = m === null || m.variant !== 'public';
  // Hidden: seven taps on the version turn the keyboard diagnostics on or off.
  const onVersionTap = useDiagnosticsTaps();
  return (
    <div className="kk-about" data-testid="about">
      <h3 data-testid="about-title">KanjiKodama (<span lang="ja">漢字木霊</span>) {__APP_VERSION__}</h3>
      <p>
        KanjiKodama is a personal, offline kanji learning app, made by <b>luksgrin</b>{' '}
        (<a href="https://github.com/luksgrin/KanjiKodama" {...ext}>{breakAfterSlashes('github.com/luksgrin/KanjiKodama')}</a>).
      </p>
      <p>
        <b>Infinite thanks to <a href="https://github.com/jerryhcooke/smouldering_durtles" {...ext}>Smouldering Durtles</a></b>,
        the app KanjiKodama was forked off. Almost everything you see here, from the SRS engine to the lesson and review
        screens, is their work. Smouldering Durtles was re-coded by Jerry Cooke (known as Joeni), based on{' '}
        <a href="https://github.com/ejplugge/com.the_tinkering.wk" {...ext}>Flaming Durtles</a> by Ernst Jan Plugge, who wrote
        the original code. Both are released under the Apache License 2.0, and so is this fork. If you enjoy it, consider{' '}
        <a href="https://ko-fi.com/jerrycooke" {...ext}>supporting Jerry</a>.
      </p>
      <p>
        KanjiKodama adds a pixel forest look, offline lessons, local level-ups, and parts and sound notes that show how
        phonetic components predict on&apos;yomi readings.
      </p>
      {wkContent && (
        <p data-testid="about-wanikani">
          Lesson content is from <a href="https://www.wanikani.com/" {...ext}>WaniKani</a> by{' '}
          <a href="https://www.tofugu.com/" {...ext}>Tofugu</a>, used with permission for personal use only. KanjiKodama is
          not supported by, affiliated with, or endorsed by Tofugu.
        </p>
      )}
      <p>
        Kanji component and reading data comes from <a href="https://www.edrdg.org/" {...ext}>EDRDG</a> (KANJIDIC2,
        KRADFILE, JMdict; CC BY-SA 4.0) and stroke diagrams from{' '}
        <a href="https://github.com/KanjiVG/kanjivg" {...ext}>KanjiVG</a> (CC BY-SA 3.0).
      </p>
      <p className="kk-about-list-head">This app uses these Open Source components:</p>
      <ul data-testid="about-components">
        {COMPONENTS.map((c) => <li key={c.name}><a href={c.url} {...ext}>{c.name}</a> ({c.license})</li>)}
      </ul>
      <p className="kk-about-list-head">Smouldering Durtles was heavily influenced by:</p>
      <ul>
        <li><a href="https://community.wanikani.com/t/ios-tsurukame-native-app-with-offline-lessons-and-reviews/30635" {...ext}>Tsurukame</a></li>
        <li><a href="https://community.wanikani.com/c/wanikani/api-and-third-party-apps" {...ext}>The WaniKani Developer Community</a></li>
      </ul>
      <p className="kk-about-list-head">Fonts:</p>
      <ul data-testid="about-fonts">
        {FONTS.map((f) => (
          <li key={f.name}>
            <a href={f.url} {...ext}>{f.name}</a> by {f.author} (SIL Open Font License 1.1, <a href={`${BASE}${f.license}`} {...ext}>license</a>)
          </li>
        ))}
      </ul>

      <InstallSection />

      <h4>Known limitations</h4>
      <KnownLimitations capabilities={platform.capabilities} />

      <h4>Version</h4>
      <dl className="kk-dl" data-testid="about-version">
        <dt>App</dt><dd onClick={onVersionTap} data-testid="about-app-version">{__APP_VERSION__}</dd>
        <dt>Built</dt><dd>{dateTime(Date.parse(__BUILD_TIME__))}</dd>
        {m && <><dt>Content</dt><dd>{m.variant}, {m.sha256.slice(0, 12)}</dd></>}
      </dl>
      <h4>Storage</h4>
      <StorageInfo />
      <KeyboardDiagnosticsSection />
    </div>
  );
}
