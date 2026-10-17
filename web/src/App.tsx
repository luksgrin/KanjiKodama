import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPlatform, type Platform } from './platform';
import { loadContent, type LoadTimings } from './content/contentDb';
import type { KanjiSubject } from './content/subject';
import { checkAnswer, primaryAnswer, acceptedAnswers, type QuestionKind } from './content/answer';
import { toHiragana } from './kana/kanaConverter';
import { db, applyAnswer, emptyProgress, getMeta, setMeta, type SubjectProgress } from './storage/db';
import { describeProgressFile, exportProgress, parseProgressFile, restoreProgress } from './progress/progressFile';
import { AnswerInput } from './AnswerInput';

interface LaunchInfo { count: number; firstAt: number; lastBuild: string | undefined }
interface PersistInfo { granted: boolean; usage?: number; quota?: number }
type Result = { correct: boolean; answer: string } | null;

const ms = (n: number) => `${Math.round(n)} ms`;
const mb = (n: number | undefined) => (n === undefined ? '?' : `${(n / 1e6).toFixed(1)} MB`);

export function App() {
  const [platform, setPlatform] = useState<Platform>();
  const [subjects, setSubjects] = useState<KanjiSubject[]>([]);
  const [contentError, setContentError] = useState<string>();
  const [cold, setCold] = useState<LoadTimings>();
  const [warm, setWarm] = useState<LoadTimings>();
  const [history, setHistory] = useState<LoadTimings[]>([]);
  const [persist, setPersist] = useState<PersistInfo>();
  const [launch, setLaunch] = useState<LaunchInfo>();

  const [index, setIndex] = useState(0);
  const [kind, setKind] = useState<QuestionKind>('meaning');
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<Result>(null);
  const [progress, setProgress] = useState<SubjectProgress>();
  const [imeLog, setImeLog] = useState<string[]>([]);
  const [notifStatus, setNotifStatus] = useState('');
  const [fileStatus, setFileStatus] = useState('');

  const subject = subjects[index];

  // The export text is prepared ahead of the tap: iOS only allows navigator.share() while the
  // tap's user activation is still live, so Save must not await IndexedDB first.
  const exportText = useRef<string | undefined>(undefined);
  const refreshExport = useCallback(async () => {
    exportText.current = await exportProgress(db);
  }, []);
  useEffect(() => { void refreshExport(); }, [refreshExport]);

  // Boot: platform, persistence, launch counter, content DB.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await getPlatform();
      if (cancelled) return;
      setPlatform(p);
      const granted = await p.storage.persist().catch(() => false);
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      setPersist({ granted, usage: est?.usage, quota: est?.quota });

      const count = ((await getMeta<number>('launchCount')) ?? 0) + 1;
      const firstAt = (await getMeta<number>('firstLaunchAt')) ?? Date.now();
      const lastBuild = await getMeta<string>('lastBuild');
      await setMeta('launchCount', count);
      await setMeta('firstLaunchAt', firstAt);
      await setMeta('lastBuild', __BUILD_TIME__);
      setLaunch({ count, firstAt, lastBuild });
      const pos = await getMeta<{ index: number; kind: QuestionKind }>('position');
      if (pos) { setIndex(pos.index); setKind(pos.kind); }

      try {
        const { timings, kanji } = await loadContent();
        if (cancelled) return;
        setCold(timings);
        setSubjects(kanji);
        const prev = (await getMeta<LoadTimings[]>('loadHistory')) ?? [];
        setHistory(prev);
        await setMeta('loadHistory', [timings, ...prev].slice(0, 5));
      } catch (e) {
        setContentError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshProgress = useCallback(async () => {
    if (!subject) return;
    setProgress((await db.progress.get(subject.id)) ?? emptyProgress(subject.id));
  }, [subject]);
  useEffect(() => { void refreshProgress(); }, [refreshProgress]);

  const finished = result !== null;

  const submit = async (dontKnow: boolean) => {
    if (!subject || finished) return;
    const typed = kind === 'reading' ? toHiragana(answer.trim()) : answer.trim();
    if (!dontKnow && typed === '') return;
    const correct = !dontKnow && checkAnswer(subject, kind, typed);
    setResult({ correct, answer: dontKnow ? '' : typed });
    const current = (await db.progress.get(subject.id)) ?? emptyProgress(subject.id);
    const next = applyAnswer(current, kind, correct, dontKnow ? "(don't know)" : typed);
    await db.progress.put(next);
    setProgress(next);
    void refreshExport();
  };

  const next = async () => {
    if (subjects.length === 0) return;
    const nextKind: QuestionKind = kind === 'meaning' ? 'reading' : 'meaning';
    const nextIndex = kind === 'reading' ? (index + 1) % subjects.length : index;
    setKind(nextKind);
    setIndex(nextIndex);
    setResult(null);
    await setMeta('position', { index: nextIndex, kind: nextKind });
  };

  const remeasure = async () => {
    try {
      const { timings } = await loadContent();
      setWarm(timings);
    } catch (e) {
      setContentError(e instanceof Error ? e.message : String(e));
    }
  };

  const scheduleNotification = async () => {
    if (!platform) return;
    if (!platform.notifications.supported) { setNotifStatus('unsupported on this platform'); return; }
    try {
      const ok = await platform.notifications.requestPermission();
      if (!ok) { setNotifStatus('permission denied'); return; }
      const at = new Date(Date.now() + 60_000);
      await platform.notifications.schedule(at, 'KanjiKodama', 'Reviews are waiting (spike test)');
      setNotifStatus(`scheduled for ${at.toLocaleTimeString()}`);
    } catch (e) {
      setNotifStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const cancelNotifications = async () => {
    if (!platform) return;
    try {
      await platform.notifications.cancelAll();
      setNotifStatus(platform.notifications.supported ? 'all cancelled' : 'unsupported on this platform');
    } catch (e) {
      setNotifStatus(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const saveProgress = async () => {
    if (!platform) return;
    try {
      const cachedText = exportText.current;
      // Synchronous re-stamp keeps exportedAt accurate without losing the user activation.
      const text = cachedText !== undefined
        ? JSON.stringify({ ...(JSON.parse(cachedText) as object), exportedAt: Date.now() })
        : await exportProgress(db);
      const stamp = new Date().toISOString().slice(0, 10);
      await platform.files.saveText(`kanjikodama-progress-${stamp}.json`, text);
      setFileStatus(`saved (${text.length} bytes)`);
    } catch (e) {
      setFileStatus(`save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const loadProgress = async () => {
    if (!platform) return;
    try {
      const text = await platform.files.openText();
      if (text === null) { setFileStatus('load cancelled'); return; }
      const file = parseProgressFile(text); // throws before anything is written
      await restoreProgress(db, file);
      await refreshProgress();
      void refreshExport();
      setFileStatus(`loaded: ${describeProgressFile(file)}`);
    } catch (e) {
      setFileStatus(`load rejected, nothing changed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const standalone = useMemo(
    () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    [],
  );

  return (
    <main className="app">
      <section className={`card ${kind}`} aria-label="Review card">
        <div className="kanji" lang="ja">{subject?.characters ?? (contentError ? '✕' : '…')}</div>
        <div className={`qtype qtype-${kind}`}>Kanji {kind === 'meaning' ? 'Meaning' : 'Reading'}</div>
        <AnswerInput
          reading={kind === 'reading'}
          disabled={finished || !subject}
          questionKey={`${index}-${kind}`}
          onChange={setAnswer}
          onEnter={() => void (finished ? next() : submit(false))}
          onImeEvent={(t) => setImeLog((l) => [t, ...l].slice(0, 4))}
        />
        <div className="actions">
          <button type="button" className="btn btn-secondary" disabled={finished || !subject} onClick={() => void submit(true)}>
            Don&apos;t know
          </button>
          {finished ? (
            <button type="button" className="btn btn-primary" onClick={() => void next()}>Next</button>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!subject} onClick={() => void submit(false)}>Submit</button>
          )}
        </div>
        <div className="feedback" role="status" aria-live="polite">
          {result && subject && (
            result.correct
              ? <span className="ok">Correct</span>
              : <span className="bad">Answer: {acceptedAnswers(subject, kind).join(', ') || primaryAnswer(subject, kind)}</span>
          )}
        </div>
      </section>

      <section className="panel" aria-label="Stored progress">
        <h2>Stored progress (IndexedDB)</h2>
        {progress ? (
          <dl>
            <dt>Subject</dt><dd>{subject?.characters} #{progress.id}</dd>
            <dt>srsStage</dt><dd data-testid="srsStage">{progress.srsStage}</dd>
            <dt>Times answered</dt><dd data-testid="timesAnswered">{progress.timesAnswered ?? 0}</dd>
            <dt>Last answer</dt><dd>{progress.lastAnswer ?? '-'}</dd>
            <dt>Meaning ✓/✗</dt><dd>{progress.meaningCorrect}/{progress.meaningIncorrect}</dd>
            <dt>Reading ✓/✗</dt><dd>{progress.readingCorrect}/{progress.readingIncorrect}</dd>
          </dl>
        ) : <p>-</p>}
      </section>

      <section className="panel" aria-label="Spike diagnostics">
        <h2>Spike diagnostics</h2>
        <dl>
          <dt>Platform</dt><dd data-testid="platform">{platform?.name ?? '…'}{standalone ? ' (standalone)' : ''}</dd>
          <dt>Build</dt><dd>{__BUILD_TIME__}{launch?.lastBuild && launch.lastBuild !== __BUILD_TIME__ ? ` (updated from ${launch.lastBuild})` : ''}</dd>
          <dt>Launches</dt><dd>{launch ? `${launch.count} since ${new Date(launch.firstAt).toLocaleString()}` : '…'}</dd>
          <dt>Persistent storage</dt>
          <dd data-testid="persist">{persist ? `${persist.granted ? 'granted' : 'NOT granted'} (used ${mb(persist.usage)} of ${mb(persist.quota)})` : '…'}</dd>
          <dt>Content DB</dt>
          <dd>{contentError ? <span className="bad">{contentError}</span> : cold ? `${mb(cold.bytes)}, ${subjects.length} level-1 kanji` : 'loading…'}</dd>
          <dt>DB load cold</dt>
          <dd aria-label="DB load ms cold" data-testid="load-cold">{cold ? timingText(cold) : '…'}</dd>
          <dt>DB load warm</dt>
          <dd aria-label="DB load ms warm" data-testid="load-warm">{warm ? timingText(warm) : 'tap Re-measure'}</dd>
          <dt>Previous launches</dt>
          <dd>{history.length ? history.map((h) => `${ms(h.totalMs)} (${h.source})`).join(', ') : 'none yet'}</dd>
          <dt>IME events</dt><dd lang="ja">{imeLog.length ? imeLog.join(' · ') : 'none'}</dd>
          <dt>Notification</dt>
          <dd data-testid="notif">{platform ? (platform.notifications.supported ? notifStatus || 'supported' : notifStatus || 'unsupported') : '…'}</dd>
          <dt>Progress file</dt><dd data-testid="file-status">{fileStatus || '-'}</dd>
        </dl>
        <div className="diag-buttons">
          <button type="button" className="btn" onClick={() => void remeasure()}>Re-measure DB load</button>
          <button type="button" className="btn" onClick={() => void scheduleNotification()}>Schedule notification (1 min)</button>
          <button type="button" className="btn" onClick={() => void cancelNotifications()}>Cancel notifications</button>
          <button type="button" className="btn" onClick={() => void saveProgress()}>Save progress</button>
          <button type="button" className="btn" onClick={() => void loadProgress()}>Load progress</button>
        </div>
        <p className="small">Font: Zen Maru Gothic, SIL OFL 1.1 (<a href="./licenses/OFL-zenmarugothic.txt">license</a>).</p>
      </section>
    </main>
  );
}

function timingText(t: LoadTimings): string {
  return `total ${ms(t.totalMs)} = wasm ${ms(t.wasmMs)} + fetch ${ms(t.fetchMs)} (${t.source}) + open ${ms(t.openMs)} + query ${ms(t.queryMs)}`;
}
