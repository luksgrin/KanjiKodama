/**
 * The writing practice records in the Dexie `writing` table (core `writing/record`). Local only: never
 * synced; a progress restore merges the file's records (the later practice wins) instead of replacing
 * them; Reset database clears them.
 *
 * The records are cached per database so the progress file (written synchronously) can include them;
 * every write notifies the subscribers (the item page line, the self-study panel).
 */
import { laterRecord, recordWrite, type WritingMode, type WritingRecord, type WritingResult } from '../core/writing';
import type { KkDb } from '../storage/db';

export type WritingRecords = ReadonlyMap<number, WritingRecord>;

const cache = new WeakMap<KkDb, WritingRecords>();
const listeners = new WeakMap<KkDb, Set<(r: WritingRecords) => void>>();

function publish(kk: KkDb, records: WritingRecords): WritingRecords {
  cache.set(kk, records);
  for (const l of listeners.get(kk) ?? []) l(records);
  return records;
}

/** The stored records (and fills the cache). */
export async function loadWritingRecords(kk: KkDb): Promise<WritingRecords> {
  const rows = await kk.writing.toArray();
  return publish(kk, new Map(rows.map((r) => [r.id, r])));
}

/** The cached records, if loaded. */
export function cachedWritingRecords(kk: KkDb): WritingRecords | undefined {
  return cache.get(kk);
}

/** For the progress file: the records as a list (empty when none or not loaded). */
export function writingRecordsForFile(kk: KkDb): WritingRecord[] {
  return [...(cache.get(kk)?.values() ?? [])];
}

export function subscribeWritingRecords(kk: KkDb, listener: (r: WritingRecords) => void): () => void {
  let set = listeners.get(kk);
  if (!set) listeners.set(kk, (set = new Set()));
  set.add(listener);
  return () => set.delete(listener);
}

/** Records one write of each result (a finished writing practice card). Returns the new records. */
export async function recordWrites(kk: KkDb, results: readonly WritingResult[], mode: WritingMode, now: number): Promise<WritingRecord[]> {
  const written = await kk.transaction('rw', kk.writing, async () => {
    const out: WritingRecord[] = [];
    for (const result of results) {
      const next = recordWrite((await kk.writing.get(result.id)) ?? null, result, mode, now);
      await kk.writing.put(next);
      out.push(next);
    }
    return out;
  });
  const records = new Map(cache.get(kk) ?? (await kk.writing.toArray()).map((r) => [r.id, r] as const));
  for (const r of written) records.set(r.id, r);
  publish(kk, records);
  return written;
}

/** A restore: each incoming record replaces the stored one only if it was practised later. */
export async function mergeWritingRecords(kk: KkDb, incoming: readonly WritingRecord[]): Promise<void> {
  if (incoming.length > 0) {
    await kk.transaction('rw', kk.writing, async () => {
      for (const r of incoming) {
        const kept = laterRecord(await kk.writing.get(r.id), r);
        if (kept === r) await kk.writing.put(r);
      }
    });
  }
  await loadWritingRecords(kk);
}

/** Reset database. */
export async function clearWritingRecords(kk: KkDb): Promise<void> {
  await kk.writing.clear();
  publish(kk, new Map());
}
