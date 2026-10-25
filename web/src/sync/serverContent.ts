/** Server mode's `Content` from the downloaded subjects (Dexie `serverSubjects`) and SRS systems (`server.srsSystems`). */
import type { Content } from '../core/content';
import { buildServerContent } from '../core/server';
import type { KkDb } from '../storage/db';
import { KEYS } from './store';

export async function loadServerContent(kk: KkDb, bundled: Content): Promise<Content> {
  const [rows, srs] = await Promise.all([kk.serverSubjects.toArray(), kk.state.get(KEYS.srsSystems)]);
  return buildServerContent(rows, srs?.value, bundled);
}
