package com.smouldering_durtles.wk.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.util.FuzzyMatching;

import org.junit.Assume;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.typo;
import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.verdict;
import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

/**
 * Golden cases for {@link FuzzyMatching#matches}. Each case runs the same answer against every
 * {@link CloseEnoughAction}; the output maps the action name to the verdict. {@code accepted} and
 * {@code rejected} are lists because the iteration order decides {@code matchedAnswer} on ties.
 */
public final class FuzzyGolden {
    private static final String[] WORDS = {
            "one", "two", "ground", "big", "person", "mouth", "to be able to", "o'clock", "Mr.", "mother-in-law",
            "eight", "ten thousand", "cliff", "dog", "go", "sun", "a", "ox", "stop", "self", "turtle",
            "electricity", "international", "responsibility", "to come", "top", "pot", "opt", "spot", "post",
            "1", "10", "100", "3rd", "first-class", "half", "hal", "hall", "shallow", "all", "kana", "Kanji",
            "way of thinking", "wake up", "awake", "fine", "find", "fire", "fir", "five",
    };
    private static final String[][] HAND = {
            // answer, accepted (| separated), rejected (| separated)
            {"one", "One", ""},
            {"  one  ", "one", ""},
            {"ONE", "one", ""},
            {"o n e", "one", ""},
            {"onee", "one", ""},
            {"oen", "one", ""},
            {"tow", "two", ""},
            {"grund", "ground", ""},
            {"gruond", "ground", ""},
            {"grnd", "ground", ""},
            {"elctricity", "electricity", ""},
            {"eletcricty", "electricity", ""},
            {"responsiblity", "responsibility", ""},
            {"responsbilty", "responsibility", ""},
            {"rsponsbilty", "responsibility", ""},
            {"１", "1", ""},
            {"١٠", "10", ""},
            {"o’clock", "o'clock", ""},
            {"o‘clock", "o'clock", ""},
            {"“quote”", "\"quote\"", ""},
            {"mother—in—law", "mother-in-law", ""},
            {"mother–in–law", "mother-in-law", ""},
            {"mother in law", "mother in law", ""},
            {"to\tbe", "to be", ""},
            {"to\nbe", "to be", ""},
            {"to　be", "to be", ""},
            {"tobe", "to be", ""},
            {"İstanbul", "istanbul", ""},
            {"STRASSE", "straße", ""},
            {"straße", "strasse", ""},
            {"half", "half", "hal"},
            {"hal", "half", "hall"},
            {"hall", "half", "hall"},
            {"fir", "fire", "fir"},
            {"fie", "fire|five", ""},
            {"fiv", "fire|five", ""},
            {"fiv", "five|fire", ""},
            {"find", "fine", "find"},
            {"fime", "fine", "find"},
            {"", "one", ""},
            {" ", "one", ""},
            {"one", "", ""},
            {"one", "", "one"},
            {"x", "x", ""},
            {"y", "x", ""},
            {"ab", "abc", ""},
            {"abcd", "abce", ""},
            {"abcde", "abcdf", ""},
            {"abcdx", "abcdef", ""},
            {"abxdx", "abcdef", ""},
            {"abcdefxx", "abcdefgh", ""},
            {"abcxefxx", "abcdefgh", ""},
            {"abcdefghijklmn", "abcdefghijklmn", ""},
            {"abcxxfghijklmn", "abcdefghijklmn", ""},
            {"abcxxfghijxxmn", "abcdefghijklmn", ""},
            {"😀", "😀", ""},
            {"😃", "😀", ""},
            {"あい", "あい", ""},
            {"ｱｲ", "アイ", ""},
            {"Kanji!", "kanji", ""},
            {"kanji!", "kanji!", ""},
            {"kanji？", "kanji?", ""},
            {"spot", "top|pot|spot", "post"},
            {"psot", "spot", "post"},
            {"stop", "pots", "stop"},
    };

    @Test
    public void synthetic() throws Exception {
        try (final GoldenWriter w = GoldenWriter.open("answers/fuzzy.json", "answers.fuzzy",
                "util/FuzzyMatching.matches")) {
            for (int i = 0; i < HAND.length; i++) {
                add(w, "hand-" + (i + 1), HAND[i][0], split(HAND[i][1]), split(HAND[i][2]));
            }
            final Random random = new Random(1017L);
            for (int i = 0; w.size() < 500; i++) {
                final List<String> accepted = pick(random, 1 + random.nextInt(3));
                final List<String> rejected = new ArrayList<>();
                final int rejectedCount = random.nextInt(3);
                for (int k = 0; k < rejectedCount; k++) {
                    // Rejected answers are often near an accepted one, so the tie rules get exercised.
                    rejected.add(random.nextBoolean() ? typo(accepted.get(0), 1 + random.nextInt(2), random)
                            : WORDS[random.nextInt(WORDS.length)]);
                }
                final String base = accepted.get(random.nextInt(accepted.size()));
                final String answer;
                switch (random.nextInt(5)) {
                    case 0:
                        answer = base;
                        break;
                    case 1:
                        answer = base.toUpperCase(java.util.Locale.ROOT);
                        break;
                    case 2:
                        answer = " " + base.replace(" ", "  ") + " ";
                        break;
                    default:
                        answer = typo(base, 1 + random.nextInt(3), random);
                        break;
                }
                add(w, "random-" + (i + 1), answer, accepted, rejected);
            }
        }
    }

    @Test
    public void wanikaniMeanings() throws Exception {
        Assume.assumeTrue("content DB missing", GoldenContent.available());
        final JsonNode rows = GoldenContent.query("SELECT id, meanings, auxiliaryMeanings FROM subject ORDER BY id");
        try (final AnswerGoldenSupport.ShardedWriter w = new AnswerGoldenSupport.ShardedWriter("answers/fuzzy-wk",
                "answers.fuzzy", "util/FuzzyMatching.matches", 25_000)) {
            for (final JsonNode row: rows) {
                final long id = row.get("id").asLong();
                final List<String> accepted = new ArrayList<>();
                final List<String> rejected = new ArrayList<>();
                for (final JsonNode m: AnswerGoldenSupport.parseColumn(row, "meanings")) {
                    (m.path("accepted_answer").asBoolean() ? accepted : rejected).add(m.path("meaning").asText());
                }
                for (final JsonNode m: AnswerGoldenSupport.parseColumn(row, "auxiliaryMeanings")) {
                    final String type = m.path("type").asText();
                    if (type.equals("whitelist")) {
                        accepted.add(m.path("meaning").asText());
                    }
                    else if (type.equals("blacklist")) {
                        rejected.add(m.path("meaning").asText());
                    }
                }
                final Random random = new Random(id);
                final List<String> all = new ArrayList<>(accepted);
                all.addAll(rejected);
                for (int k = 0; k < all.size(); k++) {
                    for (int typos = 1; typos <= 2; typos++) {
                        add(w, id + "-" + (k + 1) + "-typo" + typos, typo(all.get(k), typos, random), accepted, rejected);
                    }
                }
            }
            assertTrue(w.total() > 10_000);
        }
    }

    private interface Sink {
        void add(String name, Object input, Object output) throws Exception;
    }

    private static void add(final GoldenWriter w, final String name, final String answer,
                            final List<String> accepted, final List<String> rejected) throws Exception {
        add((Sink) w::add, name, answer, accepted, rejected);
    }

    private static void add(final AnswerGoldenSupport.ShardedWriter w, final String name, final String answer,
                            final List<String> accepted, final List<String> rejected) throws Exception {
        add((Sink) w::add, name, answer, accepted, rejected);
    }

    private static void add(final Sink w, final String name, final String answer,
                            final List<String> accepted, final List<String> rejected) throws Exception {
        final Map<String, Object> out = new LinkedHashMap<>();
        for (final CloseEnoughAction action: CloseEnoughAction.values()) {
            out.put(action.name(), verdict(FuzzyMatching.matches(answer, accepted, rejected, action)));
        }
        w.add(name, obj("answer", answer, "accepted", accepted, "rejected", rejected), out);
    }

    private static List<String> split(final String s) {
        return s.isEmpty() ? Collections.<String>emptyList() : Arrays.asList(s.split("\\|"));
    }

    private static List<String> pick(final Random random, final int n) {
        final List<String> result = new ArrayList<>();
        while (result.size() < n) {
            final String w = WORDS[random.nextInt(WORDS.length)];
            if (!result.contains(w)) {
                result.add(w);
            }
        }
        return result;
    }
}
