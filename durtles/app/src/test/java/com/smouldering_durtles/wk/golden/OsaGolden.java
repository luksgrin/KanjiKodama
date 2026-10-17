package com.smouldering_durtles.wk.golden;

import com.smouldering_durtles.wk.util.OptimalStringAlignmentDistance;

import org.junit.Test;

import java.util.Random;

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static org.junit.Assert.assertEquals;

/**
 * Golden cases for {@link OptimalStringAlignmentDistance#getDistance}. Strings are compared per UTF-16
 * code unit (Java {@code charAt}), which is what the emoji cases pin down.
 */
public final class OsaGolden {
    private static final String[][] EDGE = {
            {"", ""}, {"", "a"}, {"a", ""}, {"", "abc"}, {"abc", "abc"}, {"a", "b"},
            {"ab", "ba"}, {"abc", "acb"}, {"abcd", "badc"}, {"ca", "abc"}, {"abc", "ca"},
            {"kitten", "sitting"}, {"flaw", "lawn"}, {"saturday", "sunday"}, {"one", "oen"},
            {"ground", "grnoud"}, {"aaaa", "aa"}, {"abcdef", "fedcba"}, {"a b", "ab"}, {"A", "a"},
            {"いち", "いち"}, {"いち", "ちい"}, {"きょう", "きよう"}, {"しょう", "しよう"}, {"カ", "か"},
            {"一", "二"}, {"😀", "😀"}, {"😀", "😃"}, {"a😀b", "ab"}, {"😀a", "a😀"},
            {"résumé", "resume"}, {"straße", "strasse"},
            {"long answer with spaces", "long answr with spaces"}, {"abcdefghijklmnop", "abcdefghijklmnpo"},
            {"to be", "to  be"}, {"big", "gib"}, {"ab", "aab"}, {"abab", "baba"}, {"ab", "cd"},
    };

    @Test
    public void generate() throws Exception {
        assertEquals(3, OptimalStringAlignmentDistance.getDistance("kitten", "sitting"));
        try (final GoldenWriter w = GoldenWriter.open("answers/osa.json", "answers.osa",
                "util/OptimalStringAlignmentDistance.getDistance")) {
            for (int i = 0; i < EDGE.length; i++) {
                w.add("edge-" + (i + 1), obj("a", EDGE[i][0], "b", EDGE[i][1]),
                        OptimalStringAlignmentDistance.getDistance(EDGE[i][0], EDGE[i][1]));
            }
            final Random random = new Random(20261017L);
            for (int i = 0; i < 2000; i++) {
                final String a = randomString(random);
                // Half the pairs are a small mutation of a, so distances are spread over 0..3 too.
                String b;
                do {
                    b = random.nextBoolean() ? randomString(random) : AnswerGoldenSupport.typo(a, random.nextInt(4), random);
                } while (hasLoneSurrogate(b));
                w.add("random-" + (i + 1), obj("a", a, "b", b), OptimalStringAlignmentDistance.getDistance(a, b));
            }
        }
    }

    /** Fixtures are UTF-8, which cannot carry a lone surrogate; mutations that split 😀 are drawn again. */
    static boolean hasLoneSurrogate(final String s) {
        for (int i = 0; i < s.length(); i++) {
            final char c = s.charAt(i);
            if (Character.isHighSurrogate(c) && (i + 1 >= s.length() || !Character.isLowSurrogate(s.charAt(i + 1)))) {
                return true;
            }
            if (Character.isLowSurrogate(c) && (i == 0 || !Character.isHighSurrogate(s.charAt(i - 1)))) {
                return true;
            }
        }
        return false;
    }

    private static String randomString(final Random random) {
        final int len = random.nextInt(10);
        final StringBuilder sb = new StringBuilder();
        // Letters from a small alphabet so transpositions and matches happen often; 😀 is two chars.
        final String[] units = {"a", "b", "c", "d", "e", "é", "あ", "い", "う", "カ", "一", " ", "😀"};
        for (int i = 0; i < len; i++) {
            sb.append(units[random.nextInt(random.nextInt(4) == 0 ? units.length : 5)]);
        }
        return sb.toString();
    }
}
