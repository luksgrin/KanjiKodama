/**
 * Reads the builder's inputs from the repository: `content/inputs/` (committed open data) and
 * `content/private/wk-content.db` (git-ignored).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ContentVariant } from '../../src/content/contentFile';
import { TITLE_IMAGE_IDS } from '../../src/content/titleImages';
import type { ContentInputs, InputFile } from './buildContent';

/** The repository root (`app/..`). */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** sound-components.db, extra-kanji.db, jlpt-kanji.tsv. */
export const ASSETS_DIR = join(REPO_ROOT, 'content/inputs');
/** Reference data (strokes, pitch, JLPT levels, frequency, Jōyō grades). */
export const RAW_DIR = join(REPO_ROOT, 'content/inputs/raw');
/** The radical images (`radical_<id>.xml` vector drawables). */
export const DRAWABLE_DIR = join(REPO_ROOT, 'content/inputs/drawable');
/** The private WaniKani content (git-ignored; internal use only). `KK_WK_CONTENT_DB` overrides it. */
export const WK_CONTENT_PATH = process.env.KK_WK_CONTENT_DB ?? join(REPO_ROOT, 'content/private/wk-content.db');
export const WK_LOCK_PATH = join(REPO_ROOT, 'tools/wk-content.lock.json');

function input(dir: string, name: string): InputFile {
  const path = join(dir, name);
  if (!existsSync(path)) throw new Error(`content input missing: ${path}`);
  return { name, bytes: new Uint8Array(readFileSync(path)) };
}

export function readInputs(variant: ContentVariant): ContentInputs {
  const isPrivate = variant === 'private';
  if (isPrivate && !existsSync(WK_CONTENT_PATH)) {
    throw new Error(`wk-content.db not found at ${WK_CONTENT_PATH} (private, never committed: see tools/build_wk_asset.py)`);
  }
  return {
    variant,
    wkContent: isPrivate ? { name: 'wk-content.db', bytes: new Uint8Array(readFileSync(WK_CONTENT_PATH)) } : undefined,
    wkLock: isPrivate && existsSync(WK_LOCK_PATH) ? { name: 'wk-content.lock.json', bytes: new Uint8Array(readFileSync(WK_LOCK_PATH)) } : undefined,
    soundComponents: input(ASSETS_DIR, 'sound-components.db'),
    extraKanji: input(ASSETS_DIR, 'extra-kanji.db'),
    jlptKanjiTsv: input(ASSETS_DIR, 'jlpt-kanji.tsv'),
    strokeData: input(RAW_DIR, 'stroke_data.json'),
    pitchInfo: input(RAW_DIR, 'pitch_info.json'),
    kanjiJlptLevels: input(RAW_DIR, 'kanji_jlpt_levels.json'),
    vocabJlptLevels: input(RAW_DIR, 'vocab_jlpt_levels.json'),
    kanjidicFreq: input(RAW_DIR, 'kanjidic_freq.json'),
    joyoGrades: input(RAW_DIR, 'wikipedia_joyo_grades.json'),
    titleImages: TITLE_IMAGE_IDS.map((id) => ({ id, file: input(DRAWABLE_DIR, `radical_${id}.xml`) })),
  };
}
