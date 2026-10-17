/*
 * KanjiKodama golden fixtures (Tier B): Browse's level search and advanced search (SearchUtil.searchSubjects types 0
 * and 2), the results screen's grouping, and the advanced search form.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.Constants.DAY;
import static com.smouldering_durtles.wk.Constants.HOUR;
import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.view.ContextThemeWrapper;
import android.view.View;
import android.widget.EditText;
import android.widget.Spinner;

import androidx.appcompat.widget.SwitchCompat;
import androidx.preference.PreferenceManager;
import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smouldering_durtles.wk.R;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.adapter.search.HeaderItem;
import com.smouldering_durtles.wk.adapter.search.ResultItem;
import com.smouldering_durtles.wk.adapter.search.RootItem;
import com.smouldering_durtles.wk.adapter.search.SearchResultAdapter;
import com.smouldering_durtles.wk.adapter.search.SubjectItem;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.Converters;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.enums.SearchSortOrder;
import com.smouldering_durtles.wk.enums.SubjectType;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.local.LocalContent;
import com.smouldering_durtles.wk.local.LocalMode;
import com.smouldering_durtles.wk.local.ProgressStore;
import com.smouldering_durtles.wk.model.AdvancedSearchParameters;
import com.smouldering_durtles.wk.util.ObjectSupport;
import com.smouldering_durtles.wk.util.SearchUtil;
import com.smouldering_durtles.wk.views.AdvancedSearchFormView;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Writes {@code search/level.json}, {@code search/advanced.jsonl} and {@code search/advanced-form.json}.
 * RESETS THE APP'S PROGRESS (back up first, see web/test/golden/README.md).
 */
@LargeTest
public final class AdvancedSearchGoldenTest {
    private static Context context;
    private static Context testContext;
    private static AppDatabase db;
    private static SupportSQLiteDatabase sql;

    private static final int[] STAGES = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9};
    private static final double[] AVAIL_HOURS = {-48, -1, 0, 0.5, 1, 5, 23, 24, 25, 100, 720};
    private static final double[] BURNED_DAYS = {0, 1, 6.5, 7, 8, 30, 365};
    private static final double[] INCORRECT_HOURS = {0, 1, 2, 23, 24, 25, 168, 1000};
    private static final int[] LEECH = {0, 999, 1000, 1001, 2500, 10000};

    @BeforeClass
    public static void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        testContext = InstrumentationRegistry.getInstrumentation().getContext();
        assertTrue("The app must be in local mode", LocalMode.isEnabled());
        db = WkApplication.getDatabase();
        sql = db.getOpenHelper().getWritableDatabase();
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
        setStars(false);
        Clock.reset();
        ObjectSupport.unseedRandom();
    }

    private static void setStars(final boolean enabled) {
        final SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
        prefs.edit().putBoolean("enable_star_ratings", enabled).commit();
    }

    // ---- shared helpers ----

    private static List<long[]> visible(final String where) {
        final List<long[]> rows = new ArrayList<>();
        try (final Cursor c = sql.query("SELECT id, level FROM subject WHERE hiddenAt = 0 AND object IS NOT NULL AND "
                + where + " ORDER BY level, lessonPosition, id")) {
            while (c.moveToNext()) {
                rows.add(new long[] {c.getLong(0), c.getLong(1)});
            }
        }
        return rows;
    }

    /** The progress file every advanced search group starts from (times relative to the pinned clock). */
    private static String progressFile(final long now) throws Exception {
        final ObjectNode root = (ObjectNode) ScenarioRunner.JSON.readTree(ScenarioRunner.emptyFile("WANIKANI"));
        root.put("exportedAt", now);
        root.put("userLevel", 6);
        final ArrayNode subjects = (ArrayNode) root.get("subjects");
        final List<long[]> rows = visible("level <= 8");
        for (int i = 0; i < rows.size(); i++) {
            final long id = rows.get(i)[0];
            final long level = rows.get(i)[1];
            if (level > 6) {
                if (i % 4 == 0) {
                    subjects.add(ScenarioRunner.JSON.createObjectNode().put("id", id).put("unlockedAt", now - 10 * HOUR));
                }
                continue;
            }
            final ObjectNode o = subjects.addObject();
            o.put("id", id);
            o.put("unlockedAt", now - 400 * HOUR);
            final int stage = STAGES[i % STAGES.length];
            if (stage == 0) {
                continue;
            }
            o.put("srsStage", stage);
            o.put("startedAt", now - 390 * HOUR);
            o.put("passed", stage >= 5 ? 1 : 0);
            o.put("passedAt", stage >= 5 ? now - 200 * HOUR : 0);
            if (stage == 9) {
                o.put("availableAt", 0);
                o.put("burnedAt", now - Math.round(BURNED_DAYS[i % BURNED_DAYS.length] * DAY));
            }
            else {
                o.put("availableAt", now + Math.round(AVAIL_HOURS[i % AVAIL_HOURS.length] * HOUR));
            }
            if (i % 3 == 0) {
                o.put("lastIncorrectAnswer", now - Math.round(INCORRECT_HOURS[i % INCORRECT_HOURS.length] * HOUR));
            }
            o.put("leechScore", LEECH[i % LEECH.length]);
            o.put("meaningCorrect", 3).put("meaningIncorrect", i % 4).put("readingCorrect", 2).put("readingIncorrect", i % 3);
        }
        return ScenarioRunner.JSON.writeValueAsString(root);
    }

    /** Star ratings for every 5th visible subject of levels 1-3: rating (index / 5) % 6. */
    private static Map<Long, Integer> stars() {
        final Map<Long, Integer> result = new LinkedHashMap<>();
        final List<long[]> rows = visible("level <= 3");
        for (int i = 0; i < rows.size(); i += 5) {
            result.put(rows.get(i)[0], (i / 5) % 6);
        }
        return result;
    }

    /** Subjects hidden in the "hidden" groups: the first two of each type on levels 1 and 3. */
    private static List<Long> hiddenIds() {
        final List<Long> ids = new ArrayList<>();
        for (final int level: new int[] {1, 3}) {
            for (final SubjectType t: new SubjectType[] {SubjectType.WANIKANI_RADICAL, SubjectType.WANIKANI_KANJI,
                    SubjectType.WANIKANI_VOCAB, SubjectType.WANIKANI_KANA_VOCAB}) {
                final List<long[]> rows = visible("level = " + level + " AND object = '" + t.getDbTypeName() + "'");
                for (int i = 0; i < Math.min(2, rows.size()); i++) {
                    ids.add(rows.get(i)[0]);
                }
            }
        }
        return ids;
    }

    /** Set up a group: progress file, star ratings, hidden subjects. Returns the original hiddenAt values. */
    private static Map<Long, Long> setUpGroup(final ScenarioRunner runner, final boolean progress, final boolean starsEnabled,
                                              final List<Long> hide) throws Exception {
        runner.baseReset(1);
        sql.execSQL("UPDATE subject SET typeCode = 0");
        if (progress) {
            ProgressStore.restore(db, progressFile(Clock.now()));
            for (final Map.Entry<Long, Integer> e: stars().entrySet()) {
                db.subjectDao().updateStars(e.getKey(), e.getValue());
            }
        }
        setStars(starsEnabled);
        final Map<Long, Long> original = new LinkedHashMap<>();
        for (final long id: hide) {
            try (final Cursor c = sql.query("SELECT hiddenAt FROM subject WHERE id = ?", new Object[] {id})) {
                c.moveToFirst();
                original.put(id, c.getLong(0));
            }
            sql.execSQL("UPDATE subject SET hiddenAt = ? WHERE id = ?", new Object[] {Clock.now(), id});
        }
        return original;
    }

    private static void tearDownGroup(final ScenarioRunner runner, final Map<Long, Long> original) throws Exception {
        for (final Map.Entry<Long, Long> e: original.entrySet()) {
            sql.execSQL("UPDATE subject SET hiddenAt = ? WHERE id = ?", new Object[] {e.getValue(), e.getKey()});
        }
        sql.execSQL("UPDATE subject SET typeCode = 0");
        setStars(false);
        runner.baseReset(1);
    }

    /** The subject columns the advanced search reads, for every subject with any of them set. */
    private static Object stateDump() {
        final List<Object> rows = new ArrayList<>();
        final String cols = "id, level, object, srsSystemId, srsStage, unlockedAt, availableAt, burnedAt, lastIncorrectAnswer,"
                + " leechScore, typeCode, hiddenAt";
        try (final Cursor c = sql.query("SELECT " + cols + " FROM subject WHERE srsStage != 0 OR unlockedAt != 0"
                + " OR availableAt != 0 OR burnedAt != 0 OR lastIncorrectAnswer != 0 OR leechScore != 0 OR typeCode != 0"
                + " OR (hiddenAt != 0 AND level <= 3) ORDER BY id")) {
            while (c.moveToNext()) {
                final List<Object> r = new ArrayList<>();
                for (int i = 0; i < c.getColumnCount(); i++) {
                    r.add(c.getType(i) == Cursor.FIELD_TYPE_STRING ? c.getString(i)
                            : c.getType(i) == Cursor.FIELD_TYPE_NULL ? null : c.getLong(i));
                }
                rows.add(r);
            }
        }
        final Map<String, Object> stageCounts = new LinkedHashMap<>();
        try (final Cursor c = sql.query("SELECT srsSystemId, srsStage, COUNT(*) FROM subject WHERE hiddenAt = 0"
                + " AND object IS NOT NULL GROUP BY srsSystemId, srsStage ORDER BY srsSystemId, srsStage")) {
            while (c.moveToNext()) {
                stageCounts.put(c.getLong(0) + "/" + c.getLong(1), c.getLong(2));
            }
        }
        long nullObject;
        try (final Cursor c = sql.query("SELECT COUNT(*) FROM subject WHERE object IS NULL")) {
            c.moveToFirst();
            nullObject = c.getLong(0);
        }
        return obj("columns", Arrays.asList(cols.split(",\\s*")), "rows", rows, "visibleStageCounts", stageCounts,
                "subjectsWithNullObject", nullObject);
    }

    /** The results screen's list: header items as "Class:tag", subjects as ids, in view order. */
    private static List<Object> view(final List<Subject> result, final SearchSortOrder order) throws Exception {
        final SearchResultAdapter adapter = new SearchResultAdapter(null);
        adapter.setSortOrder(order);
        adapter.setResult(new ArrayList<>(result));
        final Field f = SearchResultAdapter.class.getDeclaredField("rootItem");
        f.setAccessible(true);
        final RootItem root = (RootItem) f.get(adapter);
        final List<Object> items = new ArrayList<>();
        for (int i = 0; i < root.getCount(); i++) {
            final ResultItem item = root.getItem(i);
            if (item instanceof SubjectItem) {
                items.add(((SubjectItem) item).getSubject().getId());
            }
            else if (item instanceof HeaderItem) {
                items.add(item.getClass().getSimpleName() + ":" + ((HeaderItem) item).getTag());
            }
            else {
                items.add(String.valueOf(item));
            }
        }
        return items;
    }

    private static List<Long> ids(final List<Subject> subjects) {
        final List<Long> ids = new ArrayList<>();
        for (final Subject s: subjects) {
            ids.add(s.getId());
        }
        return ids;
    }

    private static Object run(final int type, final String parameters) {
        try {
            final List<Subject> result = SearchUtil.searchSubjects(type, parameters);
            SearchSortOrder order = SearchSortOrder.TYPE;
            if (type == 2) {
                try {
                    order = Converters.getObjectMapper().readValue(parameters, AdvancedSearchParameters.class).sortOrder;
                }
                catch (final Exception e) {
                    // the results screen fails the same way and shows nothing
                    return obj("count", result.size(), "ids", ids(result), "sortOrder", null,
                            "screenParseError", e.getClass().getSimpleName());
                }
            }
            if (order == null) {
                // "sortOrder": null parses, then the results screen's setResult throws and shows nothing
                Object viewError;
                try {
                    view(result, null);
                    viewError = null;
                }
                catch (final Exception e) {
                    viewError = e.getClass().getSimpleName();
                }
                return obj("count", result.size(), "ids", ids(result), "sortOrder", null, "viewError", viewError);
            }
            return obj("count", result.size(), "ids", ids(result), "sortOrder", order.name(), "view", view(result, order));
        }
        catch (final Exception e) {
            return obj("exception", e.getClass().getSimpleName());
        }
    }

    // ---- level search ----

    private static final String[] LEVEL_INPUTS = {"-1", "0", "61", "62", "100", "", "abc", " 1", "+1", "01", "1.0", "１",
            "2147483648"};

    @Test
    public void levelSearch() throws Exception {
        final ScenarioRunner runner = new ScenarioRunner(context, testContext);
        try (final GoldenWriter w = GoldenWriter.open("search/level.json", "search.level",
                "util/SearchUtil.searchSubjects(0, level), adapter/search/SearchResultAdapter.setResult (SearchSortOrder.TYPE)")) {
            for (final boolean hidden: new boolean[] {false, true}) {
                final String group = hidden ? "hidden" : "none";
                final List<Long> hide = hidden ? hiddenIds() : new ArrayList<>();
                final Map<Long, Long> original = setUpGroup(runner, false, false, hide);
                w.add("group/" + group, obj("hiddenIds", hide), obj("count", hide.size()));
                final List<String> inputs = new ArrayList<>();
                for (int l = 1; l <= 60; l++) {
                    inputs.add(Integer.toString(l));
                }
                if (!hidden) {
                    inputs.addAll(Arrays.asList(LEVEL_INPUTS));
                }
                for (final String in: inputs) {
                    w.add(group + "/[" + in + "]", obj("level", in, "hidden", group), run(0, in));
                }
                tearDownGroup(runner, original);
            }
            w.add("otherType/3", obj("type", 3, "parameters", "1"), run(3, "1"));
            w.add("otherType/-1", obj("type", -1, "parameters", "1"), run(-1, "1"));
        }
    }

    // ---- advanced search ----

    private static AdvancedSearchParameters p() {
        return new AdvancedSearchParameters();
    }

    private static String json(final AdvancedSearchParameters p) throws Exception {
        return Converters.getObjectMapper().writeValueAsString(p);
    }

    /** Parameter sets built the way the form builds them, then serialized as the app does. */
    private static Map<String, String> advancedCases() throws Exception {
        final Map<String, String> m = new LinkedHashMap<>();
        m.put("empty", json(p()));
        for (final SearchSortOrder o: SearchSortOrder.values()) {
            final AdvancedSearchParameters a = p();
            a.maxLevel = 6;
            a.sortOrder = o;
            m.put("sort/" + o.name() + "/levels<=6", json(a));
        }
        for (final SearchSortOrder o: SearchSortOrder.values()) {
            final AdvancedSearchParameters a = p();
            a.sortOrder = o;
            m.put("sort/" + o.name() + "/all", json(a));
        }
        final Integer[][] levels = {{3, null}, {null, 3}, {3, 3}, {2, 5}, {5, 2}, {0, 0}, {-5, 1}, {60, null}, {61, null},
                {null, 0}, {1, 60}};
        for (final Integer[] l: levels) {
            final AdvancedSearchParameters a = p();
            a.minLevel = l[0];
            a.maxLevel = l[1];
            m.put("level/" + l[0] + "-" + l[1], json(a));
        }
        final Integer[][] freq = {{1, 100}, {null, 50}, {2000, null}, {0, 0}, {1, null}, {100, 1}};
        for (final Integer[] f: freq) {
            final AdvancedSearchParameters a = p();
            a.minFrequency = f[0];
            a.maxFrequency = f[1];
            m.put("frequency/" + f[0] + "-" + f[1], json(a));
        }
        {
            final AdvancedSearchParameters a = p();
            a.leechesOnly = true;
            m.put("leeches", json(a));
            a.maxLevel = 3;
            a.sortOrder = SearchSortOrder.STAGE_TYPE;
            m.put("leeches/level<=3/stage", json(a));
        }
        final Integer[][] reviews = {{0, null}, {1, null}, {24, null}, {25, null}, {null, 0}, {null, 1}, {null, 24},
                {null, 100}, {24, 1}, {1, 24}, {720, 0}, {-1, null}, {null, -50}};
        for (final Integer[] r: reviews) {
            final AdvancedSearchParameters a = p();
            a.upcomingReviewLessThan = r[0];
            a.upcomingReviewMoreThan = r[1];
            a.sortOrder = SearchSortOrder.AVAILABLE_AT_TYPE;
            m.put("review/<" + r[0] + "h/>" + r[1] + "h", json(a));
        }
        final Integer[][] burned = {{0, null}, {1, null}, {7, null}, {8, null}, {null, 0}, {null, 7}, {null, 30},
                {null, 365}, {30, 7}, {7, 30}, {400, null}};
        for (final Integer[] b: burned) {
            final AdvancedSearchParameters a = p();
            a.burnedLessThan = b[0];
            a.burnedMoreThan = b[1];
            m.put("burned/<" + b[0] + "d/>" + b[1] + "d", json(a));
        }
        for (final int h: new int[] {0, 1, 2, 24, 25, 168, 1000, 100000}) {
            final AdvancedSearchParameters a = p();
            a.incorrectAnswerWithin = h;
            m.put("incorrect/" + h + "h", json(a));
        }
        final String[] tags = {"locked", "initial", "prepass:0", "prepass:1", "prepass:2", "prepass:3", "pass:0", "pass:1",
                "master", "enlightened", "burned", "prepass:4", "bogus"};
        for (final String t: tags) {
            final AdvancedSearchParameters a = p();
            a.srsStages.add(t);
            a.sortOrder = SearchSortOrder.STAGE_TYPE;
            m.put("stage/" + t, json(a));
        }
        {
            final AdvancedSearchParameters a = p();
            a.srsStages.addAll(Arrays.asList("prepass:0", "prepass:1", "prepass:2", "prepass:3"));
            a.sortOrder = SearchSortOrder.STAGE_TYPE;
            m.put("stage/apprentice", json(a));
            a.srsStages.addAll(Arrays.asList("pass:0", "pass:1"));
            m.put("stage/apprentice+guru", json(a));
            a.itemTypes.add(SubjectType.WANIKANI_KANJI);
            m.put("stage/apprentice+guru/kanji", json(a));
            final AdvancedSearchParameters b = p();
            b.srsStages.addAll(Arrays.asList("locked", "initial"));
            b.maxLevel = 8;
            b.minLevel = 6;
            b.sortOrder = SearchSortOrder.STAGE_TYPE;
            m.put("stage/locked+initial/levels6-8", json(b));
        }
        for (final SubjectType t: new SubjectType[] {SubjectType.WANIKANI_RADICAL, SubjectType.WANIKANI_KANJI,
                SubjectType.WANIKANI_VOCAB, SubjectType.WANIKANI_KANA_VOCAB}) {
            final AdvancedSearchParameters a = p();
            a.itemTypes.add(t);
            a.sortOrder = SearchSortOrder.LEVEL_TYPE;
            m.put("type/" + t.name(), json(a));
        }
        {
            final AdvancedSearchParameters a = p();
            a.itemTypes.add(SubjectType.WANIKANI_VOCAB);
            a.itemTypes.add(SubjectType.WANIKANI_KANA_VOCAB);
            a.maxLevel = 10;
            m.put("type/vocab+kana/level<=10", json(a));
        }
        for (final int j: new int[] {0, 1, 2, 3, 4, 5}) {
            final AdvancedSearchParameters a = p();
            a.jlptLevels.add(j);
            a.itemTypes.add(SubjectType.WANIKANI_KANJI);
            m.put("jlpt/N" + j + "/kanji", json(a));
        }
        {
            final AdvancedSearchParameters a = p();
            a.jlptLevels.addAll(Arrays.asList(5, 4));
            a.sortOrder = SearchSortOrder.LEVEL_TYPE;
            m.put("jlpt/N5+N4", json(a));
            final AdvancedSearchParameters b = p();
            b.jlptLevels.add(5);
            m.put("jlpt/N5/allTypes", json(b));
        }
        for (final int g: new int[] {0, 1, 2, 3, 4, 5, 6, 7, 8}) {
            final AdvancedSearchParameters a = p();
            a.joyoGrades.add(g);
            a.itemTypes.add(SubjectType.WANIKANI_KANJI);
            m.put("joyo/" + g + "/kanji", json(a));
        }
        {
            final AdvancedSearchParameters a = p();
            a.joyoGrades.addAll(Arrays.asList(1, 2));
            a.jlptLevels.add(5);
            m.put("joyo/1+2/jlpt/N5", json(a));
        }
        {
            final AdvancedSearchParameters a = p();
            a.minLevel = 1;
            a.maxLevel = 6;
            a.srsStages.addAll(Arrays.asList("prepass:0", "prepass:1", "prepass:2", "prepass:3", "pass:0", "pass:1", "master",
                    "enlightened"));
            a.upcomingReviewLessThan = 24;
            a.itemTypes.add(SubjectType.WANIKANI_KANJI);
            a.itemTypes.add(SubjectType.WANIKANI_VOCAB);
            a.sortOrder = SearchSortOrder.AVAILABLE_AT_TYPE;
            m.put("combo/due24h/kanji+vocab/levels1-6", json(a));
            final AdvancedSearchParameters b = p();
            b.leechesOnly = true;
            b.incorrectAnswerWithin = 24;
            b.sortOrder = SearchSortOrder.STAGE_TYPE;
            m.put("combo/leech+incorrect24h", json(b));
            final AdvancedSearchParameters c = p();
            c.srsStages.add("burned");
            c.burnedLessThan = 30;
            c.burnedMoreThan = 1;
            c.jlptLevels.add(5);
            m.put("combo/burned1-30d/N5", json(c));
            final AdvancedSearchParameters d = p();
            d.srsStages.add("burned");
            d.upcomingReviewLessThan = 1000;
            m.put("combo/burned+review", json(d));
        }
        return m;
    }

    /** Star rating parameter sets (only used when star ratings are on). */
    private static Map<String, String> starCases() throws Exception {
        final Map<String, String> m = new LinkedHashMap<>();
        for (int s = 0; s <= 5; s++) {
            final AdvancedSearchParameters a = p();
            a.starRatings.add(s);
            a.maxLevel = 3;
            m.put("stars/" + s + "/level<=3", json(a));
        }
        final AdvancedSearchParameters a = p();
        a.starRatings.addAll(Arrays.asList(3, 4, 5));
        m.put("stars/3+4+5", json(a));
        final AdvancedSearchParameters b = p();
        b.starRatings.add(6);
        m.put("stars/6", json(b));
        return m;
    }

    /** Hand-written parameter strings: presets, imports and odd JSON. */
    private static final String[][] RAW = {
            {"raw/emptyObject", "{}"},
            {"raw/emptyString", ""},
            {"raw/null", "null"},
            {"raw/array", "[]"},
            {"raw/brokenJson", "{\"minLevel\": 3"},
            {"raw/unknownField", "{\"minLevel\": 3, \"maxLevel\": 3, \"color\": \"red\"}"},
            {"raw/numberAsString", "{\"minLevel\": \"3\", \"maxLevel\": \"3\"}"},
            {"raw/float", "{\"minLevel\": 2.7, \"maxLevel\": 3.2}"},
            {"raw/nullLevels", "{\"minLevel\": null, \"maxLevel\": 2}"},
            {"raw/badSortOrder", "{\"maxLevel\": 2, \"sortOrder\": \"BOGUS\"}"},
            {"raw/sortOrderLowercase", "{\"maxLevel\": 2, \"sortOrder\": \"level_type\"}"},
            {"raw/sortOrderNull", "{\"maxLevel\": 2, \"sortOrder\": null}"},
            {"raw/itemTypesByName", "{\"maxLevel\": 2, \"itemTypes\": [\"WANIKANI_KANJI\"]}"},
            {"raw/itemTypesByDbName", "{\"maxLevel\": 2, \"itemTypes\": [\"kanji\"]}"},
            {"raw/itemTypesNull", "{\"maxLevel\": 2, \"itemTypes\": null}"},
            {"raw/stagesSingleString", "{\"maxLevel\": 2, \"srsStages\": \"burned\"}"},
            {"raw/stagesDuplicate", "{\"srsStages\": [\"burned\", \"burned\"]}"},
            {"raw/jlptAsStrings", "{\"jlptLevels\": [\"5\"], \"itemTypes\": [\"WANIKANI_KANJI\"]}"},
            {"raw/leechesAsString", "{\"leechesOnly\": \"true\", \"maxLevel\": 3}"},
            {"raw/leechesAsNumber", "{\"leechesOnly\": 1, \"maxLevel\": 3}"},
            {"raw/hugeLevel", "{\"minLevel\": 99999999999}"},
            {"raw/hugeHours", "{\"upcomingReviewLessThan\": 2147483647}"},
            {"raw/starsWhenOff", "{\"starRatings\": [1]}"},
    };

    @Test
    public void advancedSearch() throws Exception {
        final ScenarioRunner runner = new ScenarioRunner(context, testContext);
        try (final GoldenWriter w = GoldenWriter.openJsonl("search/advanced.jsonl", "search.advanced",
                "util/SearchUtil.searchSubjects(2, json), model/AdvancedSearchParameters (Jackson, db/Converters),"
                        + " adapter/search/SearchResultAdapter.setResult, enums/SearchSortOrder")) {
            final Object[][] groups = {
                    {"fresh", false, false, false},
                    {"progress", true, false, false},
                    {"progress-stars", true, true, false},
                    {"progress-hidden", true, false, true},
            };
            for (final Object[] g: groups) {
                final String group = (String) g[0];
                final boolean progress = (Boolean) g[1];
                final boolean stars = (Boolean) g[2];
                final List<Long> hide = (Boolean) g[3] ? hiddenIds() : new ArrayList<>();
                final Map<Long, Long> original = setUpGroup(runner, progress, stars, hide);
                w.add("group/" + group, obj("clockMs", Clock.now(), "progressFile",
                                progress ? ScenarioRunner.JSON.readTree(progressFile(Clock.now())) : null,
                                "starRatings", progress ? stars() : new LinkedHashMap<>(), "starRatingsEnabled", stars,
                                "hiddenIds", hide),
                        stateDump());
                final Map<String, String> cases = new LinkedHashMap<>();
                if (group.equals("fresh")) {
                    final Map<String, String> all = advancedCases();
                    for (final String k: new String[] {"empty", "sort/TYPE/levels<=6", "sort/STAGE_TYPE/levels<=6",
                            "stage/locked", "stage/initial", "stage/locked+initial/levels6-8", "level/3-3", "jlpt/N5/kanji"}) {
                        cases.put(k, all.get(k));
                    }
                }
                else if (group.equals("progress")) {
                    cases.putAll(advancedCases());
                    cases.putAll(starCases());
                    for (final String[] r: RAW) {
                        cases.put(r[0], r[1]);
                    }
                }
                else if (group.equals("progress-stars")) {
                    cases.putAll(starCases());
                    cases.put("raw/starsWhenOn", "{\"starRatings\": [1]}");
                    cases.put("stars/withStage", json(withStars()));
                }
                else {
                    final Map<String, String> all = advancedCases();
                    for (final String k: new String[] {"sort/TYPE/levels<=6", "sort/LEVEL_TYPE/levels<=6", "level/3-3",
                            "level/1-60", "stage/initial", "stage/burned", "type/WANIKANI_RADICAL", "leeches"}) {
                        cases.put(k, all.get(k));
                    }
                }
                for (final Map.Entry<String, String> e: cases.entrySet()) {
                    w.add(group + "/" + e.getKey(), obj("parameters", e.getValue(), "group", group), run(2, e.getValue()));
                }
                tearDownGroup(runner, original);
            }
        }
    }

    private static AdvancedSearchParameters withStars() {
        final AdvancedSearchParameters a = p();
        a.starRatings.addAll(Arrays.asList(1, 2));
        a.srsStages.addAll(Arrays.asList("prepass:0", "prepass:1", "prepass:2", "prepass:3"));
        a.sortOrder = SearchSortOrder.STAGE_TYPE;
        return a;
    }

    // ---- the form ----

    private static final int[] TEXT_IDS = {R.id.minLevel, R.id.maxLevel, R.id.minFrequency, R.id.maxFrequency,
            R.id.reviewLessHours, R.id.reviewMoreHours, R.id.incorrectHours, R.id.burnedLessDays, R.id.burnedMoreDays};
    private static final String[] TEXT_NAMES = {"minLevel", "maxLevel", "minFrequency", "maxFrequency", "reviewLessHours",
            "reviewMoreHours", "incorrectHours", "burnedLessDays", "burnedMoreDays"};
    private static final int[] SWITCH_IDS = {R.id.limitToLeeches,
            R.id.starRating0, R.id.starRating1, R.id.starRating2, R.id.starRating3, R.id.starRating4, R.id.starRating5,
            R.id.srsStage00, R.id.srsStage01, R.id.srsStage02, R.id.srsStage03, R.id.srsStage04, R.id.srsStage05,
            R.id.srsStage06, R.id.srsStage07, R.id.srsStage08, R.id.srsStage09, R.id.srsStage10, R.id.srsStage11,
            R.id.srsStage12, R.id.srsStage13, R.id.srsStage14, R.id.srsStage15, R.id.srsStage16, R.id.srsStage17,
            R.id.srsStage18, R.id.srsStage19,
            R.id.itemTypeRadical, R.id.itemTypeKanji, R.id.itemTypeVocabulary, R.id.itemTypeKanaVocabulary,
            R.id.jlptLevelNone, R.id.jlptLevelN5, R.id.jlptLevelN4, R.id.jlptLevelN3, R.id.jlptLevelN2, R.id.jlptLevelN1,
            R.id.joyoGradeNone, R.id.joyoGrade1, R.id.joyoGrade2, R.id.joyoGrade3, R.id.joyoGrade4, R.id.joyoGrade5,
            R.id.joyoGrade6, R.id.joyoGrade7};
    private static final String[] SWITCH_NAMES = {"limitToLeeches",
            "starRating0", "starRating1", "starRating2", "starRating3", "starRating4", "starRating5",
            "srsStage00", "srsStage01", "srsStage02", "srsStage03", "srsStage04", "srsStage05", "srsStage06", "srsStage07",
            "srsStage08", "srsStage09", "srsStage10", "srsStage11", "srsStage12", "srsStage13", "srsStage14", "srsStage15",
            "srsStage16", "srsStage17", "srsStage18", "srsStage19",
            "itemTypeRadical", "itemTypeKanji", "itemTypeVocabulary", "itemTypeKanaVocabulary",
            "jlptLevelNone", "jlptLevelN5", "jlptLevelN4", "jlptLevelN3", "jlptLevelN2", "jlptLevelN1",
            "joyoGradeNone", "joyoGrade1", "joyoGrade2", "joyoGrade3", "joyoGrade4", "joyoGrade5", "joyoGrade6", "joyoGrade7"};

    private interface FormAction {
        Object run(AdvancedSearchFormView form) throws Exception;
    }

    private static Object onMain(final boolean starsEnabled, final FormAction action) throws Exception {
        setStars(starsEnabled);
        final AtomicReference<Object> result = new AtomicReference<>();
        final AtomicReference<Exception> error = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            try {
                final AdvancedSearchFormView form =
                        new AdvancedSearchFormView(new ContextThemeWrapper(context, R.style.KanjiKodamaLightTheme));
                result.set(action.run(form));
            }
            catch (final Exception e) {
                error.set(e);
            }
        });
        setStars(false);
        if (error.get() != null) {
            throw error.get();
        }
        return result.get();
    }

    /** What the form shows: visible switches with their labels, and the sort order choices. */
    private static Object layout(final AdvancedSearchFormView form) {
        final List<Object> switches = new ArrayList<>();
        for (int i = 0; i < SWITCH_IDS.length; i++) {
            final View v = form.findViewById(SWITCH_IDS[i]);
            final View parent = (View) v.getParent();
            final Object tag = v.getTag(R.id.advancedSearchSwitchTag);
            String label = null;
            if (SWITCH_NAMES[i].startsWith("srsStage")) {
                final int labelId = form.getResources().getIdentifier(SWITCH_NAMES[i] + "Label", "id", context.getPackageName());
                final View l = form.findViewById(labelId);
                if (l instanceof android.widget.TextView) {
                    label = ((android.widget.TextView) l).getText().toString();
                }
            }
            switches.add(obj("name", SWITCH_NAMES[i], "tag", tag == null ? null : String.valueOf(tag),
                    "visible", parent.getVisibility() == View.VISIBLE, "label", label));
        }
        final Spinner spinner = form.findViewById(R.id.sortOrder);
        final List<Object> orders = new ArrayList<>();
        for (int i = 0; i < spinner.getAdapter().getCount(); i++) {
            orders.add(String.valueOf(spinner.getAdapter().getItem(i)));
        }
        return obj("switches", switches, "sortOrders", orders);
    }

    private static Object extract(final AdvancedSearchFormView form) throws Exception {
        final AdvancedSearchParameters p = form.extractParameters();
        final String json = json(p);
        return obj("json", json, "parsed", ScenarioRunner.JSON.readTree(json));
    }

    /** Fill the form from a spec {texts: {name: text}, on: [switch names], sortOrder: index}. */
    private static void fill(final AdvancedSearchFormView form, final JsonNode spec) {
        for (int i = 0; i < TEXT_IDS.length; i++) {
            if (spec.path("texts").has(TEXT_NAMES[i])) {
                ((EditText) form.findViewById(TEXT_IDS[i])).setText(spec.path("texts").get(TEXT_NAMES[i]).asText());
            }
        }
        for (final JsonNode on: spec.path("on")) {
            final int idx = Arrays.asList(SWITCH_NAMES).indexOf(on.asText());
            ((SwitchCompat) form.findViewById(SWITCH_IDS[idx])).setChecked(true);
        }
        if (spec.has("sortOrder")) {
            ((Spinner) form.findViewById(R.id.sortOrder)).setSelection(spec.get("sortOrder").asInt());
        }
    }

    private static final String[] FORM_SPECS = {
            "{}",
            "{\"texts\": {\"minLevel\": \"3\", \"maxLevel\": \"12\"}}",
            "{\"texts\": {\"minLevel\": \"0007\", \"maxLevel\": \"\"}}",
            "{\"texts\": {\"minLevel\": \"99999999999\", \"maxLevel\": \"2147483647\"}}",
            "{\"texts\": {\"minLevel\": \"-3\", \"maxLevel\": \" 5\", \"minFrequency\": \"+4\", \"maxFrequency\": \"１２\"}}",
            "{\"texts\": {\"minLevel\": \"1.5\", \"maxLevel\": \"abc\"}}",
            "{\"texts\": {\"minFrequency\": \"1\", \"maxFrequency\": \"500\", \"reviewLessHours\": \"24\","
                    + " \"reviewMoreHours\": \"1\", \"incorrectHours\": \"48\", \"burnedLessDays\": \"30\","
                    + " \"burnedMoreDays\": \"7\"}}",
            "{\"on\": [\"limitToLeeches\"], \"sortOrder\": 3}",
            "{\"sortOrder\": 1}",
            "{\"sortOrder\": 2}",
            "{\"on\": [\"srsStage00\", \"srsStage01\", \"srsStage02\", \"srsStage03\", \"srsStage04\", \"srsStage05\","
                    + " \"srsStage06\", \"srsStage07\", \"srsStage08\", \"srsStage09\", \"srsStage10\", \"srsStage11\","
                    + " \"srsStage12\", \"srsStage13\", \"srsStage14\", \"srsStage15\", \"srsStage16\", \"srsStage17\","
                    + " \"srsStage18\", \"srsStage19\"]}",
            "{\"on\": [\"itemTypeRadical\", \"itemTypeKanji\", \"itemTypeVocabulary\", \"itemTypeKanaVocabulary\"]}",
            "{\"on\": [\"jlptLevelNone\", \"jlptLevelN5\", \"jlptLevelN4\", \"jlptLevelN3\", \"jlptLevelN2\", \"jlptLevelN1\","
                    + " \"joyoGradeNone\", \"joyoGrade1\", \"joyoGrade2\", \"joyoGrade3\", \"joyoGrade4\", \"joyoGrade5\","
                    + " \"joyoGrade6\", \"joyoGrade7\"]}",
            "{\"on\": [\"starRating0\", \"starRating3\", \"starRating5\"]}",
    };

    /** Parameter JSON injected into the form (Refine on the results screen), then extracted again. */
    private static final String[] INJECT = {
            "{}",
            "{\"minLevel\": 5, \"maxLevel\": 5}",
            "{\"minLevel\": 2, \"maxLevel\": 9, \"minFrequency\": 10, \"maxFrequency\": 20, \"leechesOnly\": true,"
                    + " \"upcomingReviewLessThan\": 24, \"upcomingReviewMoreThan\": 2, \"incorrectAnswerWithin\": 12,"
                    + " \"burnedLessThan\": 30, \"burnedMoreThan\": 3, \"sortOrder\": \"AVAILABLE_AT_TYPE\","
                    + " \"starRatings\": [1, 4], \"srsStages\": [\"locked\", \"prepass:2\", \"master\", \"burned\"],"
                    + " \"itemTypes\": [\"WANIKANI_KANJI\", \"WANIKANI_KANA_VOCAB\"], \"jlptLevels\": [0, 3],"
                    + " \"joyoGrades\": [7]}",
            "{\"srsStages\": [\"prepass:5\", \"pass:3\", \"bogus\"], \"jlptLevels\": [6], \"joyoGrades\": [8, 9],"
                    + " \"starRatings\": [7]}",
            "{\"minLevel\": -2, \"sortOrder\": \"STAGE_TYPE\"}",
    };

    @Test
    public void form() throws Exception {
        try (final GoldenWriter w = GoldenWriter.open("search/advanced-form.json", "search.advancedForm",
                "views/AdvancedSearchFormView (layout advanced_search.xml): extractParameters, injectParameters")) {
            for (final boolean stars: new boolean[] {false, true}) {
                w.add("layout/stars=" + stars, obj("starRatingsEnabled", stars), onMain(stars, AdvancedSearchGoldenTest::layout));
            }
            for (final boolean stars: new boolean[] {false, true}) {
                for (int i = 0; i < FORM_SPECS.length; i++) {
                    final JsonNode spec = ScenarioRunner.JSON.readTree(FORM_SPECS[i]);
                    w.add(String.format(Locale.ROOT, "extract/stars=%s/%02d", stars, i),
                            obj("starRatingsEnabled", stars, "fill", spec),
                            onMain(stars, form -> {
                                fill(form, spec);
                                return extract(form);
                            }));
                }
            }
            for (int i = 0; i < INJECT.length; i++) {
                final String in = INJECT[i];
                w.add(String.format(Locale.ROOT, "inject/%02d", i), obj("parameters", in, "starRatingsEnabled", true),
                        onMain(true, form -> {
                            form.injectParameters(Converters.getObjectMapper().readValue(in, AdvancedSearchParameters.class));
                            return extract(form);
                        }));
            }
        }
    }
}
