import type { SubjectObject } from '../../src/core/content';
import { kanjiByCharacters, matchingKanjiLookupCharacters } from '../../src/core/answer/matchingKanji';
import { shakeOnMatchingKanji, type Preferences } from '../../src/core/settings';
import { loadContentWithExtras } from './content';
import { goldenSuite } from './harness';

goldenSuite<{ object: SubjectObject; characters: string | null; shakeOnMatchingKanji: boolean }, unknown>(
  'answers/matching-kanji.json',
  (input) => ({ lookup: matchingKanjiLookupCharacters(input, input.shakeOnMatchingKanji) }),
);

goldenSuite<Record<string, unknown>, unknown>(
  'answers/matching-kanji-device.json',
  async (input, c) => {
    if (c.name.startsWith('setting/')) return { value: shakeOnMatchingKanji(input as Preferences) };
    const content = await loadContentWithExtras();
    const lookup = matchingKanjiLookupCharacters(
      { object: input.object as SubjectObject, characters: input.characters as string | null },
      true,
    );
    const kanji = lookup === null ? null : kanjiByCharacters(content.subjects, lookup);
    return { matchingKanji: kanji?.id ?? null };
  },
  { needsContent: true },
);
