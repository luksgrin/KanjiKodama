/**
 * Saving a progress file: the stored progress as the file text (core `exportProgress`, byte for
 * byte like Android's `JSONObject.toString(1)`), and the suggested file name. The caller hands both to
 * the platform's `FilesApi.saveText`.
 *
 * Rows kept for subjects the current content no longer has are exported too: a restore ignores
 * unknown ids, and the progress comes back if the subject returns.
 */
import { exportProgress } from '../core/progressFile';
import type { KkDb } from '../storage/db';
import { loadProgressState } from '../storage/progressRepo';

export interface ProgressFileOut {
  name: string;
  text: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * `"kanjikodama-progress-" + new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date()) + ".json"`:
 * the date in the device's time zone (or `timeZone`, for tests).
 */
export function progressFileName(now: number, timeZone?: string): string {
  let y: number, m: number, d: number;
  if (timeZone === undefined) {
    const date = new Date(now);
    [y, m, d] = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  } else {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(now));
    const get = (t: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === t)?.value);
    [y, m, d] = [get('year'), get('month'), get('day')];
  }
  return `kanjikodama-progress-${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}.json`;
}

/** The file to save: name and text, with `exportedAt` = `now`. */
export async function exportProgressFile(kk: KkDb, now: number = Date.now(), timeZone?: string): Promise<ProgressFileOut> {
  const state = await loadProgressState(kk);
  return { name: progressFileName(now, timeZone), text: exportProgress(state, now) };
}
