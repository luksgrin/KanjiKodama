/**
 * Search presets (`db/model/SearchPreset`, `SearchPresetDao`, `livedata/LiveSearchPresets`): a name, the
 * search type (0 level, 1 keyword, 2 advanced) and its data (the level, the query or the advanced
 * parameters' JSON). Java keeps them in their own `search_preset` table, outside the progress file;
 * here they are the Dexie `meta` row `searchPresets` (a progress restore leaves them alone, as in Java).
 *
 * Names starting with U+0000 are internal (the self-study default, `"\u0000SELF_STUDY_DEFAULT"`) and
 * not listed by `presetNames`. The self-study screen can use the same functions.
 */
import { useCallback, useEffect, useState } from 'react';
import type { KkDb } from '../../../storage/db';
import { useApp } from '../../hooks/useApp';

export const SEARCH_PRESETS_META_KEY = 'searchPresets';

export interface SearchPreset {
  name: string;
  type: number;
  data: string;
}

const listeners = new WeakMap<KkDb, Set<(p: readonly SearchPreset[]) => void>>();

function parse(value: unknown): SearchPreset[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is SearchPreset =>
    typeof p === 'object' && p !== null && typeof (p as SearchPreset).name === 'string'
    && typeof (p as SearchPreset).type === 'number' && typeof (p as SearchPreset).data === 'string');
}

/** `ORDER BY name` (SQLite BINARY; UTF-16 order here, which differs only past the BMP). */
function sorted(presets: SearchPreset[]): SearchPreset[] {
  return presets.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** `SearchPresetDao.getLivePresets`: every preset, by name. */
export async function loadPresets(kk: KkDb): Promise<readonly SearchPreset[]> {
  return sorted(parse((await kk.meta.get(SEARCH_PRESETS_META_KEY))?.value));
}

async function update(kk: KkDb, change: (list: SearchPreset[]) => SearchPreset[]): Promise<readonly SearchPreset[]> {
  const next = await kk.transaction('rw', kk.meta, async () => {
    const list = sorted(change(parse((await kk.meta.get(SEARCH_PRESETS_META_KEY))?.value)));
    await kk.meta.put({ key: SEARCH_PRESETS_META_KEY, value: list });
    return list;
  });
  for (const l of listeners.get(kk) ?? []) l(next);
  return next;
}

/** `SearchPresetDao.setPreset`: `INSERT OR REPLACE` by name. */
export function savePreset(kk: KkDb, preset: SearchPreset): Promise<readonly SearchPreset[]> {
  return update(kk, (list) => [...list.filter((p) => p.name !== preset.name), { ...preset }]);
}

/** `SearchPresetDao.deletePreset`. */
export function deletePreset(kk: KkDb, name: string): Promise<readonly SearchPreset[]> {
  return update(kk, (list) => list.filter((p) => p.name !== name));
}

/** `LiveSearchPresets.getNames`: the user's presets (not the internal U+0000 ones). */
export function presetNames(presets: readonly SearchPreset[]): string[] {
  return presets.filter((p) => !p.name.startsWith('\u0000')).map((p) => p.name);
}

/** `LiveSearchPresets.getByName`. */
export function presetByName(presets: readonly SearchPreset[], name: string): SearchPreset | null {
  return presets.find((p) => p.name === name) ?? null;
}

export interface UseSearchPresets {
  presets: readonly SearchPreset[];
  save(preset: SearchPreset): Promise<void>;
  remove(name: string): Promise<void>;
}

export function useSearchPresets(): UseSearchPresets {
  const kk = useApp().db;
  const [presets, setPresets] = useState<readonly SearchPreset[]>([]);
  useEffect(() => {
    let alive = true;
    const l = (p: readonly SearchPreset[]): void => {
      if (alive) setPresets(p);
    };
    let set = listeners.get(kk);
    if (!set) listeners.set(kk, (set = new Set()));
    set.add(l);
    loadPresets(kk).then(l, () => undefined);
    return () => {
      alive = false;
      set.delete(l);
    };
  }, [kk]);
  const save = useCallback(async (p: SearchPreset) => {
    await savePreset(kk, p);
  }, [kk]);
  const remove = useCallback(async (name: string) => {
    await deletePreset(kk, name);
  }, [kk]);
  return { presets, save, remove };
}
