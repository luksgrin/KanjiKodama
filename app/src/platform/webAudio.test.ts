import { describe, expect, it, vi } from 'vitest';
import { audioCatalog, type PronunciationAudio } from '../core/audio';
import { SeededRandom } from '../core/rng';
import { createWebAudio } from './webAudio';

const audio = (sourceId: number, gender: string, contentType = 'audio/mpeg'): PronunciationAudio => ({
  url: `https://files.example.test/${sourceId}.${contentType === 'audio/mpeg' ? 'mp3' : 'ogg'}`, contentType, sourceId, gender, pronunciation: 'いち',
});

const catalog = audioCatalog([{ subjectId: 10, level: 1, primaryReadings: ['いち'], audios: [audio(1, 'male'), audio(2, 'female')] }]);

function setup(online = true, fail = false) {
  const created: { src: string; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }[] = [];
  const api = createWebAudio({
    online: () => online,
    rng: new SeededRandom(1),
    createAudio: (src) => {
      const el = { src, play: vi.fn(async () => { if (fail) throw new Error('NotAllowedError'); }), pause: vi.fn() };
      created.push(el);
      return el as never;
    },
  });
  api.setCatalog(catalog);
  return { api, created };
}

describe('web audio (streamed)', () => {
  it('plays the preferred voice from its URL with an <audio> element', async () => {
    const { api, created } = setup();
    expect(api.supported).toBe(true);
    expect(await api.play(10, 'FEMALE')).toBe(true);
    expect(created.map((c) => c.src)).toEqual(['https://files.example.test/2.mp3']);
    expect(await api.play(10, 'MALE')).toBe(true);
    expect(created[1]!.src).toBe('https://files.example.test/1.mp3');
    expect(created[0]!.pause).toHaveBeenCalled();
  });

  it('alternates voices like Android', async () => {
    const { api, created } = setup();
    await api.play(10, 'ALTERNATE');
    await api.play(10, 'ALTERNATE');
    expect(new Set(created.map((c) => c.src)).size).toBe(2);
  });

  it('resolves false offline, without an element, and for subjects without audio', async () => {
    const off = setup(false);
    expect(await off.api.play(10, 'RANDOM')).toBe(false);
    expect(off.created).toHaveLength(0);
    const on = setup();
    expect(await on.api.play(99, 'RANDOM')).toBe(false);
  });

  it('resolves false when the element cannot play', async () => {
    const { api } = setup(true, true);
    expect(await api.play(10, 'RANDOM')).toBe(false);
  });

  it('has no downloads on the web', async () => {
    const { api } = setup();
    await expect(api.download([1])).rejects.toThrow(/not supported/);
    expect(await api.status()).toEqual({ levels: [], files: 0, bytes: 0 });
  });

  it('defaults to navigator.onLine', async () => {
    const spy = vi.spyOn(globalThis, 'navigator', 'get').mockReturnValue({ onLine: false } as Navigator);
    const api = createWebAudio({ createAudio: () => { throw new Error('should not be created'); } });
    api.setCatalog(catalog);
    expect(await api.play(10, 'RANDOM')).toBe(false);
    spy.mockRestore();
  });
});
