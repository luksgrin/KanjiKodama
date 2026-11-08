/**
 * Pronunciation audio: which file to play and which files to download. Java: `util/AudioUtil`
 * (getOneAudioFileShouldMatch / MustMatch, getOneAudioFile, getStreamingAudio, getNewFileForAudio),
 * `tasks/DownloadAudioTask`, `api/model/PronunciationAudio`, `enums/VoicePreference`.
 * The platform layer (android audio) does the I/O; this file only decides.
 */

import { shuffleByRemoval, type Rng } from '../rng';
import type { Preferences } from '../settings';

/** `api/model/PronunciationAudio` with its metadata flattened (the content's `pronunciationAudios` JSON). */
export interface PronunciationAudio {
  url: string;
  contentType: string;
  /** `metadata.source_id`: one recording, offered in several formats (one entry per format). */
  sourceId: number;
  /** `metadata.gender`: 'male' | 'female' (anything else is neither). */
  gender: string;
  /** `metadata.pronunciation`, kana. */
  pronunciation: string;
}

/** A subject that has audio, as the audio code needs it. */
export interface AudioOwner {
  subjectId: number;
  /** The level directory its files live in (the content's WaniKani level, which never changes). */
  level: number;
  audios: readonly PronunciationAudio[];
  /** Readings marked primary (`Subject.isPrimaryReading`). */
  primaryReadings: readonly string[];
}

/** Where the subjects' audio data comes from (built from the content DB by `src/content/audio.ts`). */
export interface AudioCatalog {
  owner(subjectId: number): AudioOwner | null;
  /** Every subject with audio on these levels (all levels when omitted). */
  owners(levels?: readonly number[]): AudioOwner[];
  levels(): number[];
}

/** A catalog over a list of owners (`readAudioCatalog` in src/content/audio.ts builds it from the content DB). */
export function audioCatalog(owners: readonly AudioOwner[]): AudioCatalog {
  const byId = new Map(owners.map((o) => [o.subjectId, o]));
  const sorted = [...owners].sort((a, b) => a.level - b.level || a.subjectId - b.subjectId);
  return {
    owner: (id) => byId.get(id) ?? null,
    owners: (levels) => {
      if (levels === undefined) return sorted;
      const want = new Set(levels);
      return sorted.filter((o) => want.has(o.level));
    },
    levels: () => [...new Set(sorted.map((o) => o.level))],
  };
}

/** `enums/VoicePreference`. */
export type VoicePreference = 'RANDOM' | 'MALE' | 'FEMALE' | 'ALTERNATE';
export const VOICE_PREFERENCES: readonly VoicePreference[] = ['RANDOM', 'MALE', 'FEMALE', 'ALTERNATE'];

/** `GlobalSettings.Audio.getVoicePreference`: `voice_preference`, default RANDOM. */
export function voicePreference(prefs: Preferences): VoicePreference {
  const v = prefs.voice_preference;
  return typeof v === 'string' && (VOICE_PREFERENCES as readonly string[]).includes(v) ? (v as VoicePreference) : 'RANDOM';
}

/** `Constants.AUDIO_DIRECTORY_NAME`, under the app's files dir. */
export const AUDIO_DIR = 'pronunciation-audio';

/** Parses the `pronunciationAudios` column (NULL, '' or bad JSON → []); drops entries without a url. */
export function parsePronunciationAudios(json: unknown): PronunciationAudio[] {
  if (typeof json !== 'string' || json === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: PronunciationAudio[] = [];
  for (const raw of parsed as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as { url?: unknown; content_type?: unknown; metadata?: unknown };
    const m = (typeof r.metadata === 'object' && r.metadata !== null ? r.metadata : {}) as Record<string, unknown>;
    if (typeof r.url !== 'string' || r.url === '') continue;
    out.push({
      url: r.url,
      contentType: typeof r.content_type === 'string' ? r.content_type : '',
      sourceId: typeof m.source_id === 'number' ? m.source_id : 0,
      gender: typeof m.gender === 'string' ? m.gender : '',
      pronunciation: typeof m.pronunciation === 'string' ? m.pronunciation : '',
    });
  }
  return out;
}

/** `AudioUtil.getNewFileForAudio…`: `.ogg` for audio/ogg, else `.mp3` (also for other formats). */
export function audioExtension(contentType: string): '.ogg' | '.mp3' {
  return contentType === 'audio/ogg' ? '.ogg' : '.mp3';
}

/** Path below the files dir, as in the Java app: `pronunciation-audio/<level>/<sourceId>.<ext>`. */
export function audioPath(level: number, audio: Pick<PronunciationAudio, 'sourceId' | 'contentType'>): string {
  return `${AUDIO_DIR}/${level}/${audio.sourceId}${audioExtension(audio.contentType)}`;
}

/** File names that count as "this recording is cached" (`AudioUtil.getExistingFileForAudio`: mp3, then ogg). */
export function cachedNames(sourceId: number): readonly [string, string] {
  return [`${sourceId}.mp3`, `${sourceId}.ogg`];
}

/** Which recordings are on disk: level → file names in that level's directory. */
export type CachedFiles = ReadonlyMap<number, ReadonlySet<string>>;

export function isCached(cached: CachedFiles, level: number, audio: PronunciationAudio): boolean {
  const dir = cached.get(level);
  if (dir === undefined) return false;
  return cachedNames(audio.sourceId).some((n) => dir.has(n));
}

/** Formats in download order: MP3 first (plays everywhere), then other formats, ogg last (as Java). */
function formatRank(contentType: string): number {
  if (contentType === 'audio/mpeg') return 0;
  if (contentType === 'audio/ogg') return 2;
  return 1;
}

export interface AudioDownload {
  subjectId: number;
  level: number;
  sourceId: number;
  url: string;
  /** Final path below the files dir. */
  path: string;
}

/**
 * `DownloadAudioTask` for every subject on the levels: one file per recording (`source_id`), in the
 * preferred format, skipping recordings already cached and entries the Java app skips (no url, no
 * content type or no source id). Java may store a WebM file under `.mp3` when it comes first; this
 * always picks the MPEG entry when there is one.
 */
export function planAudioDownloads(owners: readonly AudioOwner[], cached: CachedFiles): AudioDownload[] {
  const out: AudioDownload[] = [];
  const seen = new Set<string>();
  for (const o of owners) {
    const bySource = new Map<number, PronunciationAudio>();
    for (const a of o.audios) {
      if (a.url === '' || a.contentType === '' || a.sourceId <= 0) continue;
      const prev = bySource.get(a.sourceId);
      if (prev === undefined || formatRank(a.contentType) < formatRank(prev.contentType)) bySource.set(a.sourceId, a);
    }
    for (const a of bySource.values()) {
      if (isCached(cached, o.level, a)) continue;
      const path = audioPath(o.level, a);
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ subjectId: o.subjectId, level: o.level, sourceId: a.sourceId, url: a.url, path });
    }
  }
  return out;
}

/** Distinct recordings per level: what "fully downloaded" means for the status screen. */
export function expectedFilesPerLevel(owners: readonly AudioOwner[]): Map<number, number> {
  const sources = new Map<number, Set<number>>();
  for (const o of owners) {
    let set = sources.get(o.level);
    if (set === undefined) sources.set(o.level, (set = new Set()));
    for (const a of o.audios) if (a.url !== '' && a.contentType !== '' && a.sourceId > 0) set.add(a.sourceId);
  }
  return new Map([...sources].map(([level, set]) => [level, set.size]));
}

const isMale = (a: PronunciationAudio): boolean => a.gender === 'male';
const isFemale = (a: PronunciationAudio): boolean => a.gender === 'female';

type Cmp = (a: PronunciationAudio, b: PronunciationAudio) => number;

/** "a before b when only a has it". */
function prefer(test: (a: PronunciationAudio) => boolean): Cmp {
  return (a, b) => {
    const ta = test(a);
    const tb = test(b);
    return ta === tb ? 0 : ta ? -1 : 1;
  };
}

function chain(...cmps: Cmp[]): Cmp {
  return (a, b) => {
    for (const c of cmps) {
      const r = c(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };
}

function genderCmps(pref: VoicePreference, lastWasMale: boolean): Cmp[] {
  const male = pref === 'MALE' || (pref === 'ALTERNATE' && !lastWasMale);
  const female = pref === 'FEMALE' || (pref === 'ALTERNATE' && lastWasMale);
  const out: Cmp[] = [];
  if (male) out.push(prefer(isMale));
  if (female) out.push(prefer(isFemale));
  return out;
}

/** Shuffle (random tie-break, `ObjectSupport.shuffle`), then a stable sort, like Java's `Collections.sort`. */
function pick(audios: readonly PronunciationAudio[], cmp: Cmp, rng: Pick<Rng, 'nextInt'>): PronunciationAudio | null {
  const list = shuffleByRemoval(audios, rng);
  list.sort(cmp);
  return list[0] ?? null;
}

export interface AudioChoice {
  audio: PronunciationAudio;
  /** True: play the cached file at `audioPath(level, audio)` (with its cached extension); false: stream `url`. */
  cached: boolean;
}

/**
 * `AudioUtil.playAudio`: a cached file matching `reading` (the last matched answer), else a cached
 * file preferring the primary reading, else the best recording to stream. Gender preference breaks
 * ties (ALTERNATE flips on the last voice played). Null when the subject has no audio.
 */
export function chooseAudio(
  owner: AudioOwner,
  reading: string | null,
  pref: VoicePreference,
  lastWasMale: boolean,
  cached: CachedFiles,
  rng: Pick<Rng, 'nextInt'>,
): AudioChoice | null {
  const audios = owner.audios;
  if (audios.length === 0) return null;
  const has = (a: PronunciationAudio): boolean => isCached(cached, owner.level, a);
  const gender = genderCmps(pref, lastWasMale);

  // getOneAudioFileMustMatch
  if (reading !== null) {
    const top = pick(audios, chain(prefer(has), prefer((a) => a.pronunciation === reading), ...gender), rng);
    if (top !== null && top.pronunciation === reading && has(top)) return { audio: top, cached: true };
  }
  // getOneAudioFile
  const primary = new Set(owner.primaryReadings);
  const top = pick(audios, chain(prefer(has), prefer((a) => primary.has(a.pronunciation)), ...gender), rng);
  if (top !== null && has(top)) return { audio: top, cached: true };
  // getStreamingAudio
  const stream = pick(audios, chain(prefer((a) => a.pronunciation === reading), ...gender), rng);
  return stream === null ? null : { audio: stream, cached: false };
}
