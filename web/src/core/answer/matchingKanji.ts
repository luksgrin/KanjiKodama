import type { ContentSubject, SubjectObject } from '../content';

/**
 * `model/MatchingKanji.lookupCharacters` (from `UnansweredSessionFragment`): the characters to look a
 * matching kanji up by, or null. Only `vocabulary` (not `kana_vocabulary`) whose characters are exactly
 * one UTF-16 char qualifies, and only while the setting (`shakeOnMatchingKanji` in `settings/`) is on.
 */
export function matchingKanjiLookupCharacters(
  subject: { object: SubjectObject; characters: string | null },
  shakeOnMatchingKanji: boolean,
): string | null {
  const characters = subject.characters ?? '';
  return subject.object === 'vocabulary' && characters.length === 1 && shakeOnMatchingKanji ? characters : null;
}

/**
 * `SubjectDao.getKanjiByCharacters`: the first visible kanji (in id order, the table's scan order) with
 * exactly these characters, or null.
 */
export function kanjiByCharacters(subjects: Iterable<ContentSubject>, characters: string): ContentSubject | null {
  for (const s of subjects) {
    if (s.object === 'kanji' && s.hiddenAt === 0 && s.characters === characters) return s;
  }
  return null;
}

/** The session's matching kanji for a subject: the lookup, then the kanji (what the fragment passes to submit). */
export function matchingKanjiFor(
  subjects: Iterable<ContentSubject>,
  subject: { object: SubjectObject; characters: string | null },
  shakeOnMatchingKanji: boolean,
): ContentSubject | null {
  const lookup = matchingKanjiLookupCharacters(subject, shakeOnMatchingKanji);
  return lookup === null ? null : kanjiByCharacters(subjects, lookup);
}
