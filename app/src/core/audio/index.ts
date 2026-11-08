/**
 * Pronunciation audio decisions (Android build): which recording to play, which files to download,
 * where they live. See ./audio.ts.
 */
export {
  AUDIO_DIR,
  VOICE_PREFERENCES,
  audioCatalog,
  audioExtension,
  audioPath,
  cachedNames,
  chooseAudio,
  expectedFilesPerLevel,
  isCached,
  parsePronunciationAudios,
  planAudioDownloads,
  voicePreference,
  type AudioCatalog,
  type AudioChoice,
  type AudioDownload,
  type AudioOwner,
  type CachedFiles,
  type PronunciationAudio,
  type VoicePreference,
} from './audio';
