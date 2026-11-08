/**
 * Search engines 1–5 (Notifications and other settings, `TaggedUrlPreference`): the names and URLs
 * the subject title's long-press menu offers.
 */
import type { Preferences } from '../../../core/settings';

export interface SearchEngine {
  /** Slot 1..5. */
  index: number;
  name: string;
  url: string;
}

const DEFAULTS: Readonly<Record<number, readonly [name: string, url: string]>> = {
  1: ['Wiktionary', 'https://ja.wiktionary.org/w/index.php?search=%s'],
  2: ['Jisho', 'https://jisho.org/search/%s'],
};

/** `getSearchEngineName(i)` / `getSearchEngineUrl(i)`: the stored value, else the slot's default. */
export function searchEngine(prefs: Preferences, index: number): SearchEngine {
  const tag = prefs[`search_engine_${index}_tag`];
  const url = prefs[`search_engine_${index}`];
  const def = DEFAULTS[index];
  return {
    index,
    name: typeof tag === 'string' ? tag : def?.[0] ?? '',
    url: typeof url === 'string' ? url : def?.[1] ?? '',
  };
}

/** The configured engines (`hasSearchEngine`: name and URL both non-empty), in slot order. */
export function searchEngines(prefs: Preferences): SearchEngine[] {
  const out: SearchEngine[] = [];
  for (let i = 1; i <= 5; i++) {
    const e = searchEngine(prefs, i);
    if (e.name !== '' && e.url !== '') out.push(e);
  }
  return out;
}

/** Form encoding, UTF-8 (space → "+", only `A-Za-z0-9.-*_` kept). */
export function formUrlEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/%20/g, '+')
    .replace(/[!'()~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** The URL for `characters`: every "%s" replaced by the encoded query. */
export function searchUrl(engine: SearchEngine, characters: string): string {
  const q = formUrlEncode(characters);
  return engine.url.replace(/%s/g, () => q);
}
