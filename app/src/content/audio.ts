// The audio catalog from the content DB: every subject's `pronunciationAudios` (WaniKani content,
// private variant only; the public variant has none, so the catalog is empty there).
import type { Database } from 'sql.js';
import { audioCatalog, parsePronunciationAudios, type AudioCatalog, type AudioOwner } from '../core/audio';

/** `Subject.isPrimaryReading`: the readings marked primary. */
function primaryReadings(json: unknown): string[] {
  if (typeof json !== 'string' || json === '') return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return (parsed as { reading?: unknown; primary?: unknown }[])
      .filter((r) => r.primary === true && typeof r.reading === 'string')
      .map((r) => r.reading as string);
  } catch {
    return [];
  }
}

/** Reads the audio data once (about 7 000 subjects in the private content) into an `AudioCatalog`. */
export function readAudioCatalog(db: Database): AudioCatalog {
  const byId = new Map<number, AudioOwner>();
  const stmt = db.prepare(
    "SELECT id, level, readings, pronunciationAudios FROM subject WHERE hiddenAt = 0 AND pronunciationAudios IS NOT NULL AND pronunciationAudios != '[]'",
  );
  try {
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const audios = parsePronunciationAudios(row.pronunciationAudios);
      if (audios.length === 0) continue;
      const subjectId = Number(row.id);
      byId.set(subjectId, { subjectId, level: Number(row.level), audios, primaryReadings: primaryReadings(row.readings) });
    }
  } finally {
    stmt.free();
  }
  return audioCatalog([...byId.values()]);
}
