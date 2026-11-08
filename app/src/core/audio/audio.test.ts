import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../rng';
import {
  audioPath,
  chooseAudio,
  expectedFilesPerLevel,
  parsePronunciationAudios,
  planAudioDownloads,
  voicePreference,
  type AudioOwner,
  type PronunciationAudio,
} from './audio';

// Fake host: tracked files must not contain the real audio host (check-no-private).
const url = (n: number, ext: string) => `https://audio.example.invalid/${n}.${ext}`;

function rec(sourceId: number, gender: string, pronunciation: string, contentType = 'audio/mpeg'): PronunciationAudio {
  return { url: url(sourceId, contentType === 'audio/mpeg' ? 'mp3' : 'webm'), contentType, sourceId, gender, pronunciation };
}

describe('parsePronunciationAudios', () => {
  it('reads the content column', () => {
    const json = JSON.stringify([
      { url: url(1, 'webm'), metadata: { gender: 'male', source_id: 1, pronunciation: 'いち' }, content_type: 'audio/webm' },
      { url: '', metadata: { source_id: 2 }, content_type: 'audio/mpeg' },
      { metadata: {} },
      7,
    ]);
    expect(parsePronunciationAudios(json)).toEqual([
      { url: url(1, 'webm'), contentType: 'audio/webm', sourceId: 1, gender: 'male', pronunciation: 'いち' },
    ]);
    expect(parsePronunciationAudios(null)).toEqual([]);
    expect(parsePronunciationAudios('')).toEqual([]);
    expect(parsePronunciationAudios('{bad')).toEqual([]);
    expect(parsePronunciationAudios('{}')).toEqual([]);
  });
});

describe('voicePreference', () => {
  it('defaults to RANDOM', () => {
    expect(voicePreference({})).toBe('RANDOM');
    expect(voicePreference({ voice_preference: 'nope' })).toBe('RANDOM');
    expect(voicePreference({ voice_preference: 'ALTERNATE' })).toBe('ALTERNATE');
  });
});

describe('planAudioDownloads', () => {
  const owner: AudioOwner = {
    subjectId: 10,
    level: 3,
    primaryReadings: ['いち'],
    audios: [
      rec(1, 'male', 'いち', 'audio/webm'),
      rec(1, 'male', 'いち', 'audio/mpeg'),
      rec(2, 'female', 'いち', 'audio/ogg'),
      { ...rec(3, 'female', 'いち'), sourceId: 0 }, // no source id: skipped
      { ...rec(4, 'female', 'いち'), contentType: '' },
    ],
  };

  it('downloads one file per recording, MP3 first, ogg as .ogg', () => {
    expect(planAudioDownloads([owner], new Map())).toEqual([
      { subjectId: 10, level: 3, sourceId: 1, url: url(1, 'mp3'), path: 'pronunciation-audio/3/1.mp3' },
      { subjectId: 10, level: 3, sourceId: 2, url: url(2, 'webm'), path: 'pronunciation-audio/3/2.ogg' },
    ]);
  });

  it('skips cached recordings (mp3 or ogg) and duplicates across subjects', () => {
    const cached = new Map([[3, new Set(['2.mp3'])]]);
    const twin = { ...owner, subjectId: 11 };
    expect(planAudioDownloads([owner, twin], cached).map((d) => d.path)).toEqual(['pronunciation-audio/3/1.mp3']);
  });

  it('counts expected files per level', () => {
    expect(expectedFilesPerLevel([owner, { ...owner, subjectId: 12, level: 4, audios: [rec(9, 'male', 'x')] }])).toEqual(
      new Map([[3, 2], [4, 1]]),
    );
  });

  it('audioPath uses .mp3 for anything but ogg', () => {
    expect(audioPath(1, { sourceId: 5, contentType: 'audio/webm' })).toBe('pronunciation-audio/1/5.mp3');
  });
});

describe('chooseAudio', () => {
  const owner: AudioOwner = {
    subjectId: 1,
    level: 1,
    primaryReadings: ['いち'],
    audios: [rec(1, 'male', 'いち'), rec(2, 'female', 'いち'), rec(3, 'male', 'ひと'), rec(4, 'female', 'ひと')],
  };
  const none = new Map<number, Set<string>>();
  const all = new Map([[1, new Set(['1.mp3', '2.mp3', '3.mp3', '4.ogg'])]]);

  it('streams when nothing is cached, matching the reading and the voice', () => {
    for (let seed = 0; seed < 20; seed++) {
      const c = chooseAudio(owner, 'ひと', 'FEMALE', false, none, new SeededRandom(seed));
      expect(c).toEqual({ audio: owner.audios[3], cached: false });
    }
  });

  it('plays a cached file for the matched reading', () => {
    const c = chooseAudio(owner, 'ひと', 'MALE', false, all, new SeededRandom(1));
    expect(c).toEqual({ audio: owner.audios[2], cached: true });
  });

  it('falls back to the primary reading when the matched one is not cached', () => {
    const cached = new Map([[1, new Set(['1.mp3', '2.mp3'])]]);
    const c = chooseAudio(owner, 'ひと', 'FEMALE', false, cached, new SeededRandom(1));
    expect(c).toEqual({ audio: owner.audios[1], cached: true });
  });

  it('ALTERNATE flips the voice', () => {
    expect(chooseAudio(owner, 'いち', 'ALTERNATE', false, all, new SeededRandom(3))?.audio.gender).toBe('male');
    expect(chooseAudio(owner, 'いち', 'ALTERNATE', true, all, new SeededRandom(3))?.audio.gender).toBe('female');
  });

  it('RANDOM picks either voice depending on the draw', () => {
    const genders = new Set<string>();
    for (let seed = 0; seed < 30; seed++) genders.add(chooseAudio(owner, 'いち', 'RANDOM', false, all, new SeededRandom(seed))!.audio.gender);
    expect(genders).toEqual(new Set(['male', 'female']));
  });

  it('null without audio', () => {
    expect(chooseAudio({ ...owner, audios: [] }, null, 'RANDOM', false, all, new SeededRandom(1))).toBeNull();
  });
});
