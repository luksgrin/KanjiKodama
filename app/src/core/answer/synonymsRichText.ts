/**
 * The subject info lines for the user's study materials.
 *
 * Java: `db/model/Subject.getMeaningSynonymsRichText`, `getMeaningNoteRichText`, `getReadingNoteRichText`.
 * Fixtures: `answers/synonyms-ui-device.json`, `anki/answer-text.jsonl` (`synonyms/*`).
 */
import { escapeHtml, renderHtml, type RichText } from '../text/richText';

/** `Subject.getMeaningSynonymsRichText`: "My synonyms: a, b" with the label bold. */
export function meaningSynonymsRichText(synonyms: readonly string[]): RichText {
  return renderHtml(`<b>My synonyms</b>: ${escapeHtml(synonyms.join(', '))}`);
}

/** `getMeaningNoteRichText` / `getReadingNoteRichText`: the label bold, `\n` as line breaks; null is "". */
export function noteRichText(kind: 'meaning' | 'reading', note: string | null): RichText {
  return renderHtml(`<b>My ${kind} note</b>: ${escapeHtml(note ?? '').replace(/\n/g, '<br/>')}`);
}
