/**
 * Star ratings (0–5 per subject). They are not in the progress file (they go to their own
 * `star_ratings.json` in the data export), so a progress restore leaves them alone; they live in
 * the Dexie `meta` table under `starRatings` (`{ [subjectId]: stars }`, unrated subjects absent),
 * which a restore doesn't touch either.
 *
 * `useStarRatings()` gives the ratings and a setter to any screen (item page, search results,
 * sessions); every write notifies all users of the same database.
 */
import { useCallback, useEffect, useState } from 'react';
import type { KkDb } from '../../../storage/db';
import { useApp } from '../../hooks/useApp';

export const STAR_RATINGS_META_KEY = 'starRatings';

export type StarRatings = ReadonlyMap<number, number>;

const EMPTY: StarRatings = new Map();
const listeners = new WeakMap<KkDb, Set<(r: StarRatings) => void>>();
const cache = new WeakMap<KkDb, StarRatings>();

function parse(value: unknown): Map<number, number> {
  const out = new Map<number, number>();
  if (typeof value !== 'object' || value === null) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const id = Number(k);
    if (Number.isInteger(id) && typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) out.set(id, v);
  }
  return out;
}

/** The stored ratings. */
export async function loadStarRatings(kk: KkDb): Promise<StarRatings> {
  const ratings = parse((await kk.meta.get(STAR_RATINGS_META_KEY))?.value);
  cache.set(kk, ratings);
  return ratings;
}

/** Sets the rating of each id (0 removes the rating). Notifies the hooks. */
export async function setStarRatings(kk: KkDb, ids: readonly number[], stars: number): Promise<StarRatings> {
  const n = Math.max(0, Math.min(5, Math.trunc(stars)));
  const next = await kk.transaction('rw', kk.meta, async () => {
    const current = parse((await kk.meta.get(STAR_RATINGS_META_KEY))?.value);
    for (const id of ids) {
      if (n === 0) current.delete(id);
      else current.set(id, n);
    }
    await kk.meta.put({ key: STAR_RATINGS_META_KEY, value: Object.fromEntries([...current].map(([id, v]) => [String(id), v])) });
    return current;
  });
  cache.set(kk, next);
  for (const l of listeners.get(kk) ?? []) l(next);
  return next;
}

/** A star tap: tapping the current rating clears it, any other sets it. */
export function nextStarRating(current: number, tapped: number): number {
  return current === tapped ? 0 : tapped;
}

/** "★ ★ ☆ ☆ ☆" (the menu and form labels). */
export function starsText(n: number): string {
  return Array.from({ length: 5 }, (_, i) => (i < n ? '★' : '☆')).join(' ');
}

export interface UseStarRatings {
  ratings: StarRatings;
  /** False until the first load finished. */
  loaded: boolean;
  set(ids: readonly number[], stars: number): Promise<void>;
}

export function useStarRatings(): UseStarRatings {
  const app = useApp();
  const kk = app.db;
  const [ratings, setRatings] = useState<StarRatings>(() => cache.get(kk) ?? EMPTY);
  const [loaded, setLoaded] = useState(() => cache.has(kk));
  useEffect(() => {
    let alive = true;
    const l = (r: StarRatings): void => {
      if (alive) setRatings(r);
    };
    let set = listeners.get(kk);
    if (!set) listeners.set(kk, (set = new Set()));
    set.add(l);
    loadStarRatings(kk).then((r) => {
      if (!alive) return;
      setRatings(r);
      setLoaded(true);
    }, () => {
      if (alive) setLoaded(true);
    });
    return () => {
      alive = false;
      set.delete(l);
    };
  }, [kk]);
  const setter = useCallback(async (ids: readonly number[], stars: number) => {
    await setStarRatings(kk, ids, stars);
  }, [kk]);
  return { ratings, loaded, set: setter };
}
