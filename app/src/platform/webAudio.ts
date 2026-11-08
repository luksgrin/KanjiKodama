/**
 * Pronunciation audio on the web build (owner decision, open question 9): streamed from WaniKani's
 * audio URL with a plain <audio> element. No fetch, so no CORS; nothing is downloaded or cached, so
 * it only plays while online (offline: `play` resolves false and the UI shows nothing). Same
 * recording choice as Android (core `chooseAudio` with nothing cached). Downloads, status and
 * deleting are Android only (`capabilities.audioDownload`).
 */
import { chooseAudio, type AudioCatalog, type VoicePreference } from '../core/audio';
import { SeededRandom, type Rng } from '../core/rng';
import type { AudioApi } from './index';

export interface WebAudioOptions {
  /** Creates the element; tests pass a fake. */
  createAudio?: (src: string) => Pick<HTMLAudioElement, 'play' | 'pause'>;
  online?: () => boolean;
  rng?: Pick<Rng, 'nextInt'>;
}

const NOTHING_CACHED: ReadonlyMap<number, ReadonlySet<string>> = new Map();

export function createWebAudio(options: WebAudioOptions = {}): AudioApi {
  const createAudio = options.createAudio ?? ((src: string) => new Audio(src));
  const online = options.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const rng = options.rng ?? new SeededRandom(Date.now());
  let catalog: AudioCatalog | null = null;
  let current: Pick<HTMLAudioElement, 'play' | 'pause'> | null = null;
  let lastWasMale = false;
  const unsupported = () => Promise.reject(new Error('Audio downloads are not supported in the web build'));

  return {
    supported: true,
    setCatalog(c) {
      catalog = c;
    },
    async play(subjectId: number, pref: VoicePreference, reading: string | null = null) {
      if (!online()) return false;
      const owner = catalog?.owner(subjectId) ?? null;
      if (owner === null) return false;
      const choice = chooseAudio(owner, reading, pref, lastWasMale, NOTHING_CACHED, rng);
      if (choice === null) return false;
      lastWasMale = choice.audio.gender === 'male';
      try {
        current?.pause();
        const el = createAudio(choice.audio.url);
        current = el;
        await el.play();
        return true;
      } catch {
        return false;
      }
    },
    download: unsupported,
    status: () => Promise.resolve({ levels: [], files: 0, bytes: 0 }),
    deleteAll: () => Promise.resolve(),
  };
}

export const webAudio: AudioApi = createWebAudio();
