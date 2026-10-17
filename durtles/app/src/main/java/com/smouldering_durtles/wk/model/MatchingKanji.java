/*
 * KanjiKodama: the "shake on matching kanji" subject check of UnansweredSessionFragment, moved here unchanged so
 * golden tests can run it.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.model;

import static com.smouldering_durtles.wk.util.ObjectSupport.orElse;

import com.smouldering_durtles.wk.db.model.Subject;

import javax.annotation.Nullable;

/**
 * Which subjects get a matching kanji for {@link Session#submit}: a vocabulary subject (SubjectType.isVocabulary,
 * which kana-only vocabulary is not) whose characters are exactly one UTF-16 char, while the setting is on. The
 * fragment then looks the kanji up with SubjectDao.getKanjiByCharacters (a visible kanji with the same characters, or
 * none).
 */
public final class MatchingKanji {
    private MatchingKanji() {
        //
    }

    /**
     * The characters to look the matching kanji up by, or null when the subject has none.
     *
     * @param subject the subject of the question on screen
     * @param shakeOnMatchingKanji GlobalSettings.AdvancedOther.getShakeOnMatchingKanji()
     * @return the characters, or null
     */
    public static @Nullable String lookupCharacters(final Subject subject, final boolean shakeOnMatchingKanji) {
        final String characters = orElse(subject.getCharacters(), "");
        if (subject.getType().isVocabulary() && characters.length() == 1 && shakeOnMatchingKanji) {
            return characters;
        }
        return null;
    }
}
