// Pronunciation audio on Android: native HTTP download (CapacitorHttp: no CORS) into the app's
// files dir, playback from there through the WebView (<audio> with Capacitor.convertFileSrc).
// Decisions (which recording, which files) are pure: core/audio/audio.ts.
//
// Layout as in the Java app's "Internal" location: files/pronunciation-audio/<level>/<sourceId>.mp3
// (<level> is the WaniKani level from the content). Excluded from Android Auto Backup
// (res/xml/backup_rules.xml, data_extraction_rules.xml): it can be downloaded again.
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Filesystem, type FileInfo } from '@capacitor/filesystem';
import {
  AUDIO_DIR,
  cachedNames,
  chooseAudio,
  expectedFilesPerLevel,
  planAudioDownloads,
  type AudioCatalog,
  type AudioDownload,
  type VoicePreference,
} from '../core/audio';
import { JavaRandom, type Rng } from '../core/rng';
import type { AudioApi, AudioCacheStatus, AudioDownloadResult, AudioLevelStatus } from './index';

/** Parallel downloads (the Java app ran one task at a time; ~14 000 small files make that slow). */
const PARALLEL = 4;
const AUDIO_FILE = /^\d+\.(mp3|ogg)$/;

/** What plays a URL; swapped in tests. */
export interface AudioPlayer {
  play(src: string): Promise<void>;
}

let current: HTMLAudioElement | null = null;

export const htmlAudioPlayer: AudioPlayer = {
  async play(src: string): Promise<void> {
    current?.pause();
    const el = new Audio(src);
    current = el;
    await el.play(); // rejects when the source can't load (not cached and offline)
  },
};

/** Exact byte length of base64 text. */
export function base64Bytes(b64: string): number {
  const clean = b64.replace(/\s/g, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - pad;
}

async function listDir(path: string): Promise<FileInfo[]> {
  try {
    return (await Filesystem.readdir({ path, directory: Directory.Data })).files;
  } catch {
    return []; // not created yet
  }
}

async function cachedFor(levels: Iterable<number>): Promise<Map<number, Set<string>>> {
  const out = new Map<number, Set<string>>();
  for (const level of new Set(levels)) {
    const files = await listDir(`${AUDIO_DIR}/${level}`);
    out.set(level, new Set(files.filter((f) => f.type === 'file' && AUDIO_FILE.test(f.name)).map((f) => f.name)));
  }
  return out;
}

async function downloadOne(item: AudioDownload): Promise<number> {
  const res = await CapacitorHttp.request({
    url: item.url,
    method: 'GET',
    responseType: 'blob', // native: base64 text
    connectTimeout: 15_000,
    readTimeout: 30_000,
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const data: unknown = res.data;
  if (typeof data !== 'string' || data === '') throw new Error('empty response');
  const b64 = data.replace(/\s/g, ''); // Android's Base64.DEFAULT wraps lines
  // Write next to the target and rename, so a half-written file never counts as cached
  // (`AudioUtil.getTempFile`; one temp name per file because downloads run in parallel).
  const tmp = `${item.path}.downloading.tmp`;
  await Filesystem.writeFile({ path: tmp, data: b64, directory: Directory.Data, recursive: true });
  await Filesystem.rename({ from: tmp, to: item.path, directory: Directory.Data });
  return base64Bytes(b64);
}

/** Downloads the queue, `PARALLEL` at a time; failures are counted and the rest goes on. */
async function runQueue(queue: readonly AudioDownload[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<AudioDownloadResult> {
  const total = queue.length;
  const result: AudioDownloadResult = { downloaded: 0, failed: 0, bytes: 0, aborted: false };
  let done = 0;
  let next = 0;
  onProgress?.(0, total);
  const worker = async (): Promise<void> => {
    while (next < total && signal?.aborted !== true) {
      const item = queue[next++]!;
      try {
        const bytes = await downloadOne(item); // not `+= await`: workers interleave
        result.bytes += bytes;
        result.downloaded++;
      } catch {
        result.failed++; // offline, 404, disk: counted, the rest goes on (the screen offers a retry)
      }
      done++;
      onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, worker));
  result.aborted = done < total;
  return result;
}

export interface AndroidAudioOptions {
  player?: AudioPlayer;
  /** Random tie-break between equally good recordings (`ObjectSupport.shuffle`); seeded in tests. */
  rng?: Pick<Rng, 'nextInt'>;
}

export function createAndroidAudio(options: AndroidAudioOptions = {}): AudioApi {
  const player = options.player ?? htmlAudioPlayer;
  const rng = options.rng ?? new JavaRandom(Date.now());
  let catalog: AudioCatalog | null = null;
  let expected: Map<number, number> | null = null;
  let lastWasMale = false;

  return {
    supported: true,

    setCatalog(c: AudioCatalog | null): void {
      catalog = c;
      expected = null;
    },

    async play(subjectId: number, pref: VoicePreference, reading: string | null = null): Promise<boolean> {
      const owner = catalog?.owner(subjectId) ?? null;
      if (owner === null) return false;
      const cached = await cachedFor([owner.level]);
      const choice = chooseAudio(owner, reading, pref, lastWasMale, cached, rng);
      if (choice === null) return false;
      let src = choice.audio.url;
      if (choice.cached) {
        const dir = cached.get(owner.level)!;
        const name = cachedNames(choice.audio.sourceId).find((n) => dir.has(n))!;
        const { uri } = await Filesystem.getUri({ path: `${AUDIO_DIR}/${owner.level}/${name}`, directory: Directory.Data });
        src = Capacitor.convertFileSrc(uri);
      }
      lastWasMale = choice.audio.gender === 'male'; // AudioUtil.playLocalAudio / playStreamingAudio
      try {
        await player.play(src);
        return true;
      } catch {
        return false;
      }
    },

    async download(levels, onProgress, signal): Promise<AudioDownloadResult> {
      if (catalog === null) throw new Error('Audio catalog not loaded');
      const owners = catalog.owners(levels);
      const cached = await cachedFor(owners.map((o) => o.level));
      return runQueue(planAudioDownloads(owners, cached), onProgress, signal);
    },

    async downloadSubjects(subjectIds, maxCount, signal): Promise<AudioDownloadResult> {
      if (catalog === null) return { downloaded: 0, failed: 0, bytes: 0, aborted: true }; // not read yet: the next scan
      const c = catalog;
      const owners = [...new Set(subjectIds)].map((id) => c.owner(id)).filter((o): o is NonNullable<typeof o> => o !== null);
      const cached = await cachedFor(owners.map((o) => o.level));
      // `scheduleDownloadTasks`: the first `maxCount` subjects that miss a file.
      const queue: AudioDownload[] = [];
      let count = 0;
      for (const o of owners) {
        if (count >= maxCount) break;
        const missing = planAudioDownloads([o], cached).filter((d) => !queue.some((q) => q.path === d.path));
        if (missing.length === 0) continue;
        queue.push(...missing);
        count++;
      }
      return runQueue(queue, undefined, signal);
    },

    async status(): Promise<AudioCacheStatus> {
      expected ??= catalog === null ? null : expectedFilesPerLevel(catalog.owners());
      const byLevel = new Map<number, AudioLevelStatus>();
      const entry = (level: number): AudioLevelStatus => {
        let e = byLevel.get(level);
        if (e === undefined) byLevel.set(level, (e = { level, files: 0, bytes: 0, expected: expected?.get(level) ?? (expected ? 0 : null) }));
        return e;
      };
      for (const dir of await listDir(AUDIO_DIR)) {
        if (dir.type !== 'directory' || !/^\d+$/.test(dir.name)) continue;
        const level = Number(dir.name);
        for (const f of await listDir(`${AUDIO_DIR}/${dir.name}`)) {
          if (f.type !== 'file' || !AUDIO_FILE.test(f.name)) continue;
          const e = entry(level);
          e.files++;
          e.bytes += f.size;
        }
      }
      if (expected) for (const level of expected.keys()) entry(level);
      const levels = [...byLevel.values()].sort((a, b) => a.level - b.level);
      return {
        levels,
        files: levels.reduce((n, l) => n + l.files, 0),
        bytes: levels.reduce((n, l) => n + l.bytes, 0),
      };
    },

    async deleteAll(): Promise<void> {
      try {
        await Filesystem.stat({ path: AUDIO_DIR, directory: Directory.Data });
      } catch {
        return; // nothing downloaded
      }
      await Filesystem.rmdir({ path: AUDIO_DIR, directory: Directory.Data, recursive: true });
    },
  };
}

export const androidAudio = createAndroidAudio();
