/**
 * The headline's audio button (`SubjectInfoHeadlineView` buttons column, `audio_button`): a flat grey
 * chip with the speaker icon and the vocabulary's characters ("🔊 電源"). `onPlay` returns false when
 * nothing played; the hint ("No audio" / "Offline") then shows under the button.
 */
import { useState } from 'react';
import { Icon } from '../Icon';

export function AudioButton({ label, onPlay }: { label: string; onPlay(): Promise<boolean> }) {
  const [hint, setHint] = useState<string | null>(null);
  const play = async () => {
    setHint(null);
    let ok = false;
    try {
      ok = await onPlay();
    } catch {
      ok = false;
    }
    if (!ok) setHint(typeof navigator !== 'undefined' && navigator.onLine === false ? 'Offline' : 'No audio');
  };
  return (
    <>
      <button type="button" className="kk-audio-btn" aria-label="Play audio" data-testid="audio-button" onClick={() => void play()}>
        <Icon name="volume" />
        <span lang="ja">{label}</span>
      </button>
      {hint !== null && <span className="kk-audio-hint" role="status">{hint}</span>}
    </>
  );
}
