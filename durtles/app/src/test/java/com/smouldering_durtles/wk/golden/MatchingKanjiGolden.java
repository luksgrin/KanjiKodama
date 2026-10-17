/*
 * KanjiKodama golden fixtures (Tier A): which subjects get a matching kanji (MatchingKanji.lookupCharacters).
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.golden;

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;

import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.SubjectType;
import com.smouldering_durtles.wk.model.MatchingKanji;

import org.junit.Test;

/**
 * Writes {@code answers/matching-kanji.json}: input {@code {object, characters, shakeOnMatchingKanji}}, output
 * {@code {lookup}}: the characters UnansweredSessionFragment looks the matching kanji up by (SubjectDao
 * .getKanjiByCharacters), or null when the subject gets none. The device fixture
 * {@code answers/matching-kanji-device.json} has the lookup over the real content and the setting itself.
 */
public final class MatchingKanjiGolden {
    private static final String[] OBJECTS = {"radical", "kanji", "vocabulary", "kana_vocabulary"};
    /** null, empty, one kanji, two kanji, a kanji outside the BMP (two UTF-16 chars), one hiragana, one katakana. */
    private static final String[] CHARACTERS = {null, "", "人", "人々", "大人", "𠮟", "ね", "ワ", "1"};

    @Test
    public void lookup() throws Exception {
        try (final GoldenWriter w = GoldenWriter.open("answers/matching-kanji.json", "answers.matchingKanji",
                "model/MatchingKanji.lookupCharacters (from fragments/UnansweredSessionFragment)")) {
            for (final String object: OBJECTS) {
                for (int i = 0; i < CHARACTERS.length; i++) {
                    for (final boolean setting: new boolean[] {true, false}) {
                        final SubjectEntity e = new SubjectEntity();
                        e.id = 1;
                        e.type = SubjectType.from(object);
                        e.characters = CHARACTERS[i];
                        final Subject s = new Subject(e);
                        w.add(object + "/" + i + "/" + setting,
                                obj("object", object, "characters", CHARACTERS[i], "shakeOnMatchingKanji", setting),
                                obj("lookup", MatchingKanji.lookupCharacters(s, setting)));
                    }
                }
            }
        }
    }
}
