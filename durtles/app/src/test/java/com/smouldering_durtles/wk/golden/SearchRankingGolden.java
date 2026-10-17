package com.smouldering_durtles.wk.golden;

import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.SubjectType;
import com.smouldering_durtles.wk.util.SearchUtil;

import org.junit.Test;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;

/**
 * Golden cases for the pure parts of the search box, {@code search/ranking.json}: SearchUtil's private
 * {@code splitTermsForJava}, {@code splitTermsForSql}, {@code getRanking} and {@code getSearchRanking}, called by
 * reflection (no main-code change). The SQL matching and the order over the real content are in the device
 * fixture {@code search/content.jsonl}.
 *
 * <p>Case groups:</p>
 * <ul>
 *   <li>{@code split/...}: input {@code {query}}, output {@code {java, sql}}: the terms for the ranking (split on
 *   {@code [\p{Z}\s]}, empties dropped, upper-cased with Locale.ROOT) and the LIKE terms (same split, not
 *   upper-cased; the {@code %}/{@code _} "escaping" uses the replacement {@code "\\%"}, which Matcher.replaceAll reads
 *   as a literal {@code %}, so it changes nothing and both stay LIKE wildcards).</li>
 *   <li>{@code rank/...}: input {@code {haystack, term, weight}} ({@code term} already upper-cased, as the caller
 *   passes it), output {@code {value}}: per non-overlapping occurrence in the upper-cased haystack 1 point,
 *   +1 if it starts the haystack or follows a non-letter/digit, +1 if it ends the haystack or is followed by a
 *   non-letter/digit, times weight ({@code Character.isLetterOrDigit} on single UTF-16 units). An empty term would
 *   loop forever; the split never produces one.</li>
 *   <li>{@code subject/...}: input {@code {subject, query}}, output {@code {terms, ranking}} for an inline
 *   subject (all searched fields, including the learner's notes and synonyms).</li>
 * </ul>
 */
public final class SearchRankingGolden {
    private GoldenWriter w;

    @Test
    public void ranking() throws Exception {
        try (final GoldenWriter writer = GoldenWriter.open("search/ranking.json", "search.ranking",
                "util/SearchUtil.splitTermsForJava/splitTermsForSql/getRanking/getSearchRanking")) {
            w = writer;
            split();
            rank();
            subjects();
        }
    }

    private void split() throws Exception {
        final String[] queries = {"one", "One person", "  one   person  ", "one\tperson\nbig", "one　person", "one person",
                "one person", "one​person", "", " ", "　", "100%", "a_b", "%_%", "\\%", "café", "straße", "ıiİ",
                "一番", "いち", "ｏｎｅ", "o'clock", "self-control", "🍺 beer", "σς"};
        for (final String q: queries) {
            w.add("split/[" + q + "]", obj("query", q), obj("java", call("splitTermsForJava", q), "sql", call("splitTermsForSql", q)));
        }
    }

    private void rank() throws Exception {
        final Object[][] c = {
                {"One", "ONE", 100}, {"one", "ONE", 1}, {"Someone", "ONE", 1}, {"one two one", "ONE", 1}, {"oneone", "ONE", 1},
                {"ones", "ONE", 1}, {"one.", "ONE", 1}, {"a one b", "ONE", 1}, {"aone", "ONE", 1}, {"onex", "ONE", 1},
                {"one1", "ONE", 1}, {"1one", "ONE", 1}, {"one一", "ONE", 1}, {"一one", "ONE", 1}, {"éone", "ONE", 1},
                {"aaa", "AA", 1}, {"aaaa", "AA", 1}, {"", "ONE", 1}, {null, "ONE", 1}, {"一", "一", 100},
                {"一一", "一", 100}, {"大一番", "一", 100}, {"いち", "いち", 30},
                {"café", "CAFÉ", 1}, {"straße", "STRASSE", 1}, {"STRASSE", "STRAßE", 1}, {"ı", "I", 1},
                {"i", "I", 1}, {"ｏｎｅ", "ＯＮＥ", 1}, {"one two", "ONE TWO", 1}, {"x one", "ONE", 0},
                {"one", "ONE", -1}, {"long text with one in it and one again", "ONE", 3}, {"one-two", "ONE", 1}, {"one_two", "ONE", 1},
                {"été", "ÉTÉ", 1}, {"σοφος", "ΣΟΦΟΣ", 1},
                {"beer 🍺", "🍺", 1}, {"🍺one", "ONE", 1},
        };
        int i = 0;
        for (final Object[] e: c) {
            final String name = String.format("rank/%02d/[%s]/[%s]/%s", i++, e[0], e[1], e[2]);
            w.add(name, obj("haystack", e[0], "term", e[1], "weight", e[2]), obj("value", call("getRanking", e[0], e[1], e[2])));
        }
    }

    private void subjects() throws Exception {
        final Map<String, Object> full = new LinkedHashMap<>();
        full.put("id", 440);
        full.put("object", "kanji");
        full.put("characters", "一");
        full.put("slug", "一");
        full.put("meanings", "[{\"meaning\":\"One\",\"primary\":true,\"accepted_answer\":true},"
                + "{\"meaning\":\"Single one\",\"primary\":false,\"accepted_answer\":true}]");
        full.put("auxiliaryMeanings", "[{\"meaning\":\"1\",\"type\":\"whitelist\"},{\"meaning\":\"once\",\"type\":\"blacklist\"}]");
        full.put("readings", "[{\"reading\":\"いち\",\"primary\":true,\"accepted_answer\":true,\"type\":\"onyomi\"},"
                + "{\"reading\":\"ひと\",\"primary\":false,\"accepted_answer\":false,\"type\":\"kunyomi\"}]");
        full.put("meaningMnemonic", "Lying on the <radical>ground</radical> is one thing. One!");
        full.put("meaningHint", "Think of one finger.");
        full.put("readingMnemonic", "<reading>いち</reading> like itchy");
        full.put("readingHint", null);
        full.put("partsOfSpeech", "[\"numeral\",\"one-word\"]");
        full.put("contextSentences", "[{\"en\":\"One person.\",\"ja\":\"一人。\"},{\"en\":\"Someone else\",\"ja\":\"誰か\"}]");
        full.put("meaningNote", "my note: one zebra");
        full.put("readingNote", "ichi ichi");
        full.put("meaningSynonyms", "[\"uno\",\"one and only\",\"zebra\"]");

        final Map<String, Object> bare = new LinkedHashMap<>();
        bare.put("id", 9177);
        bare.put("object", "kana_vocabulary");
        bare.put("characters", "おはよう");
        bare.put("slug", null);
        bare.put("meanings", "[{\"meaning\":\"Good Morning\",\"primary\":true,\"accepted_answer\":true}]");
        bare.put("auxiliaryMeanings", null);
        bare.put("readings", null);
        bare.put("meaningMnemonic", null);
        bare.put("meaningHint", null);
        bare.put("readingMnemonic", null);
        bare.put("readingHint", null);
        bare.put("partsOfSpeech", null);
        bare.put("contextSentences", null);
        bare.put("meaningNote", null);
        bare.put("readingNote", null);
        bare.put("meaningSynonyms", "[\"\",\" \",\"morning\"]");

        final Map<String, Object> noPrimary = new LinkedHashMap<>(bare);
        noPrimary.put("id", 2);
        noPrimary.put("object", "radical");
        noPrimary.put("characters", null);
        noPrimary.put("slug", "fins");
        noPrimary.put("meanings", "[{\"meaning\":\"Fins\",\"primary\":false,\"accepted_answer\":false},"
                + "{\"meaning\":\"Fin\",\"primary\":false,\"accepted_answer\":true}]");
        noPrimary.put("meaningSynonyms", null);

        final String[] fullQueries = {"one", "ONE", "on", "e", "一", "いち", "ichi", "zebra", "uno", "one zebra", "one one",
                "1", "once", "numeral", "person", "radical", "ground", "itchy", "finger", "one-word", "人", "Someone", "", "  ",
                "%", "nothing"};
        for (final String q: fullQueries) {
            subjectCase("full", full, q);
        }
        for (final String q: new String[] {"morning", "good morning", "おはよう", "おは", "good", "MORNING"}) {
            subjectCase("bare", bare, q);
        }
        for (final String q: new String[] {"fin", "fins", "FIN"}) {
            subjectCase("no-primary", noPrimary, q);
        }
    }

    private void subjectCase(final String label, final Map<String, Object> def, final String query) throws Exception {
        final Subject s = subject(def);
        final Object terms = call("splitTermsForJava", query);
        w.add("subject/" + label + "/[" + query + "]", obj("subject", def, "query", query),
                obj("terms", terms, "ranking", call("getSearchRanking", s, terms)));
    }

    private static Subject subject(final Map<String, Object> d) {
        final SubjectEntity e = new SubjectEntity();
        e.id = ((Number) d.get("id")).longValue();
        e.type = SubjectType.from((String) d.get("object"));
        e.characters = (String) d.get("characters");
        e.slug = (String) d.get("slug");
        e.meanings = (String) d.get("meanings");
        e.auxiliaryMeanings = (String) d.get("auxiliaryMeanings");
        e.readings = (String) d.get("readings");
        e.meaningMnemonic = (String) d.get("meaningMnemonic");
        e.meaningHint = (String) d.get("meaningHint");
        e.readingMnemonic = (String) d.get("readingMnemonic");
        e.readingHint = (String) d.get("readingHint");
        e.partsOfSpeech = (String) d.get("partsOfSpeech");
        e.contextSentences = (String) d.get("contextSentences");
        e.meaningNote = (String) d.get("meaningNote");
        e.readingNote = (String) d.get("readingNote");
        e.meaningSynonyms = (String) d.get("meaningSynonyms");
        return new Subject(e);
    }

    /** Calls a private static SearchUtil method; a thrown exception becomes {@code {"error": SimpleClassName}}. */
    private static Object call(final String name, final Object... args) throws Exception {
        for (final Method m: SearchUtil.class.getDeclaredMethods()) {
            if (m.getName().equals(name) && m.getParameterCount() == args.length) {
                m.setAccessible(true);
                try {
                    final Object r = m.invoke(null, args);
                    return r instanceof List ? new ArrayList<>((List<?>) r) : r;
                } catch (final InvocationTargetException e) {
                    return obj("error", e.getCause().getClass().getSimpleName());
                }
            }
        }
        throw new NoSuchMethodException(name);
    }
}
