/**
 * Quiz fonts (Font settings → "Select fonts for quiz questions" / "Import fonts for quiz questions"):
 * storage, the selection and the face per session item.
 *
 * - Font IDs: "1" … "8" are the built-in fonts (1 = the app's default face, "Android default"), any
 *   other ID is the file name of an imported font. `selected_fonts` holds the chosen IDs as a JSON
 *   list (an older space-separated form is read too).
 * - The seven bundled faces are served from `public/fonts/quiz/` and fetched
 *   only when used (not precached by the service worker; the Android build has them in the APK).
 * - Imported fonts are kept in their own IndexedDB database (`kk-fonts`), name → file bytes (not part
 *   of progress or settings backups).
 * - A font is used for a subject only when it has glyphs for all its characters (`fontCmap.ts`);
 *   one is picked at random per session item and kept for the session.
 */
import type { Preferences } from '../../core/settings';
import { hasGlyphs, readFontBox, readGlyphCoverage, type GlyphCoverage } from './fontCmap';

export const SELECTED_FONTS_KEY = 'selected_fonts';

export interface BuiltInFont {
  id: string;
  name: string;
  /** File under `public/fonts/quiz/`; null for the default face. */
  file: string | null;
  /** `TypefaceConfiguration` padding at the top, in % of the text height. */
  padTop: number;
}

/** The built-in fonts, in display order. */
export const BUILT_IN_FONTS: readonly BuiltInFont[] = [
  { id: '1', name: 'Android default', file: null, padTop: 0 },
  { id: '2', name: 'Sawarabi Mincho', file: 'sawarabi_mincho_medium.ttf', padTop: 0 },
  { id: '3', name: 'Sawarabi Gothic', file: 'sawarabi_gothic_medium.ttf', padTop: 0 },
  { id: '4', name: 'M⁺ P Type-1', file: 'mplus_1p_regular.ttf', padTop: 0 },
  { id: '5', name: 'Kosugi', file: 'kosugi_regular.ttf', padTop: 0 },
  { id: '6', name: 'Kosugi Maru', file: 'kosugi_maru_regular.ttf', padTop: 0 },
  { id: '7', name: 'Otsutome', file: 'otsutomefont_ver3.ttf', padTop: 15 },
  { id: '8', name: '851 Gochikakutto', file: 'gochikakutto.ttf', padTop: 0 },
];

// ---- selected_fonts ------------------------------------------------------------------------------

/** The selected font IDs. */
export function selectedFonts(prefs: Preferences): string[] {
  const v = prefs[SELECTED_FONTS_KEY];
  if (typeof v !== 'string' || v === '') return [];
  if (v.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return v.split(' ').filter((x) => x !== '');
}

/** The new `selected_fonts` value. */
export function withFontSelected(prefs: Preferences, id: string, selected: boolean): string {
  const ids = selectedFonts(prefs);
  if (selected && !ids.includes(id)) ids.push(id);
  else if (!selected) {
    const i = ids.indexOf(id);
    if (i >= 0) ids.splice(i, 1);
  }
  return JSON.stringify(ids);
}

// ---- Imported font files (IndexedDB) -------------------------------------------------------------

const DB_NAME = 'kk-fonts';
const STORE = 'files';

function openFontDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the font store'));
  });
}

function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openFontDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = f(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Font store error')); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Font store aborted')); };
  }));
}

/** The imported font names, sorted. */
export async function importedFontNames(): Promise<string[]> {
  try {
    const keys = await run('readonly', (s) => s.getAllKeys());
    return keys.map(String).sort();
  } catch {
    return [];
  }
}

/** Whether an imported font with this name exists. */
export async function hasImportedFont(name: string): Promise<boolean> {
  return (await importedFontNames()).includes(name);
}

/** Stores an imported font (and drops the cached face). */
export async function importFont(name: string, data: ArrayBuffer): Promise<void> {
  await run('readwrite', (s) => s.put(data, name));
  cache.delete(name);
}

/** Deletes an imported font (and drops the cached face). */
export async function deleteImportedFont(name: string): Promise<void> {
  await run('readwrite', (s) => s.delete(name));
  cache.delete(name);
}

async function importedFontData(name: string): Promise<ArrayBuffer | null> {
  const v = await run('readonly', (s) => s.get(name) as IDBRequest<ArrayBuffer | undefined>);
  return v ?? null;
}

// ---- Loading (TypefaceConfiguration) -------------------------------------------------------------

/** A loaded quiz font. `family` null: the app's default face (font "1"). */
export interface QuizFont {
  id: string;
  family: string | null;
  padTop: number;
  coverage: GlyphCoverage | null;
}

export const DEFAULT_QUIZ_FONT: QuizFont = { id: '1', family: null, padTop: 0, coverage: null };

const cache = new Map<string, Promise<QuizFont | null>>();
let familySeq = 0;

function fontUrl(file: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}fonts/quiz/${file}`;
}

/**
 * The face, with the line height Android gives it (`includeFontPadding`: the font's bounding box),
 * so `line-height: normal` lays text out as a native text view does.
 */
async function loadFace(data: ArrayBuffer): Promise<string | null> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return null;
  const family = `kk-quiz-${++familySeq}`;
  const box = readFontBox(data);
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
  const face = new FontFace(family, data, box ? { ascentOverride: pct(box.ascent), descentOverride: pct(box.descent), lineGapOverride: '0%' } : {});
  await face.load();
  document.fonts.add(face);
  return family;
}

async function load(id: string): Promise<QuizFont | null> {
  const builtIn = BUILT_IN_FONTS.find((f) => f.id === id);
  if (builtIn?.file === null) return DEFAULT_QUIZ_FONT;
  let data: ArrayBuffer | null;
  if (builtIn) {
    const res = await fetch(fontUrl(builtIn.file!));
    if (!res.ok) return null;
    data = await res.arrayBuffer();
  } else {
    data = await importedFontData(id);
  }
  if (data === null) return null;
  const coverage = readGlyphCoverage(data);
  const family = await loadFace(data);
  if (family === null) return null;
  return { id, family, padTop: builtIn?.padTop ?? 0, coverage };
}

/** The loaded face: null when the font can't be loaded. Cached. */
export function loadQuizFont(id: string): Promise<QuizFont | null> {
  let p = cache.get(id);
  if (!p) {
    p = load(id).catch(() => null);
    cache.set(id, p);
  }
  return p;
}

const TILDE = /〜/g;

/** `SessionItem.tryAddTypefaceConfiguration`: the font can show `text` (〜 may fall back to ~). */
export function fontFits(font: QuizFont, text: string): boolean {
  if (font.coverage === null) return true;
  if (hasGlyphs(font.coverage, text)) return true;
  return text.includes('〜') && !font.coverage(0x301C) && hasGlyphs(font.coverage, text.replace(TILDE, '~'));
}

/**
 * `SessionItem.getTypefaceConfiguration`: among the selected fonts that load and fit `text`, one at
 * random (`random(n)` → 0..n-1); the default face when none does.
 */
export async function chooseQuizFont(ids: readonly string[], text: string, random: (n: number) => number): Promise<QuizFont> {
  const fonts: QuizFont[] = [];
  for (const id of ids) {
    const f = await loadQuizFont(id);
    if (f !== null && fontFits(f, text)) fonts.push(f);
  }
  if (fonts.length === 0) return DEFAULT_QUIZ_FONT;
  if (fonts.length === 1) return fonts[0]!;
  return fonts[random(fonts.length)]!;
}
