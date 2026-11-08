/**
 * The running audio download, outside React: it keeps going when the learner leaves the screen
 * and the screen shows it again on return. One download at a time.
 */
import type { AudioApi, AudioDownloadResult } from '../../../platform';

export interface DownloadState {
  active: boolean;
  /** Levels being downloaded. */
  levels: number[];
  done: number;
  total: number;
  last: AudioDownloadResult | null;
  error: string | null;
}

const IDLE: DownloadState = { active: false, levels: [], done: 0, total: 0, last: null, error: null };

export interface AudioDownloads {
  get(): DownloadState;
  subscribe(cb: () => void): () => void;
  start(api: AudioApi, levels: number[]): Promise<void>;
  cancel(): void;
}

export function createAudioDownloads(): AudioDownloads {
  let state = IDLE;
  let ctrl: AbortController | null = null;
  const listeners = new Set<() => void>();
  const set = (s: Partial<DownloadState>) => {
    state = { ...state, ...s };
    for (const cb of listeners) cb();
  };
  return {
    get: () => state,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async start(api, levels) {
      if (state.active) return;
      ctrl = new AbortController();
      set({ active: true, levels, done: 0, total: 0, last: null, error: null });
      try {
        const last = await api.download(levels, (done, total) => set({ done, total }), ctrl.signal);
        set({ active: false, last });
      } catch (e) {
        set({ active: false, error: e instanceof Error ? e.message : String(e) });
      } finally {
        ctrl = null;
      }
    },
    cancel() {
      ctrl?.abort();
    },
  };
}

export const audioDownloads = createAudioDownloads();
