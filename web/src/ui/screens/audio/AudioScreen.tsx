/**
 * Audio download (`activities/DownloadAudioActivity`, `views/DownloadAudioBracketView`): levels in
 * brackets of ten with what is on the device, a Download button per bracket, Abort while
 * downloading, Delete all audio, in the Java layout (`activity_download_audio.xml`: header text,
 * "Active downloads", the buttons, then per bracket "Levels 1-10" and a Download button with its
 * label). The voice preference is in Settings → Audio settings, as in Java. Android only
 * (`capabilities.audioDownload`); the web build streams audio while online and has nothing to download.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { megabytes } from '../../../app/format';
import type { AudioCacheStatus } from '../../../platform';
import { useReady } from '../../hooks/useApp';
import { useToolbar } from '../../shell/toolbar';
import { AlertDialog } from '../settings/AlertDialog';
import { audioDownloads } from './audioDownloads';
import './audio.css';

/** `DownloadAudioActivity.updateOverviewDisplay`. */
export const AUDIO_HEADER = 'You can download vocabulary audio here, which will be played during lessons and reviews.'
  + ' Once started, downloads will continue in the background.';

/** `Constants.DELETE_AUDIO_WARNING` without the markup. */
export const DELETE_AUDIO_WARNING = 'Warning: This will delete all audio files that have been downloaded so far.\n\nAre you sure you want to continue?';

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
  const { platform } = useReady();
  const audio = platform.audio;
  const dl = useSyncExternalStore(audioDownloads.subscribe, audioDownloads.get, audioDownloads.get);
  const [status, setStatus] = useState<AudioCacheStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useToolbar({ title: 'Download audio' });

  const refresh = useCallback(() => {
    audio.status().then(setStatus, () => setStatus({ levels: [], files: 0, bytes: 0 }));
  }, [audio]);
  // Re-read after each finished file batch and when a download ends.
  useEffect(() => { refresh(); }, [refresh, dl.active, Math.floor(dl.done / 25)]);

  if (!platform.capabilities.audioDownload) {
    return (
      <div className="kk-audio">
        <p data-testid="audio-unsupported">Audio plays streamed while online in this build. Downloading audio for offline use needs the Android app.</p>
      </div>
    );
  }

  const remaining = dl.active ? Math.max(0, dl.total - dl.done) : 0;
  const del = () => {
    setConfirmDelete(false);
    setDeleting(true);
    audio.deleteAll().catch(() => undefined).finally(() => {
      setDeleting(false);
      refresh();
    });
  };

  return (
    <div className="kk-audio">
      <p className="kk-audio-text">{AUDIO_HEADER}</p>
      <p className="kk-audio-large" data-testid="audio-active">{`Active downloads: ${remaining}`}</p>
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
      <div className="kk-audio-buttons">
        {dl.active
          ? <button type="button" className="kk-btn" onClick={() => audioDownloads.cancel()} data-testid="audio-abort">Abort</button>
          : <button type="button" className="kk-btn" onClick={() => setConfirmDelete(true)} disabled={deleting} data-testid="audio-delete">Delete all audio</button>}
      </div>
      <p className="kk-small" data-testid="audio-total">{status ? `${status.files} files, ${megabytes(status.bytes)} on this device` : 'Checking…'}</p>

      <ul className="kk-audio-brackets" data-testid="audio-brackets">
        {(status ? brackets(status) : []).map((b) => {
          const finished = b.expected > 0 && b.files >= b.expected;
          return (
            <li key={b.min} data-testid={`bracket-${b.min}`}>
              <p className="kk-audio-large">{`Levels ${b.min}-${b.max}`}</p>
              <div className="kk-audio-bracket-row">
                <button type="button" className="kk-btn" disabled={dl.active || finished || b.expected === 0}
                  onClick={() => void audioDownloads.start(audio, Array.from({ length: 10 }, (_, i) => b.min + i))}>Download</button>
                <span>{bracketLabel(b)}{b.bytes > 0 ? `, ${megabytes(b.bytes)}` : ''}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={confirmDelete} warning title="Delete all audio?" message={DELETE_AUDIO_WARNING} testId="dialog-delete-audio"
        onCancel={() => setConfirmDelete(false)}
        negative={{ label: 'No', onClick: () => setConfirmDelete(false) }}
        positive={{ label: 'Yes', onClick: del }} />
    </div>
  );
}
