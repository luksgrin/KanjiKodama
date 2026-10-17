/*
 * KanjiKodama golden fixtures (Tier B): the search box (SearchUtil) over the real content in the app DB.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.Converters;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.enums.SearchSortOrder;
import com.smouldering_durtles.wk.jobs.SaveStudyMaterialJob;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.local.LocalContent;
import com.smouldering_durtles.wk.local.LocalMode;
import com.smouldering_durtles.wk.util.ObjectSupport;
import com.smouldering_durtles.wk.util.SearchUtil;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Writes {@code search/content.jsonl}: the search box over the real content in the app DB (WaniKani content plus
 * the extra kanji and words). RESETS THE APP'S PROGRESS (back up first, see web/test/golden/README.md).
 *
 * <p>Case {@code studyMaterials/<label>} lists the study materials a group of cases runs with (saved through
 * SaveStudyMaterialJob after {@link ScenarioRunner#baseReset}); group {@code none} has none. Then one case per
 * query, {@code <group>/<index>/[query]}, input {@code {query, studyMaterials}}, output:</p>
 * <ul>
 *   <li>{@code search}: {@code SearchUtil.searchSubjects(1, query)} (the results screen and self-study), as
 *   {@code [id, ranking]} in the returned order (ranking descending; ties in the SQL scan order, which is id order).</li>
 *   <li>{@code display}: the ids in the order the results screen lists them: the same list stably sorted by
 *   {@code SearchSortOrder.TYPE} (radical, kanji, vocabulary, kana vocabulary).</li>
 *   <li>{@code suggestions}: {@code SearchUtil.searchSubjectSuggestions(query)} (the search box drop-down), as
 *   {@code [id, ranking]}.</li>
 * </ul>
 */
@LargeTest
public final class SearchGoldenTest {
    private static Context context;
    private static Context testContext;

    /** Queries for every group. */
    private static final String[] QUERIES = {
            // characters
            "一", "人", "大人", "日本", "日本人", "水", "ハ", "おはよう",
            "々", "弘", "旭日", "旭",
            // kana and romaji (no romaji to kana conversion)
            "いち", "ひと", "じん", "にん", "イチ", "しゃ", "ichi", "hito", "jin",
            // meanings, case, word order
            "one", "One", "ONE", "oNe", "person", "Person", "big", "water", "fin", "fins", "ground", "good morning", "morning good",
            "big person", "tag amulet", "playing card", "vast", "rising sun", "Ra", "raptor cage", "six", "grenade",
            // partial
            "pers", "erso", "mor", "on",
            // broad
            "a", "e",
            // whitespace
            "  one  ", "one\tperson", "one　person", " one", "one person", "", " ", "　",
            // LIKE wildcards and punctuation
            "%", "_", "o_e", "o%e", "100%", "\\", "1", "10", "o'clock", "self-control", "-", ".", ",", "'",
            // unicode and width
            "ｏｎｅ", "ＯＮＥ", "café", "ō", "é", "🍺", "zzzqx",
            // suggestions: the smallSearchTarget path (>= 250 hits on characters) and the 3-char minimum
            "る る", "い い", "す す", "う う", "大 大", " on ", "on ", "日本 ",
            // mnemonic-only and context words, hidden subjects
            "itchy", "koichi", "numeral", "noun", "ra-58", "drawer",
    };

    @BeforeClass
    public static void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        testContext = InstrumentationRegistry.getInstrumentation().getContext();
        assertTrue("The app must be in local mode", LocalMode.isEnabled());
        final AppDatabase db = WkApplication.getDatabase();
        final long deadline = System.currentTimeMillis() + 120_000;
        while (!LocalContent.hasContent(db)) {
            assertTrue("Bundled content was not imported (is wk-content.db in the APK?)", System.currentTimeMillis() < deadline);
            Thread.sleep(500);
        }
        Thread.sleep(3000);
        Locale.setDefault(Locale.US);
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        GoldenWriter.setBaseDir(new File(context.getExternalFilesDir(null), "golden"));
    }

    @AfterClass
    public static void tearDown() {
        Clock.reset();
        ObjectSupport.unseedRandom();
    }

    private static String material(final long id, final String meaningNote, final String readingNote, final String... synonyms)
            throws Exception {
        final List<String> data = new ArrayList<>(Arrays.asList(Long.toString(id), meaningNote, readingNote));
        data.addAll(Arrays.asList(synonyms));
        return Converters.getObjectMapper().writeValueAsString(data);
    }

    @Test
    public void search() throws Exception {
        final ScenarioRunner runner = new ScenarioRunner(context, testContext);
        final Object[][] groups = {
                {"none", new String[0]},
                {"notes-and-synonyms", new String[] {
                        material(440, "one one one zebra", "", "zebra", "uno"),
                        material(2467, "", "ichi", "single"),
                        material(512, "", "", "papa", "one"),
                        material(8800, "Tag! amulet", "ふだ", "label tag"),
                        material(100001, "vast one", "", "hiroshi")}},
        };
        final String[] studyQueries = {"one", "zebra", "uno", "papa", "father", "ichi", "single", "一", "one zebra", "tag",
                "label", "hiroshi", "vast", "ふだ"};
        try (final GoldenWriter w = GoldenWriter.openJsonl("search/content.jsonl", "search.content",
                "util/SearchUtil.searchSubjects(1, query), SearchUtil.searchSubjectSuggestions, enums/SearchSortOrder.TYPE")) {
            for (final Object[] g: groups) {
                final String label = (String) g[0];
                final String[] materials = (String[]) g[1];
                runner.baseReset(1);
                for (final String m: materials) {
                    new SaveStudyMaterialJob(m).runLocal();
                }
                final List<Object> parsed = new ArrayList<>();
                for (final String m: materials) {
                    parsed.add(Converters.getObjectMapper().readTree(m));
                }
                w.add("studyMaterials/" + label, obj("saveStudyMaterialJobData", parsed), obj("count", materials.length));
                final String[] queries = materials.length == 0 ? QUERIES : studyQueries;
                for (int i = 0; i < queries.length; i++) {
                    final String q = queries[i];
                    w.add(String.format(Locale.ROOT, "%s/%03d/[%s]", label, i, q), obj("query", q, "studyMaterials", label),
                            run(q));
                }
            }
        }
        runner.baseReset(1);
    }

    private static Object run(final String q) {
        final List<Subject> full = SearchUtil.searchSubjects(1, q);
        final List<Object> ranked = new ArrayList<>();
        for (final Subject s: full) {
            ranked.add(Arrays.asList(s.getId(), s.getRanking()));
        }
        final List<Subject> display = new ArrayList<>(full);
        Collections.sort(display, SearchSortOrder.TYPE.getComparator(0));
        final List<Long> displayIds = new ArrayList<>();
        for (final Subject s: display) {
            displayIds.add(s.getId());
        }
        final List<Object> suggestions = new ArrayList<>();
        for (final Subject s: SearchUtil.searchSubjectSuggestions(q)) {
            suggestions.add(Arrays.asList(s.getId(), s.getRanking()));
        }
        return obj("searchCount", full.size(), "search", ranked, "display", displayIds, "suggestionCount", suggestions.size(),
                "suggestions", suggestions);
    }
}
