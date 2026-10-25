import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audioCatalog, type AudioOwner, type PronunciationAudio } from '../core/audio';
import { JavaRandom } from '../core/rng';

// In-memory files dir for the mocked @capacitor/filesystem: path -> base64 data. No real audio is
// downloaded: CapacitorHttp is mocked too.
const fs = vi.hoisted(() => ({ files: new Map<string, string>() }));
const http = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { convertFileSrc: (uri: string) => uri.replace('file://', 'https://localhost/_capacitor_file_') },
  CapacitorHttp: http,
}));
vi.mock('@capacitor/filesystem', () => {
  const children = (path: string) => {
    const prefix = `${path}/`;
    const names = new Map<string, { type: 'file' | 'directory'; size: number }>();
    for (const [k, v] of fs.files) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash < 0) names.set(rest, { type: 'file', size: Math.floor((v.length * 3) / 4) });
      else names.set(rest.slice(0, slash), { type: 'directory', size: 0 });
    }
    return names;
  };
  return {
    Directory: { Data: 'DATA' },
    Filesystem: {
      readdir: vi.fn(async ({ path }: { path: string }) => {
        const names = children(path);
        if (names.size === 0) throw new Error('Directory does not exist');
        return { files: [...names].map(([name, v]) => ({ name, type: v.type, size: v.size, mtime: 0, uri: '' })) };
      }),
      writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
        fs.files.set(path, data);
        return { uri: `file:///data/${path}` };
      }),
      rename: vi.fn(async ({ from, to }: { from: string; to: string }) => {
        fs.files.set(to, fs.files.get(from)!);
        fs.files.delete(from);
      }),
      getUri: vi.fn(async ({ path }: { path: string }) => ({ uri: `file:///data/${path}` })),
      stat: vi.fn(async ({ path }: { path: string }) => {
        if (children(path).size === 0) throw new Error('not found');
        return { type: 'directory' };
      }),
      rmdir: vi.fn(async ({ path }: { path: string }) => {
        for (const k of [...fs.files.keys()]) if (k.startsWith(`${path}/`)) fs.files.delete(k);
      }),
    },
  };
});

const { createAndroidAudio, base64Bytes } = await import('./androidAudio');

const url = (n: number) => `https://audio.example.invalid/${n}.mp3`;
function rec(sourceId: number, gender: string, pronunciation: string): PronunciationAudio {
  return { url: url(sourceId), contentType: 'audio/mpeg', sourceId, gender, pronunciation };
}
const owners: AudioOwner[] = [
  { subjectId: 1, level: 1, primaryReadings: ['いち'], audios: [rec(11, 'male', 'いち'), rec(12, 'female', 'いち')] },
  { subjectId: 2, level: 1, primaryReadings: ['に'], audios: [rec(21, 'male', 'に')] },
  { subjectId: 3, level: 2, primaryReadings: ['さん'], audios: [rec(31, 'female', 'さん')] },
];

function setup() {
  const played: string[] = [];
  const player = { play: vi.fn(async (src: string) => void played.push(src)) };
  const audio = createAndroidAudio({ player, rng: new JavaRandom(7) });
  audio.setCatalog(audioCatalog(owners));
  return { audio, player, played };
}

beforeEach(() => {
  fs.files.clear();
  http.request.mockReset();
  http.request.mockResolvedValue({ status: 200, data: 'QUJD\nREVG', headers: {}, url: '' }); // "ABCDEF", wrapped
});

describe('download', () => {
  it('downloads the missing files of the levels with native HTTP, reporting progress', async () => {
    const { audio } = setup();
    fs.files.set('pronunciation-audio/1/11.mp3', 'AAAA');
    const progress: [number, number][] = [];
    const result = await audio.download([1], (d, t) => progress.push([d, t]));
    expect(result).toEqual({ downloaded: 2, failed: 0, bytes: 12, aborted: false });
    expect(http.request).toHaveBeenCalledWith(expect.objectContaining({ url: url(12), method: 'GET', responseType: 'blob' }));
    expect(http.request).not.toHaveBeenCalledWith(expect.objectContaining({ url: url(11) }));
    expect(fs.files.get('pronunciation-audio/1/12.mp3')).toBe('QUJDREVG');
    expect(fs.files.has('pronunciation-audio/1/21.mp3')).toBe(true);
    expect([...fs.files.keys()].some((k) => k.endsWith('.tmp'))).toBe(false);
    expect(progress[0]).toEqual([0, 2]);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('counts failures and goes on', async () => {
    const { audio } = setup();
    http.request.mockImplementation(async ({ url: u }: { url: string }) =>
      u === url(11) ? { status: 404, data: '' } : u === url(12) ? Promise.reject(new Error('offline')) : { status: 200, data: 'QUJD' });
    const result = await audio.download([1]);
    expect(result).toEqual({ downloaded: 1, failed: 2, bytes: 3, aborted: false });
  });

  it('stops when aborted', async () => {
    const { audio } = setup();
    const ctl = new AbortController();
    ctl.abort();
    const result = await audio.download([1, 2], undefined, ctl.signal);
    expect(result.aborted).toBe(true);
    expect(http.request).not.toHaveBeenCalled();
  });

  it('needs a catalog', async () => {
    const audio = createAndroidAudio();
    await expect(audio.download([1])).rejects.toThrow(/catalog/);
  });
});

describe('status and deleteAll', () => {
  it('reports files and bytes per level, with the expected counts', async () => {
    const { audio } = setup();
    fs.files.set('pronunciation-audio/1/11.mp3', 'AAAAAAAA'); // 6 bytes
    fs.files.set('pronunciation-audio/1/12.ogg', 'AAAA'); // 3 bytes
    fs.files.set('pronunciation-audio/1/21.mp3.downloading.tmp', 'AAAA'); // ignored
    fs.files.set('pronunciation-audio/7/70.mp3', 'AAAA'); // level the catalog doesn't know
    await expect(audio.status()).resolves.toEqual({
      levels: [
        { level: 1, files: 2, bytes: 9, expected: 3 },
        { level: 2, files: 0, bytes: 0, expected: 1 },
        { level: 7, files: 1, bytes: 3, expected: 0 },
      ],
      files: 3,
      bytes: 12,
    });
  });

  it('is empty with nothing downloaded and no catalog', async () => {
    await expect(createAndroidAudio().status()).resolves.toEqual({ levels: [], files: 0, bytes: 0 });
  });

  it('deleteAll removes the audio directory only', async () => {
    const { audio } = setup();
    fs.files.set('pronunciation-audio/1/11.mp3', 'AAAA');
    fs.files.set('backups/kanjikodama-autobackup-x.json', '{}');
    await audio.deleteAll();
    expect([...fs.files.keys()]).toEqual(['backups/kanjikodama-autobackup-x.json']);
    await expect(audio.deleteAll()).resolves.toBeUndefined(); // nothing left: no error
  });
});

describe('play', () => {
  it('plays the cached file through convertFileSrc', async () => {
    const { audio, played } = setup();
    fs.files.set('pronunciation-audio/1/21.mp3', 'AAAA');
    await expect(audio.play(2, 'RANDOM')).resolves.toBe(true);
    expect(played).toEqual(['https://localhost/_capacitor_file_/data/pronunciation-audio/1/21.mp3']);
  });

  it('streams when not cached; false when that fails (offline) or there is no audio', async () => {
    const { audio, player, played } = setup();
    await expect(audio.play(3, 'RANDOM')).resolves.toBe(true);
    expect(played).toEqual([url(31)]);
    player.play.mockRejectedValueOnce(new Error('NotSupportedError'));
    await expect(audio.play(3, 'RANDOM')).resolves.toBe(false);
    await expect(audio.play(99, 'RANDOM')).resolves.toBe(false);
  });

  it('ALTERNATE alternates voices between plays', async () => {
    const { audio, played } = setup();
    fs.files.set('pronunciation-audio/1/11.mp3', 'AAAA');
    fs.files.set('pronunciation-audio/1/12.mp3', 'AAAA');
    await audio.play(1, 'ALTERNATE');
    await audio.play(1, 'ALTERNATE');
    await audio.play(1, 'ALTERNATE');
    expect(played.map((p) => p.slice(-6))).toEqual(['11.mp3', '12.mp3', '11.mp3']);
  });
});

describe('base64Bytes', () => {
  it('counts decoded bytes', () => {
    expect(base64Bytes('QUJDREVG')).toBe(6);
    expect(base64Bytes('QUI=')).toBe(2);
    expect(base64Bytes('QQ==')).toBe(1);
    expect(base64Bytes('QUJD\nREVG')).toBe(6);
  });
});
