/*
 * KanjiKodama golden fixtures (Tier B): runs inside the real debug app on a device or emulator.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.Cursor;
import android.os.Bundle;

import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.fasterxml.jackson.databind.JsonNode;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.enums.SessionType;
import com.smouldering_durtles.wk.jobs.ReportSessionItemJob;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.local.LocalContent;
import com.smouldering_durtles.wk.local.LocalMode;
import com.smouldering_durtles.wk.local.ProgressStore;
import com.smouldering_durtles.wk.util.ObjectSupport;

import org.json.JSONObject;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.TimeZone;

/**
 * Writes golden fixtures for the code bound to Room and WkApplication. It RESETS THE APP'S PROGRESS: back up the
 * app data first (see web/test/golden/README.md).
 *
 * <ul>
 *     <li>{@link #scenarios()}: every androidTest asset golden-scenarios/*.json, one fixture per scenario
 *     (instrumentation argument {@code scenario} limits it to a comma-separated list of names).</li>
 *     <li>{@link #srsOutcome()}: lesson and review outcome processing of ReportSessionItemJob.</li>
 *     <li>{@link #progressDescribe()}: ProgressStore.describe on the inputs in golden-inputs/progress-describe.json
 *     and on the owner's phone export (pushed to golden-in/ by run.sh).</li>
 *     <li>{@link #progressRealExport()}: restore + export round trip of that export.</li>
 * </ul>
 *
 * <p>Fixtures go to the app's external files dir, golden/, mirroring web/test/golden/.</p>
 */
@LargeTest
public final class ScenarioGoldenTest {
    private static final String SCENARIO_SOURCES = "local/LocalProgression, local/Curriculum, local/FastTravel, local/LevelTest,"
            + " local/ProgressStore, jobs/ReportSessionItemJob, tasks/WaniKaniImporter.apply";

    private static Context context;
    private static Context testContext;

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
        // Let WkApplication's startup task (ordering, progression, task cleanup) finish before we reset things.
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

    @Test
    public void scenarios() throws Exception {
        final Bundle args = InstrumentationRegistry.getArguments();
        final String only = args.getString("scenario");
        final List<String> wanted = only == null || only.isEmpty() ? null : Arrays.asList(only.split(","));
        final String[] names = testContext.getAssets().list("golden-scenarios");
        assertTrue("no scenarios", names != null && names.length > 0);
        Arrays.sort(names);
        final ScenarioRunner runner = new ScenarioRunner(context, testContext);
        final List<String> failures = new ArrayList<>();
        int ran = 0;
        for (final String file: names) {
            if (!file.endsWith(".json")) {
                continue;
            }
            final String name = file.substring(0, file.length() - 5);
            if (wanted != null && !wanted.contains(name)) {
                continue;
            }
            final JsonNode scenario = ScenarioRunner.JSON.readTree(ScenarioRunner.readAsset(testContext, "golden-scenarios/" + file));
            final long started = System.currentTimeMillis();
            try (final GoldenWriter w = GoldenWriter.open("scenarios/" + name + ".json", "scenario", SCENARIO_SOURCES)) {
                runner.run(scenario, w);
            } catch (final Throwable t) {
                failures.add(name + ": " + t);
                android.util.Log.e("ScenarioGoldenTest", "scenario " + name + " failed", t);
            }
            android.util.Log.i("ScenarioGoldenTest", "scenario " + name + " took " + (System.currentTimeMillis() - started) + " ms");
            ran++;
        }
        assertTrue("no scenario matched " + only, ran > 0);
        assertTrue("failed scenarios: " + failures, failures.isEmpty());
    }

    // --- lesson and review outcome -----------------------------------------------------------------

    private static final String[] OUTCOME_COLUMNS = {
            "srsStage", "unlockedAt", "startedAt", "availableAt", "passedAt", "burnedAt", "resurrectedAt", "passed",
            "meaningCorrect", "meaningIncorrect", "meaningMaxStreak", "meaningCurrentStreak",
            "readingCorrect", "readingIncorrect", "readingMaxStreak", "readingCurrentStreak",
            "percentageCorrect", "lastIncorrectAnswer",
    };

    private static Map<String, Object> readRow(final SupportSQLiteDatabase sql, final long id) {
        final Map<String, Object> out = new LinkedHashMap<>();
        final StringBuilder cols = new StringBuilder();
        for (final String c: OUTCOME_COLUMNS) {
            cols.append(cols.length() == 0 ? "" : ", ").append('`').append(c).append('`');
        }
        try (final Cursor c = sql.query("SELECT " + cols + " FROM subject WHERE id = ?", new Object[] {id})) {
            c.moveToFirst();
            for (int i = 0; i < OUTCOME_COLUMNS.length; i++) {
                out.put(OUTCOME_COLUMNS[i], c.getLong(i));
            }
        }
        return out;
    }

    private static long pickSubject(final SupportSQLiteDatabase sql, final String object, final int srsSystem) {
        try (final Cursor c = sql.query("SELECT id FROM subject WHERE hiddenAt = 0 AND object = ? AND srsSystemId = ?"
                + " ORDER BY level DESC, id LIMIT 1", new Object[] {object, srsSystem})) {
            return c.moveToFirst() ? c.getLong(0) : 0;
        }
    }

    /** About 500 synthetic starting states run through ReportSessionItemJob.runLocal; records that subject's row. */
    @Test
    public void srsOutcome() throws Exception {
        final AppDatabase db = WkApplication.getDatabase();
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        new ScenarioRunner(context, testContext).baseReset(1);
        final String[][] kinds = {
                {"radical", "1"}, {"radical", "2"}, {"kanji", "1"}, {"kanji", "2"},
                {"vocabulary", "1"}, {"vocabulary", "2"}, {"kana_vocabulary", "1"},
        };
        final List<long[]> subjects = new ArrayList<>();
        final List<String> objects = new ArrayList<>();
        for (final String[] k: kinds) {
            final long id = pickSubject(sql, k[0], Integer.parseInt(k[1]));
            if (id != 0) {
                subjects.add(new long[] {id, Integer.parseInt(k[1])});
                objects.add(k[0]);
            }
        }
        final Random r = new Random(20261017L);
        final long hour = ScenarioRunner.HOUR;
        try (final GoldenWriter w = GoldenWriter.open("srs/outcome.json", "srs.outcome",
                "jobs/ReportSessionItemJob.processLessonFinished, processReviewFinished (through runLocal, local mode)")) {
            for (int i = 0; i < 504; i++) {
                final int k = i % subjects.size();
                final long id = subjects.get(k)[0];
                final String object = objects.get(k);
                final boolean radical = "radical".equals(object);
                final boolean lesson = i % 6 == 0;
                // Timestamp: mostly random minutes; every third case 0-45 s before the top of an hour, so +30 s crosses it.
                long ts = ScenarioRunner.T0 + (long) r.nextInt(30 * 24 * 60) * 60_000L + r.nextInt(60_000);
                if (i % 3 == 1) {
                    ts = ts - ts % hour + hour - 1000L * r.nextInt(46);
                }
                final Map<String, Object> before = new LinkedHashMap<>();
                final int stage = lesson ? 0 : 1 + r.nextInt(9);
                final long unlockedAt = ts - (1 + r.nextInt(2000)) * hour;
                final long startedAt = lesson ? 0 : unlockedAt + hour;
                final boolean passedBefore = !lesson && (stage >= 5 || r.nextInt(4) == 0);
                final boolean resurrected = !lesson && stage < 9 && r.nextInt(12) == 0;
                final long burnedAt = stage == 9 || resurrected ? startedAt + 2000 * hour : 0;
                final int mc = lesson ? 0 : r.nextInt(25);
                final int mi = lesson ? 0 : r.nextInt(8);
                final int rc = lesson || radical ? 0 : r.nextInt(25);
                final int ri = lesson || radical ? 0 : r.nextInt(8);
                final int mcs = mc == 0 ? 0 : r.nextInt(mc + 1);
                final int rcs = rc == 0 ? 0 : r.nextInt(rc + 1);
                before.put("srsStage", stage);
                before.put("unlockedAt", unlockedAt);
                before.put("startedAt", startedAt);
                before.put("availableAt", lesson || stage == 9 ? 0 : ts - ts % hour - r.nextInt(48) * hour);
                before.put("passedAt", passedBefore ? startedAt + hour * 50 : 0);
                before.put("burnedAt", burnedAt);
                before.put("resurrectedAt", resurrected ? burnedAt + 100 * hour : 0);
                before.put("passed", passedBefore ? 1 : 0);
                before.put("meaningCorrect", mc);
                before.put("meaningIncorrect", mi);
                before.put("meaningMaxStreak", Math.min(mc, mcs + r.nextInt(5)));
                before.put("meaningCurrentStreak", mcs);
                before.put("readingCorrect", rc);
                before.put("readingIncorrect", ri);
                before.put("readingMaxStreak", Math.min(rc, rcs + r.nextInt(5)));
                before.put("readingCurrentStreak", rcs);
                final int total = mc + mi + rc + ri;
                before.put("percentageCorrect", total == 0 ? 0 : (mc + rc) * 100 / total);
                before.put("lastIncorrectAnswer", r.nextInt(3) == 0 ? ts - 30 * hour : 0);
                final StringBuilder sets = new StringBuilder();
                final Object[] vals = new Object[before.size() + 1];
                int j = 0;
                for (final Map.Entry<String, Object> e: before.entrySet()) {
                    sets.append(j == 0 ? "" : ", ").append('`').append(e.getKey()).append("` = ?");
                    vals[j++] = e.getValue();
                }
                vals[j] = id;
                sql.execSQL("UPDATE subject SET " + sets + " WHERE id = ?", vals);
                // Answers: weighted towards 0 wrong; radicals have no reading question.
                final int wm = lesson ? 0 : weighted(r);
                final int wr = lesson || radical ? 0 : weighted(r);
                final SessionType type = lesson ? SessionType.LESSON : SessionType.REVIEW;
                new ReportSessionItemJob(id, 0, type, wm, wr, ts, false).runLocal();
                w.add(String.format(Locale.ROOT, "%03d-%s-%s", i, type.name().toLowerCase(Locale.ROOT), object),
                        obj("subject", obj("id", id, "object", object, "srsSystemId", subjects.get(k)[1]),
                                "type", type.name(), "meaningIncorrect", wm, "readingIncorrect", wr, "timestamp", ts,
                                "before", before),
                        obj("after", readRow(sql, id)));
            }
        }
        new ScenarioRunner(context, testContext).baseReset(1);
    }

    private static int weighted(final Random r) {
        final int x = r.nextInt(10);
        return x < 6 ? 0 : x < 8 ? 1 : x < 9 ? 2 : 3;
    }

    // --- ProgressStore.describe ----------------------------------------------------------------------

    @Test
    public void progressDescribe() throws Exception {
        final JsonNode inputs = ScenarioRunner.JSON.readTree(ScenarioRunner.readAsset(testContext, "golden-inputs/progress-describe.json"));
        try (final GoldenWriter w = GoldenWriter.open("progress/describe.json", "progress.describe",
                "local/ProgressStore.describe (Locale.US, TimeZone UTC)")) {
            for (final JsonNode in: inputs) {
                final String text = in.get("text").asText();
                Object exportedAt = null;
                try {
                    exportedAt = new JSONObject(text).optLong("exportedAt");
                } catch (final Exception e) {
                    // malformed; describe reports it below
                }
                Map<String, Object> out;
                try {
                    out = obj("ok", true, "summary", ProgressStore.describe(text), "exportedAt", exportedAt);
                } catch (final Exception e) {
                    out = obj("ok", false, "error", e.getClass().getName(), "message", e.getMessage(), "exportedAt", exportedAt);
                }
                w.add(in.get("name").asText(), obj("text", text), out);
            }
            // The owner's real phone export, pushed by run.sh rather than duplicated as an asset; input names the file.
            final String real = ScenarioRunner.readPushed(context, REAL_EXPORT);
            w.add("real-android-export", obj("file", REAL_EXPORT),
                    obj("ok", true, "summary", ProgressStore.describe(real), "exportedAt", new JSONObject(real).optLong("exportedAt")));
        }
    }

    // --- the owner's real export ---------------------------------------------------------------------

    /** Relative to golden-in/ on the device and to web/test/golden/ in the repo. */
    static final String REAL_EXPORT = "progress/android-export.json";

    /**
     * Restores the owner's phone export (clock pinned to its exportedAt, from the empty base state) and exports it
     * again; records the re-export and every difference from the input, then repeats once to show it is stable.
     */
    @Test
    public void progressRealExport() throws Exception {
        final AppDatabase db = WkApplication.getDatabase();
        final String text = ScenarioRunner.readPushed(context, REAL_EXPORT);
        final JsonNode input = ScenarioRunner.JSON.readTree(text);
        final ScenarioRunner runner = new ScenarioRunner(context, testContext);
        try (final GoldenWriter w = GoldenWriter.open("progress/android-roundtrip.json", "progress.roundTrip",
                "local/ProgressStore.restore + export")) {
            runner.baseReset(1);
            final long clock = input.get("exportedAt").asLong();
            Clock.pin(clock);
            ProgressStore.restore(db, text);
            final String first = ProgressStore.export(db);
            final JsonNode firstTree = ScenarioRunner.JSON.readTree(first);
            final List<Object> differences = new ArrayList<>();
            diff("", input, firstTree, differences);
            // No differences means the re-export equals the input file; textIdentical compares the bytes as well.
            w.add("restore-then-export", obj("file", REAL_EXPORT, "clockMs", clock, "from", "empty base state"),
                    obj("differences", differences, "textIdentical", first.equals(text)));
            ProgressStore.restore(db, first);
            final String second = ProgressStore.export(db);
            final List<Object> again = new ArrayList<>();
            diff("", firstTree, ScenarioRunner.JSON.readTree(second), again);
            w.add("second-round", obj("of", "restore-then-export", "clockMs", clock),
                    obj("differences", again, "textIdentical", second.equals(first)));
            runner.baseReset(1);
        }
    }

    /** Differences between two JSON trees; arrays of objects with an "id" are matched by id, others by index. */
    private static void diff(final String path, final JsonNode a, final JsonNode b, final List<Object> out) {
        if (a == null || b == null || a.getNodeType() != b.getNodeType()) {
            if (!(a == null && b == null)) {
                out.add(obj("path", path, "input", a, "output", b));
            }
            return;
        }
        if (a.isObject()) {
            final java.util.Set<String> names = new java.util.TreeSet<>();
            a.fieldNames().forEachRemaining(names::add);
            b.fieldNames().forEachRemaining(names::add);
            for (final String n: names) {
                diff(path + "/" + n, a.get(n), b.get(n), out);
            }
        }
        else if (a.isArray()) {
            final boolean byId = a.size() > 0 && a.get(0).has("id") || b.size() > 0 && b.get(0).has("id");
            if (byId) {
                final Map<Long, JsonNode> ma = new LinkedHashMap<>();
                final Map<Long, JsonNode> mb = new LinkedHashMap<>();
                final List<Long> orderA = new ArrayList<>();
                final List<Long> orderB = new ArrayList<>();
                for (final JsonNode x: a) {
                    ma.put(x.get("id").asLong(), x);
                    orderA.add(x.get("id").asLong());
                }
                for (final JsonNode x: b) {
                    mb.put(x.get("id").asLong(), x);
                    orderB.add(x.get("id").asLong());
                }
                if (orderA.size() == orderB.size() && ma.keySet().equals(mb.keySet()) && !orderA.equals(orderB)) {
                    out.add(obj("path", path, "orderDiffers", true));
                }
                final java.util.Set<Long> ids = new java.util.TreeSet<>(ma.keySet());
                ids.addAll(mb.keySet());
                for (final Long id: ids) {
                    diff(path + "[id=" + id + "]", ma.get(id), mb.get(id), out);
                }
            }
            else {
                for (int i = 0; i < Math.max(a.size(), b.size()); i++) {
                    diff(path + "[" + i + "]", a.get(i), b.get(i), out);
                }
            }
        }
        else if (!a.equals(b)) {
            out.add(obj("path", path, "input", a, "output", b));
        }
    }
}
