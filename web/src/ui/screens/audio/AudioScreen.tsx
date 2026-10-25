/**
 * Audio download (`activities/DownloadAudioActivity`, `views/DownloadAudioBracketView`): levels in
 * brackets of ten with what is on the device, a Download button per bracket, Abort while
 * downloading, Delete all audio, and the voice preference. Android only (`capabilities.audioDownload`);
 * the web build streams audio while online and has nothing to download.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { megabytes } from '../../../app/format';
import { VOICE_PREFERENCES, voicePreference, type VoicePreference } from '../../../core/audio';
import type { AudioCacheStatus } from '../../../platform';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Panel } from '../../components/Panel';
import { useApp, useReady } from '../../hooks/useApp';
import { audioDownloads } from './audioDownloads';
import './audio.css';

/** `DownloadAudioActivity.updateOverviewDisplay`. */
export const AUDIO_HEADER = 'You can download vocabulary audio here, which will be played during lessons and reviews.'
  + ' Once started, downloads will continue in the background.';

/** `Constants.DELETE_AUDIO_WARNING` without the markup. */
export const DELETE_AUDIO_WARNING = 'Warning: This will delete all audio files that have been downloaded so far.\n\nAre you sure you want to continue?';

/** `res/values/array.xml` voicePreferences ("Femminine" in Java, spelled right here). */
export const VOICE_LABELS: Readonly<Record<VoicePreference, string>> = {
  RANDOM: 'Random',
  MALE: 'Masculine',
  FEMALE: 'Feminine',
  ALTERNATE: 'Alternate between voices',
};

export interface Bracket {
  min: number;
  max: number;
  files: number;
  bytes: number;
  expected: number;
}

/** `updateOverviewDisplay`: brackets of ten levels, at least up to 60. */
export function brackets(status: AudioCacheStatus): Bracket[] {
  const top = Math.max(60, ...status.levels.map((l) => l.level));
  const out: Bracket[] = [];
  for (let min = 1; min <= top; min += 10) {
    const b: Bracket = { min, max: min + 9, files: 0, bytes: 0, expected: 0 };
    for (const l of status.levels) {
      if (l.level < min || l.level > b.max) continue;
      b.files += l.files;
      b.bytes += l.bytes;
      b.expected += l.expected ?? 0;
    }
    out.push(b);
  }
  return out;
}

/** `DownloadAudioBracketView.setBracket`'s label (files instead of subjects). */
export function bracketLabel(b: Bracket): string {
  if (b.expected > 0 && b.files >= b.expected) return 'Download finished';
  return `${Math.min(b.files, b.expected)}/${b.expected} available`;
}

export function AudioScreen() {
  const app = useApp();
  const { platform, state } = useReady();
  const audio = platform.audio;
  const dl = useSyncExternalStore(audioDownloads.subscribe, audioDownloads.get, audioDownloads.get);
  const [status, setStatus] = useState<AudioCacheStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(() => {
    audio.status().then(setStatus, () => setStatus({ levels: [], files: 0, bytes: 0 }));
  }, [audio]);
  // Re-read after each finished file batch and when a download ends.
  useEffect(() => { refresh(); }, [refresh, dl.active, Math.floor(dl.done / 25)]);

  if (!platform.capabilities.audioDownload) {
    return (
      <Panel title="Audio download">
        <p data-testid="audio-unsupported">Audio plays streamed while online in this build. Downloading audio for offline use needs the Android app.</p>
      </Panel>
    );
  }

  const pref = voicePreference(state.prefs);
  const remaining = dl.active ? Math.max(0, dl.total - dl.done) : 0;

  return (
    <div className="kk-audio">
      <Panel title="Audio download">
        <p className="kk-audio-text">{AUDIO_HEADER}</p>
        <p data-testid="audio-active">{`Active downloads: ${remaining}`}</p>
        {dl.active && (
          <progress className="kk-audio-progress" max={Math.max(1, dl.total)} value={dl.done} data-testid="audio-progress"
            aria-label={`Downloading levels ${dl.levels[0] ?? ''}-${dl.levels[dl.levels.length - 1] ?? ''}`} />
        )}
        {!dl.active && dl.last && (dl.last.failed > 0 || dl.last.aborted) && (
          <p className="kk-small" data-testid="audio-last">
            {`${dl.last.downloaded} downloaded${dl.last.failed > 0 ? `, ${dl.last.failed} failed (offline?)` : ''}${dl.last.aborted ? ', aborted' : ''}.`}
          </p>
        )}
        {dl.error && <p className="kk-error-text">{dl.error}</p>}
        <p className="kk-small" data-testid="audio-total">{status ? `${status.files} files, ${megabytes(status.bytes)} on this device` : 'Checking…'}</p>
        <div className="kk-btn-row">
          {dl.active
            ? <button type="button" className="kk-btn small secondary" onClick={() => audioDownloads.cancel()} data-testid="audio-abort">Abort</button>
            : <button type="button" className="kk-btn small danger" onClick={() => setConfirmDelete(true)} disabled={deleting} data-testid="audio-delete">Delete all audio</button>}
        </div>
      </Panel>

      <Panel title="Levels">
        <ul className="kk-rows" data-testid="audio-brackets">
          {(status ? brackets(status) : []).map((b) => {
            const finished = b.expected > 0 && b.files >= b.expected;
            return (
              <li key={b.min} className="kk-row" data-testid={`bracket-${b.min}`}>
                <span className="kk-row-main">
                  <span className="kk-row-title">{`Levels ${b.min}-${b.max}`}</span>
                  <span className="kk-row-sub">{bracketLabel(b)}{b.bytes > 0 ? `, ${megabytes(b.bytes)}` : ''}</span>
                </span>
                <button type="button" className="kk-btn small" disabled={dl.active || finished || b.expected === 0}
                  onClick={() => void audioDownloads.start(audio, Array.from({ length: 10 }, (_, i) => b.min + i))}>Download</button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Voice preference">
        <div className="kk-segmented kk-audio-voices" role="radiogroup" aria-label="Voice preference">
          {VOICE_PREFERENCES.map((v) => (
            <button key={v} type="button" role="radio" aria-checked={pref === v}
              className={`kk-btn small${pref === v ? '' : ' secondary'}`} onClick={() => void app.setPreference('voice_preference', v)}>
              {VOICE_LABELS[v]}
            </button>
          ))}
        </div>
      </Panel>

      <ConfirmDialog open={confirmDelete} title="Delete all audio?" confirmLabel="Yes" cancelLabel="No" danger busy={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setDeleting(true);
          audio.deleteAll().catch(() => undefined).finally(() => {
            setDeleting(false);
            setConfirmDelete(false);
            refresh();
          });
        }}>
        <p className="kk-audio-text">{DELETE_AUDIO_WARNING}</p>
      </ConfirmDialog>
    </div>
  );
}
