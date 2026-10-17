/*
 * KanjiKodama golden fixtures: runs one scenario (start progress file, curriculum, timed steps) inside the real app.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;

import android.content.Context;
import android.database.Cursor;

import androidx.sqlite.db.SupportSQLiteDatabase;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.api.model.ApiAssignment;
import com.smouldering_durtles.wk.api.model.ApiLevelProgression;
import com.smouldering_durtles.wk.api.model.ApiReviewStatistic;
import com.smouldering_durtles.wk.api.model.ApiStudyMaterial;
import com.smouldering_durtles.wk.api.model.ApiUser;
import com.smouldering_durtles.wk.api.model.WaniKaniEntity;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.Converters;
import com.smouldering_durtles.wk.db.model.SessionItem;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.enums.SessionItemState;
import com.smouldering_durtles.wk.enums.SessionType;
import com.smouldering_durtles.wk.jobs.ReportSessionItemJob;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.local.Curriculum;
import com.smouldering_durtles.wk.local.FastTravel;
import com.smouldering_durtles.wk.local.LevelTest;
import com.smouldering_durtles.wk.local.LocalProgression;
import com.smouldering_durtles.wk.local.Placement;
import com.smouldering_durtles.wk.local.ProgressStore;
import com.smouldering_durtles.wk.tasks.WaniKaniImporter;
import com.smouldering_durtles.wk.util.ObjectSupport;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Interprets the scenario DSL (JSON in androidTest assets golden-scenarios/) and records one golden case per step.
 *
 * <p>Scenario: {@code {name, description, mode, seed, start, steps}}. {@code start} is null (empty progress),
 * {@code {"file": "<asset under golden-scenarios/start/>"}}, {@code {"inline": {...progress file...}}} or
 * {@code {"generate": {...}}}. Every step may carry {@code advanceHours} (the clock moves before the action).
 * {@code atHours} pins it to T0 + hours instead. For second- and millisecond-precise timing, {@code advanceSeconds}
 * (applied after {@code advanceHours}) and {@code atMs} (an absolute Unix time in ms, applied after {@code atHours})
 * work the same way.</p>
 *
 * <p>Per-answer time ({@code lesson}, {@code review}): without any of the keys below every answer of a step is
 * reported at the step's clock, as before. {@code spacingSeconds} moves the clock forward that much before every
 * answer but the first; {@code offsetsSeconds} (one non-decreasing number per answered subject) pins the clock to
 * the step's clock + offset before each answer instead. Every answer is a ReportSessionItemJob with the clock at that
 * moment as its timestamp, and LocalProgression (unlocks, level-up, level_progression) runs at that same clock, like
 * the app's immediate reporting. {@code delayedReport: true} models the "delay result upload" setting instead: the
 * answer times are only recorded, and after the last answer (and {@code reportAfterSeconds} more, default 0) every
 * job runs in answer order with its answer time as timestamp while the clock (LocalProgression, unlocks) stays at the
 * report time. The subjects are still selected once, at the step's clock (the app builds its queue at session
 * start). With any of these keys, {@code resolved.answers} lists {@code {id, answeredAtMs, reportedAtMs}}.
 * {@code grind} takes {@code spacingSeconds} too: within a round, the clock moves that much before every lesson and
 * every review but the first of each kind; the times are then in each round's {@code lessonTimesMs} and
 * {@code reviewTimesMs}.</p>
 *
 * <p>Every scenario starts from the same base: randomness seeded with {@code seed} (default 1), clock pinned
 * to {@link #T0}, level test discarded, sync reminder off, {@code ProgressStore.restore} of an empty WaniKani-order
 * file, then {@code restore} of the start file (or of an empty file in {@code mode}). Case "00-start" records that.</p>
 *
 * <p>When an action throws from app code, the step's {@code result} is {@code {"error": exception class, "message"}}
 * and the state snapshot is taken as usual; exceptions thrown by the runner itself still fail the scenario.</p>
 *
 * <p>Every case also records {@code reminders.syncReminder}, the "sync_reminder" property ("You may have pending
 * unlocks - don't forget to sync"): ReportSessionItemJob sets it when a REVIEW makes a subject with amalgamations
 * (a radical or kanji used by others) pass for the first time; only the server-mode assignment sync clears it, so in
 * local mode it stays on (restore, import and curriculum switches leave it alone). The base reset turns it off, a
 * test-only step that keeps scenarios independent.</p>
 *
 * <p>Actions (subject selections {@code where} = {object, level, ids, exclude, limit}, applied to the lessons
 * or the reviews available at the pinned clock, ordered like the app's queues):</p>
 * <ul>
 *     <li>{@code snapshot}, {@code advance}: record only.</li>
 *     <li>{@code lesson} {ids | where}: ReportSessionItemJob(LESSON) at the clock for each.</li>
 *     <li>{@code review} {ids | where, meaningWrong, readingWrong, wrong: {id: [m, r]}, wrongEveryNth: {n, meaning, reading}}:
 *     ReportSessionItemJob(REVIEW).</li>
 *     <li>{@code grind} {until: {level} | {passed: ids} | {noProbation}, lessonsWhere, reviewsWhere, noLessons,
 *     wrongOnce, wrongEveryNth, maxRounds}: rounds of all lessons, clock to the next due review, all due reviews.
 *     The rounds actually played are in {@code resolved.rounds}.</li>
 *     <li>{@code switchCurriculum} / {@code previewCurriculum} {mode}, {@code place}.</li>
 *     <li>{@code fastTravel} {target | levels, windowHours}.</li>
 *     <li>{@code levelTestRound} {round, known: "all" | "none" | {blocks} | {ids}, abandon}: picked ids and the
 *     answers given are in {@code resolved}; {@code levelTestResult}, {@code levelTestStartAtResult},
 *     {@code levelTestDiscard}.</li>
 *     <li>{@code exportRestore}: export, restore it, export again ({@code result.identical}).</li>
 *     <li>{@code restore} {file | inline | fromStep (the export recorded by that case) | generate}.</li>
 *     <li>{@code importWaniKani} {api: {user, assignments, review_statistics, study_materials, level_progressions}},
 *     the collections as WaniKani API envelopes {id, object, data}.</li>
 *     <li>{@code hideSubject} / {@code unhideSubject} {ids | where: {object, level, maxStage, limit}, update (default
 *     true)}: a test-only content change, as when
 *     WaniKani hides a subject: hiddenAt of each subject set to the clock (hide) or 0 (unhide); with update,
 *     LocalProgression.update runs afterwards (as the app's startup task does), {@code result.unlocked} is its count.
 *     {@code result.subjects} lists {id, object, level, hiddenAtBefore, hiddenAt}. The base reset puts back the
 *     content's original hiddenAt of every subject a scenario changed.</li>
 *     <li>{@code progressionUpdate}: LocalProgression.update alone ({@code result.unlocked}).</li>
 * </ul>
 *
 * <p>{@code generate} {userLevel (number, "max" or "max-N"), curriculum, levels, objects, stage, availableInHours, exclude,
 * rows: [{id, stage, passed, availableInHours, set}], tail: {objects, count, stage, availableInHours}}: a progress file
 * with every visible subject of those levels (in the subject table's current order) at one stage, the last {@code count}
 * of them (of {@code objects}, if given) at the tail's stage instead; times relative to the clock. The generated file itself is
 * recorded, so consumers never need to re-implement the generator.</p>
 */
final class ScenarioRunner {
    /** 2026-01-05T09:17:00Z, deliberately not on the hour. */
    static final long T0 = 1767604620000L;
    static final long HOUR = 60L * 60 * 1000;
    static final ObjectMapper JSON = new ObjectMapper();

    private final Context context;
    private final Context testContext;
    private final AppDatabase db;
    private final SupportSQLiteDatabase sql;
    private final List<String> exports = new ArrayList<>();
    /** Content hiddenAt of the subjects hideSubject/unhideSubject changed; static so every runner instance resets it. */
    private static final Map<Long, Long> ORIGINAL_HIDDEN = new LinkedHashMap<>();

    ScenarioRunner(final Context context, final Context testContext) {
        this.context = context;
        this.testContext = testContext;
        db = WkApplication.getDatabase();
        sql = db.getOpenHelper().getWritableDatabase();
    }

    // --- top level -------------------------------------------------------------------------------

    static String readAsset(final Context ctx, final String path) throws Exception {
        try (final InputStream in = ctx.getAssets().open(path)) {
            final ByteArrayOutputStream out = new ByteArrayOutputStream();
            final byte[] buf = new byte[1 << 14];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    /** Put the app in the base state every scenario starts from: no progress, WaniKani order, pinned clock. */
    void baseReset(final long seed) throws Exception {
        ObjectSupport.seedRandom(seed);
        Clock.pin(T0);
        LevelTest.discard(db);
        db.propertiesDao().setSyncReminder(false);
        // Content changes of hideSubject/unhideSubject go back first, before the restore recomputes unlocks.
        for (final Map.Entry<Long, Long> e: ORIGINAL_HIDDEN.entrySet()) {
            sql.execSQL("UPDATE subject SET hiddenAt = ? WHERE id = ?", new Object[] {e.getValue(), e.getKey()});
        }
        ORIGINAL_HIDDEN.clear();
        ProgressStore.restore(db, emptyFile("WANIKANI"));
        exports.clear();
    }

    void run(final JsonNode scenario, final GoldenWriter w) throws Exception {
        final long seed = scenario.path("seed").asLong(1);
        baseReset(seed);
        final String mode = scenario.path("mode").asText("WANIKANI");
        final JsonNode start = scenario.get("start");
        final String startText = start == null || start.isNull() ? emptyFile(mode) : progressFile(start, mode);
        ProgressStore.restore(db, startText);
        w.add("00-start", obj("mode", mode, "seed", seed, "clockStartMs", T0, "startFile", JSON.readTree(startText)),
                snapshot(null));
        int index = 1;
        for (final JsonNode step: scenario.get("steps")) {
            final String action = step.get("action").asText();
            final double advance = step.path("advanceHours").asDouble(0);
            if (advance != 0) {
                Clock.advance(Math.round(advance * HOUR));
            }
            final double advanceSeconds = step.path("advanceSeconds").asDouble(0);
            if (advanceSeconds != 0) {
                Clock.advance(Math.round(advanceSeconds * 1000));
            }
            if (step.has("atHours")) {
                final long target = T0 + Math.round(step.get("atHours").asDouble() * HOUR);
                if (target < Clock.now()) {
                    throw new IllegalArgumentException("atHours " + step.get("atHours") + " is in the past");
                }
                Clock.pin(target);
            }
            if (step.has("atMs")) {
                final long target = step.get("atMs").asLong();
                if (target < Clock.now()) {
                    throw new IllegalArgumentException("atMs " + target + " is in the past");
                }
                Clock.pin(target);
            }
            final long at = Clock.now();
            final Map<String, Object> resolved = new LinkedHashMap<>();
            reviewCounter = 0;
            Object result;
            try {
                result = perform(action, step, resolved);
            } catch (final Exception e) {
                // App code that throws is recorded; errors of the runner itself (bad scenario) still fail the run.
                final StackTraceElement[] trace = e.getStackTrace();
                if (trace.length > 0 && trace[0].getClassName().startsWith(ScenarioRunner.class.getName())) {
                    throw e;
                }
                result = obj("error", e.getClass().getName(), "message", e.getMessage());
            }
            w.add(String.format(Locale.ROOT, "%02d-%s", index, action),
                    obj("action", action, "args", step, "atMs", at, "resolved", resolved), snapshot(result));
            index++;
        }
    }

    // --- state snapshot --------------------------------------------------------------------------

    private Map<String, Object> snapshot(final Object result) throws Exception {
        final long now = Clock.now();
        final String export = ProgressStore.export(db);
        exports.add(export);
        final int level = db.propertiesDao().getUserLevel();
        final int maxGranted = db.propertiesDao().getUserMaxLevelGranted();
        return obj(
                "clockMs", now,
                "result", result,
                "level", level,
                "curriculum", obj("mode", Curriculum.getMode().name(), "maxLevel", Curriculum.maxLevel(),
                        "levelDescription", Curriculum.describeLevel(level)),
                "counts", obj(
                        "lessons", count("SELECT COUNT(*) FROM subject WHERE hiddenAt = 0 AND object IS NOT NULL AND level <= ?"
                                + " AND (resurrectedAt != 0 OR burnedAt = 0) AND unlockedAt != 0 AND startedAt = 0", maxGranted),
                        "reviews", count("SELECT COUNT(*) FROM subject WHERE hiddenAt = 0 AND object IS NOT NULL AND level <= ?"
                                + " AND availableAt != 0 AND availableAt <= ?", maxGranted, now),
                        "reviewsNext24h", count("SELECT COUNT(*) FROM subject WHERE hiddenAt = 0 AND object IS NOT NULL AND level <= ?"
                                + " AND availableAt != 0 AND availableAt <= ?", maxGranted, now + 24 * HOUR)),
                "fastTravel", fastTravelStatus(),
                "levelTest", LevelTest.status(db).name(),
                "reminders", obj("syncReminder", db.propertiesDao().getSyncReminder()),
                "export", JSON.readTree(export));
    }

    private Map<String, Object> fastTravelStatus() {
        final FastTravel.Status s = FastTravel.status(db);
        final List<Object> options = new ArrayList<>();
        for (final FastTravel.Option o: s.options) {
            options.add(obj("target", o.target, "targetDescription", o.targetDescription, "probation", o.probation,
                    "radicals", o.radicals, "minutesPerDay", o.minutesPerDay));
        }
        return obj("level", s.level, "blocked", s.blocked, "options", options);
    }

    private int count(final String query, final Object... args) {
        try (final Cursor c = sql.query(query, args)) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    private List<Long> ids(final String query, final Object... args) {
        final List<Long> out = new ArrayList<>();
        try (final Cursor c = sql.query(query, args)) {
            while (c.moveToNext()) {
                out.add(c.getLong(0));
            }
        }
        return out;
    }

    // --- progress files --------------------------------------------------------------------------

    static String emptyFile(final String mode) throws Exception {
        final ObjectNode root = JSON.createObjectNode();
        root.put("format", ProgressStore.FORMAT);
        root.put("version", ProgressStore.VERSION);
        root.put("exportedAt", T0);
        root.put("userLevel", 1);
        root.putArray("levelProgression");
        root.putArray("subjects");
        root.put("curriculum", mode);
        root.putArray("probation");
        root.putArray("jumps");
        return JSON.writeValueAsString(root);
    }

    /** A progress file from a start or restore spec. */
    private String progressFile(final JsonNode spec, final String mode) throws Exception {
        if (spec.has("file")) {
            return readAsset(testContext, "golden-scenarios/start/" + spec.get("file").asText());
        }
        if (spec.has("inline")) {
            return JSON.writeValueAsString(spec.get("inline"));
        }
        if (spec.has("fromStep")) {
            return exports.get(spec.get("fromStep").asInt());
        }
        if (spec.has("generate")) {
            return generate(spec.get("generate"), mode);
        }
        throw new IllegalArgumentException("bad progress spec " + spec);
    }

    /**
     * Synthetic progress: every visible subject on the given levels (of the subject table's current order) at one
     * SRS stage, plus explicit rows. Times are relative to the clock.
     */
    private String generate(final JsonNode g, final String mode) throws Exception {
        final long now = Clock.now();
        final ObjectNode root = (ObjectNode) JSON.readTree(emptyFile(g.path("curriculum").asText(mode)));
        root.put("exportedAt", now);
        final JsonNode lvl = g.path("userLevel");
        final String lvlText = lvl.asText();
        root.put("userLevel", "max".equals(lvlText) ? Curriculum.maxLevel()
                : lvlText.startsWith("max-") ? Curriculum.maxLevel() - Integer.parseInt(lvlText.substring(4)) : lvl.asInt(1));
        final ArrayNode subjects = (ArrayNode) root.get("subjects");
        final Map<Long, JsonNode> rows = new LinkedHashMap<>();
        for (final JsonNode r: g.path("rows")) {
            rows.put(r.get("id").asLong(), r);
        }
        final Set<Long> exclude = new HashSet<>();
        for (final JsonNode e: g.path("exclude")) {
            exclude.add(e.asLong());
        }
        final Set<Long> done = new HashSet<>();
        if (g.has("levels")) {
            final StringBuilder in = new StringBuilder();
            for (final JsonNode l: g.get("levels")) {
                in.append(in.length() == 0 ? "" : ",").append(l.asInt());
            }
            String q = "SELECT id, object FROM subject WHERE hiddenAt = 0 AND object IS NOT NULL AND level IN (" + in + ")";
            if (g.has("objects")) {
                q += " AND object IN (" + quoted(g.get("objects")) + ")";
            }
            final List<Long> ids = new ArrayList<>();
            final List<String> objects = new ArrayList<>();
            try (final Cursor c = sql.query(q + " ORDER BY level, lessonPosition, id")) {
                while (c.moveToNext()) {
                    if (!exclude.contains(c.getLong(0))) {
                        ids.add(c.getLong(0));
                        objects.add(c.getString(1));
                    }
                }
            }
            // tail: the last `count` of these subjects (optionally only some objects), in the same order, at their own stage.
            final Set<Long> tail = new HashSet<>();
            final JsonNode t = g.path("tail");
            if (t.isObject()) {
                final Set<String> tailObjects = new HashSet<>();
                for (final JsonNode o: t.path("objects")) {
                    tailObjects.add(o.asText());
                }
                int left = t.path("count").asInt(0);
                for (int i = ids.size() - 1; i >= 0 && left > 0; i--) {
                    if (tailObjects.isEmpty() || tailObjects.contains(objects.get(i))) {
                        tail.add(ids.get(i));
                        left--;
                    }
                }
            }
            for (int i = 0; i < ids.size(); i++) {
                final long id = ids.get(i);
                final JsonNode r = rows.get(id);
                subjects.add(r != null ? row(id, objects.get(i), r, now)
                        : tail.contains(id) ? row(id, objects.get(i), t.path("stage").asInt(5), null, t.path("availableInHours").asDouble(100), now)
                        : row(id, objects.get(i), g.path("stage").asInt(5), null, g.path("availableInHours").asDouble(100), now));
                done.add(id);
            }
        }
        for (final Map.Entry<Long, JsonNode> e: rows.entrySet()) {
            if (!done.contains(e.getKey())) {
                subjects.add(row(e.getKey(), objectOf(e.getKey()), e.getValue(), now));
            }
        }
        return JSON.writeValueAsString(root);
    }

    private String objectOf(final long id) {
        try (final Cursor c = sql.query("SELECT object FROM subject WHERE id = ?", new Object[] {id})) {
            return c.moveToFirst() ? c.getString(0) : "";
        }
    }

    private static String quoted(final JsonNode arr) {
        final StringBuilder sb = new StringBuilder();
        for (final JsonNode o: arr.isArray() ? arr : JSON.createArrayNode().add(arr)) {
            sb.append(sb.length() == 0 ? "" : ",").append('\'').append(o.asText().replace("'", "''")).append('\'');
        }
        return sb.toString();
    }

    private static ObjectNode row(final long id, final String object, final JsonNode r, final long now) {
        final ObjectNode o = row(id, object, r.path("stage").asInt(5), r.has("passed") ? r.get("passed").asBoolean() : null,
                r.path("availableInHours").asDouble(0), now);
        // Free-form overrides of export columns, e.g. {"meaningNote": "..."}.
        for (final Iterator<Map.Entry<String, JsonNode>> it = r.path("set").fields(); it.hasNext();) {
            final Map.Entry<String, JsonNode> e = it.next();
            o.set(e.getKey(), e.getValue());
        }
        return o;
    }

    /** One subject row of a progress file: stage 0 = unlocked lesson, 9 = burned. */
    private static ObjectNode row(final long id, final String object, final int stage, final Boolean passedOrNull,
                                  final double availableInHours, final long now) {
        final boolean passed = passedOrNull != null ? passedOrNull : stage >= 5;
        final ObjectNode o = JSON.createObjectNode();
        o.put("id", id);
        o.put("unlockedAt", now - 400 * HOUR);
        if (stage == 0) {
            return o;
        }
        final long avail = now + Math.round(availableInHours * HOUR);
        o.put("srsStage", stage);
        o.put("startedAt", now - 390 * HOUR);
        o.put("passedAt", passed ? now - 200 * HOUR : 0);
        o.put("passed", passed ? 1 : 0);
        o.put("burnedAt", stage == 9 ? now - 100 * HOUR : 0);
        o.put("availableAt", stage == 9 ? 0 : avail - avail % HOUR);
        final boolean radical = "radical".equals(object);
        o.put("meaningCorrect", stage);
        o.put("meaningMaxStreak", stage);
        o.put("meaningCurrentStreak", stage);
        o.put("readingCorrect", radical ? 0 : stage);
        o.put("readingMaxStreak", radical ? 0 : stage);
        o.put("readingCurrentStreak", radical ? 0 : stage);
        o.put("percentageCorrect", 100);
        return o;
    }

    // --- selecting subjects ----------------------------------------------------------------------

    private static final String LESSON_WHERE = "hiddenAt = 0 AND object IS NOT NULL AND level <= 60"
            + " AND (resurrectedAt != 0 OR burnedAt = 0) AND unlockedAt != 0 AND startedAt = 0";
    private static final String REVIEW_WHERE = "hiddenAt = 0 AND object IS NOT NULL AND level <= 60 AND availableAt != 0";

    /** Lessons or reviews available now, filtered by {object, level, ids, exclude, limit}. */
    private List<Long> select(final JsonNode filter, final boolean lessons) {
        final StringBuilder q = new StringBuilder("SELECT id FROM subject WHERE ").append(lessons ? LESSON_WHERE : REVIEW_WHERE);
        if (!lessons) {
            q.append(" AND availableAt <= ").append(Clock.now());
        }
        appendFilter(q, filter);
        q.append(lessons ? " ORDER BY level, lessonPosition, id" : " ORDER BY availableAt, level, lessonPosition, id");
        if (filter != null && filter.has("limit")) {
            q.append(" LIMIT ").append(filter.get("limit").asInt());
        }
        return ids(q.toString());
    }

    private static void appendFilter(final StringBuilder q, final JsonNode filter) {
        if (filter == null || filter.isNull() || filter.isMissingNode()) {
            return;
        }
        if (filter.has("object")) {
            q.append(" AND object IN (").append(quoted(filter.get("object"))).append(')');
        }
        if (filter.has("level")) {
            q.append(" AND level IN (").append(numbers(filter.get("level"))).append(')');
        }
        if (filter.has("ids")) {
            q.append(" AND id IN (").append(numbers(filter.get("ids"))).append(')');
        }
        if (filter.has("exclude")) {
            q.append(" AND id NOT IN (").append(numbers(filter.get("exclude"))).append(')');
        }
    }

    private static String numbers(final JsonNode arr) {
        final StringBuilder sb = new StringBuilder();
        for (final JsonNode o: arr.isArray() ? arr : JSON.createArrayNode().add(arr)) {
            sb.append(sb.length() == 0 ? "" : ",").append(o.asLong());
        }
        return sb.length() == 0 ? "-1" : sb.toString();
    }

    private static List<Long> explicitIds(final JsonNode arr) {
        final List<Long> out = new ArrayList<>();
        for (final JsonNode o: arr) {
            out.add(o.asLong());
        }
        return out;
    }

    // --- actions ---------------------------------------------------------------------------------

    private Object perform(final String action, final JsonNode step, final Map<String, Object> resolved) throws Exception {
        switch (action) {
            case "snapshot":
            case "advance":
                return null;
            case "lesson": {
                final List<Long> list = step.has("ids") ? explicitIds(step.get("ids")) : select(step.get("where"), true);
                final Timing timing = new Timing(step, list.size());
                for (int i = 0; i < list.size(); i++) {
                    timing.answer(i, list.get(i), SessionType.LESSON, 0, 0);
                }
                timing.finish(resolved);
                resolved.put("ids", list);
                return obj("count", list.size());
            }
            case "review": {
                final List<Long> list = step.has("ids") ? explicitIds(step.get("ids")) : select(step.get("where"), false);
                final List<Object> done = new ArrayList<>();
                final Timing timing = new Timing(step, list.size());
                for (int i = 0; i < list.size(); i++) {
                    final long id = list.get(i);
                    final int[] wrong = wrongFor(step, id, null);
                    timing.answer(i, id, SessionType.REVIEW, wrong[0], wrong[1]);
                    done.add(new long[] {id, wrong[0], wrong[1]});
                }
                timing.finish(resolved);
                resolved.put("reviews", done);
                return obj("count", list.size());
            }
            case "grind":
                return grind(step, resolved);
            case "switchCurriculum": {
                final Placement p = Curriculum.switchTo(context, db, Curriculum.Mode.valueOf(step.get("mode").asText()));
                return obj("level", p.level, "backfill", p.backfill);
            }
            case "previewCurriculum": {
                final Curriculum.Preview p = Curriculum.preview(context, db, Curriculum.Mode.valueOf(step.get("mode").asText()));
                return obj("target", p.target.name(), "level", p.placement.level, "backfill", p.placement.backfill,
                        "levelDescription", p.levelDescription);
            }
            case "place": {
                final Placement p = Curriculum.place(db);
                return obj("level", p.level, "backfill", p.backfill);
            }
            case "fastTravel": {
                final int from = Math.max(1, db.propertiesDao().getUserLevel());
                final int target = step.has("target") ? step.get("target").asInt() : from + step.get("levels").asInt();
                resolved.put("from", from);
                resolved.put("target", target);
                final int n;
                if (step.has("windowHours")) {
                    final long window = Math.round(step.get("windowHours").asDouble() * HOUR);
                    resolved.put("windowMs", window);
                    n = FastTravel.travel(db, target, window);
                }
                else {
                    resolved.put("windowMs", FastTravel.COOLDOWN);
                    n = FastTravel.travel(db, target);
                }
                return obj("probation", n);
            }
            case "levelTestRound":
                return levelTestRound(step, resolved);
            case "levelTestResult": {
                final LevelTest.Result r = LevelTest.result(context, db);
                return obj("level", r.level, "description", r.description, "proven", r.proven, "probation", r.probation,
                        "minutesPerDay", r.minutesPerDay);
            }
            case "levelTestStartAtResult": {
                final LevelTest.Outcome o = LevelTest.startAtResult(context, db);
                return obj("level", o.level, "proven", o.proven, "probation", o.probation, "moved", o.moved);
            }
            case "levelTestDiscard":
                LevelTest.discard(db);
                return null;
            case "exportRestore": {
                final String first = ProgressStore.export(db);
                ProgressStore.restore(db, first);
                final String second = ProgressStore.export(db);
                resolved.put("file", JSON.readTree(first));
                return obj("identical", JSON.readTree(first).equals(JSON.readTree(second)));
            }
            case "restore": {
                final String text = progressFile(step, Curriculum.getMode().name());
                resolved.put("file", JSON.readTree(text));
                ProgressStore.restore(db, text);
                return null;
            }
            case "importWaniKani":
                return obj("summary", importWaniKani(step.get("api")));
            case "hideSubject":
            case "unhideSubject":
                return setHidden(step, "hideSubject".equals(action));
            case "progressionUpdate":
                return obj("unlocked", LocalProgression.update(db));
            default:
                throw new IllegalArgumentException("unknown action " + action);
        }
    }

    /** hideSubject / unhideSubject: change the content's hiddenAt, remembering the original for the base reset. */
    private Object setHidden(final JsonNode step, final boolean hide) {
        final long value = hide ? Clock.now() : 0;
        final List<Object> subjects = new ArrayList<>();
        for (final long id: step.has("ids") ? explicitIds(step.get("ids")) : hideSelect(step.get("where"))) {
            final String object;
            final int level;
            final long before;
            try (final Cursor c = sql.query("SELECT object, level, hiddenAt FROM subject WHERE id = ?", new Object[] {id})) {
                if (!c.moveToFirst()) {
                    throw new IllegalArgumentException("no subject " + id);
                }
                object = c.getString(0);
                level = c.getInt(1);
                before = c.getLong(2);
            }
            if (!ORIGINAL_HIDDEN.containsKey(id)) {
                ORIGINAL_HIDDEN.put(id, before);
            }
            sql.execSQL("UPDATE subject SET hiddenAt = ? WHERE id = ?", new Object[] {value, id});
            subjects.add(obj("id", id, "object", object, "level", level, "hiddenAtBefore", before, "hiddenAt", value));
        }
        final Integer unlocked = step.path("update").asBoolean(true) ? LocalProgression.update(db) : null;
        return obj("subjects", subjects, "unlocked", unlocked);
    }

    /**
     * The subjects a hideSubject/unhideSubject {@code where} picks from the subject table as the app lays it out now:
     * {object, level, maxStage (srsStage at most), limit}, visible subjects only, in level/lesson order. Resolving this on
     * the device keeps scenarios valid when the content or the JLPT layout changes; {@code result.subjects} records the ids.
     */
    private List<Long> hideSelect(final JsonNode where) {
        String q = "SELECT id FROM subject WHERE hiddenAt = 0 AND object IS NOT NULL";
        final List<Object> args = new ArrayList<>();
        if (where.has("object")) {
            q += " AND object = ?";
            args.add(where.get("object").asText());
        }
        if (where.has("level")) {
            q += " AND level = ?";
            args.add(where.get("level").asInt());
        }
        if (where.has("maxStage")) {
            q += " AND srsStage <= ?";
            args.add(where.get("maxStage").asInt());
        }
        q += " ORDER BY level, lessonPosition, id LIMIT " + where.path("limit").asInt(1);
        final List<Long> ids = new ArrayList<>();
        try (final Cursor c = sql.query(q, args.toArray())) {
            while (c.moveToNext()) {
                ids.add(c.getLong(0));
            }
        }
        if (ids.isEmpty()) {
            throw new IllegalArgumentException("hideSubject where matched nothing: " + where);
        }
        return ids;
    }

    /** Per-answer clock of a lesson or review step (see the class javadoc); inactive without its keys. */
    private static final class Timing {
        private final boolean active;
        private final long start = Clock.now();
        private final long spacing;
        private final JsonNode offsets;
        private final boolean delayed;
        private final long reportAfter;
        private final List<Object[]> pending = new ArrayList<>();
        private final List<Object> answers = new ArrayList<>();

        Timing(final JsonNode step, final int count) {
            active = step.has("spacingSeconds") || step.has("offsetsSeconds") || step.has("delayedReport")
                    || step.has("reportAfterSeconds");
            spacing = Math.round(step.path("spacingSeconds").asDouble(0) * 1000);
            offsets = step.get("offsetsSeconds");
            if (offsets != null && offsets.size() != count) {
                throw new IllegalArgumentException("offsetsSeconds has " + offsets.size() + " entries for " + count + " answers");
            }
            delayed = step.path("delayedReport").asBoolean(false);
            reportAfter = Math.round(step.path("reportAfterSeconds").asDouble(0) * 1000);
        }

        void answer(final int index, final long id, final SessionType type, final int meaningWrong, final int readingWrong) {
            if (offsets != null) {
                final long target = start + Math.round(offsets.get(index).asDouble() * 1000);
                if (target < Clock.now()) {
                    throw new IllegalArgumentException("offsetsSeconds must not decrease");
                }
                Clock.pin(target);
            }
            else if (index > 0 && spacing > 0) {
                Clock.advance(spacing);
            }
            final long ts = Clock.now();
            if (delayed) {
                pending.add(new Object[] {id, type, meaningWrong, readingWrong, ts});
                return;
            }
            new ReportSessionItemJob(id, 0, type, meaningWrong, readingWrong, ts, false).runLocal();
            answers.add(obj("id", id, "answeredAtMs", ts, "reportedAtMs", ts));
        }

        void finish(final Map<String, Object> resolved) {
            if (delayed) {
                if (reportAfter > 0) {
                    Clock.advance(reportAfter);
                }
                for (final Object[] p: pending) {
                    new ReportSessionItemJob((long) p[0], 0, (SessionType) p[1], (int) p[2], (int) p[3], (long) p[4], false).runLocal();
                    answers.add(obj("id", p[0], "answeredAtMs", p[4], "reportedAtMs", Clock.now()));
                }
            }
            if (active) {
                resolved.put("answers", answers);
            }
        }
    }

    private void lesson(final long id) {
        new ReportSessionItemJob(id, 0, SessionType.LESSON, 0, 0, Clock.now(), false).runLocal();
    }

    private void review(final long id, final int meaningWrong, final int readingWrong) {
        new ReportSessionItemJob(id, 0, SessionType.REVIEW, meaningWrong, readingWrong, Clock.now(), false).runLocal();
    }

    /** {meaningWrong, readingWrong} for a review: step defaults, per-id "wrong", per-id "wrongOnce" (first time only). */
    private int reviewCounter = 0;

    private int[] wrongFor(final JsonNode step, final long id, final Set<Long> usedOnce) {
        final String key = Long.toString(id);
        reviewCounter++;
        final JsonNode nth = step.path("wrongEveryNth");
        if (nth.has("n") && reviewCounter % nth.get("n").asInt() == 0) {
            return new int[] {nth.path("meaning").asInt(1), nth.path("reading").asInt(0)};
        }
        if (usedOnce != null && step.path("wrongOnce").has(key) && usedOnce.add(id)) {
            final JsonNode w = step.get("wrongOnce").get(key);
            return new int[] {w.get(0).asInt(), w.get(1).asInt()};
        }
        if (step.path("wrong").has(key)) {
            final JsonNode w = step.get("wrong").get(key);
            return new int[] {w.get(0).asInt(), w.get(1).asInt()};
        }
        return new int[] {step.path("meaningWrong").asInt(0), step.path("readingWrong").asInt(0)};
    }

    private boolean satisfied(final JsonNode until) {
        if (until.path("noProbation").asBoolean(false)) {
            return count("SELECT COUNT(*) FROM mm_probation p JOIN subject s ON s.id = p.id WHERE s.hiddenAt = 0") == 0;
        }
        if (until.has("level") && db.propertiesDao().getUserLevel() < until.get("level").asInt()) {
            return false;
        }
        if (until.has("passed")) {
            return count("SELECT COUNT(*) FROM subject WHERE passedAt = 0 AND id IN (" + numbers(until.get("passed")) + ")") == 0;
        }
        return until.has("level");
    }

    /**
     * Repeat: take all available lessons (lessonsWhere, unless noLessons), move the clock to the next review
     * (reviewsWhere) and answer every available one, until {level} or {passed: ids} holds or maxRounds.
     */
    private Object grind(final JsonNode step, final Map<String, Object> resolved) {
        final JsonNode until = step.path("until");
        final int max = step.path("maxRounds").asInt(100);
        final Set<Long> usedOnce = new HashSet<>();
        final List<Object> rounds = new ArrayList<>();
        boolean ok = false;
        boolean stuck = false;
        final long spacing = Math.round(step.path("spacingSeconds").asDouble(0) * 1000);
        int round = 0;
        while (round < max) {
            if (satisfied(until)) {
                ok = true;
                break;
            }
            final Map<String, Object> log = new LinkedHashMap<>();
            if (!step.path("noLessons").asBoolean(false)) {
                final long at = Clock.now();
                final List<Long> lessons = select(step.get("lessonsWhere"), true);
                final List<Long> lessonTimes = new ArrayList<>();
                for (int i = 0; i < lessons.size(); i++) {
                    if (i > 0 && spacing > 0) {
                        Clock.advance(spacing);
                    }
                    lessonTimes.add(Clock.now());
                    lesson(lessons.get(i));
                }
                if (!lessons.isEmpty()) {
                    log.put("lessonsAtMs", at);
                    log.put("lessons", lessons);
                    if (spacing > 0) {
                        log.put("lessonTimesMs", lessonTimes);
                    }
                }
            }
            final StringBuilder q = new StringBuilder("SELECT MIN(availableAt) FROM subject WHERE ").append(REVIEW_WHERE);
            appendFilter(q, step.get("reviewsWhere"));
            final long next;
            try (final Cursor c = sql.query(q.toString())) {
                next = c.moveToFirst() && !c.isNull(0) ? c.getLong(0) : 0;
            }
            if (next == 0) {
                stuck = true;
                if (!log.isEmpty()) {
                    rounds.add(log);
                }
                break;
            }
            if (next > Clock.now()) {
                Clock.pin(next);
            }
            log.put("reviewsAtMs", Clock.now());
            final List<Object> done = new ArrayList<>();
            final List<Long> reviewTimes = new ArrayList<>();
            for (final long id: select(step.get("reviewsWhere"), false)) {
                if (!done.isEmpty() && spacing > 0) {
                    Clock.advance(spacing);
                }
                reviewTimes.add(Clock.now());
                final int[] wrong = wrongFor(step, id, usedOnce);
                review(id, wrong[0], wrong[1]);
                done.add(new long[] {id, wrong[0], wrong[1]});
            }
            log.put("reviews", done);
            if (spacing > 0) {
                log.put("reviewTimesMs", reviewTimes);
            }
            rounds.add(log);
            round++;
        }
        if (!ok && satisfied(until)) {
            ok = true;
        }
        resolved.put("rounds", rounds);
        return obj("rounds", rounds.size(), "satisfied", ok, "stuck", stuck);
    }

    // --- level test ------------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private Map<Long, Integer> jlptBlocks() throws Exception {
        final Method m = Curriculum.class.getDeclaredMethod("jlptLayout", Context.class, AppDatabase.class);
        m.setAccessible(true);
        final Object layout = m.invoke(null, context, db);
        final Field fp = layout.getClass().getDeclaredField("placement");
        final Field fb = layout.getClass().getDeclaredField("blocks");
        fp.setAccessible(true);
        fb.setAccessible(true);
        final Map<Long, int[]> placement = (Map<Long, int[]>) fp.get(layout);
        final List<Integer> blocks = (List<Integer>) fb.get(layout);
        final Map<Long, Integer> out = new HashMap<>();
        for (final Map.Entry<Long, int[]> e: placement.entrySet()) {
            final int l = e.getValue()[0];
            if (l >= 1 && l <= blocks.size()) {
                out.put(e.getKey(), blocks.get(l - 1));
            }
        }
        return out;
    }

    /**
     * Start round 1 or 2, answer it by rule (known: "all" | "none" | {"blocks": [5, 4]} | {"ids": [...]};
     * abandon: the first n picked items are abandoned) and finish it like the self-study quiz does.
     */
    private Object levelTestRound(final JsonNode step, final Map<String, Object> resolved) throws Exception {
        final int round = step.get("round").asInt();
        final List<Subject> picked = round == 1 ? LevelTest.startRound1(context, db) : LevelTest.startRound2(context, db);
        final Map<Long, Integer> blocks = jlptBlocks();
        final JsonNode known = step.path("known");
        final Set<Long> knownIds = new HashSet<>();
        for (final JsonNode id: known.path("ids")) {
            knownIds.add(id.asLong());
        }
        final Set<Integer> knownBlocks = new HashSet<>();
        for (final JsonNode b: known.path("blocks")) {
            knownBlocks.add(b.asInt());
        }
        final int abandon = step.path("abandon").asInt(0);
        final List<SessionItem> items = new ArrayList<>();
        final Map<String, Object> answers = new LinkedHashMap<>();
        final List<Object> pickedOut = new ArrayList<>();
        for (int i = 0; i < picked.size(); i++) {
            final long id = picked.get(i).getId();
            final Integer block = blocks.get(id);
            pickedOut.add(obj("id", id, "block", block));
            final SessionItem item = new SessionItem();
            item.setId(id);
            final String answer;
            if (i < abandon) {
                item.setState(SessionItemState.ABANDONED);
                answer = "abandoned";
            }
            else {
                final boolean isKnown = "all".equals(known.asText())
                        || knownIds.contains(id) || block != null && knownBlocks.contains(block);
                item.setState(SessionItemState.PENDING);
                if (!isKnown) {
                    item.setQuestion1Incorrect(1);
                }
                answer = isKnown ? "known" : "wrong";
            }
            items.add(item);
            answers.put(Long.toString(id), answer);
        }
        if (!items.isEmpty()) {
            LevelTest.onSessionFinishing(SessionType.SELF_STUDY, items);
            for (final Thread t: Thread.getAllStackTraces().keySet()) {
                if ("KanjiKodamaLevelTest".equals(t.getName())) {
                    t.join(30000);
                }
            }
        }
        resolved.put("picked", pickedOut);
        resolved.put("answers", answers);
        final List<Object> scores = new ArrayList<>();
        for (final LevelTest.BlockScore s: LevelTest.blockScores(context, db)) {
            scores.add(obj("block", s.block, "asked", s.asked, "known", s.known, "share", s.share));
        }
        return obj("picked", picked.size(), "status", LevelTest.status(db).name(), "blockScores", scores,
                "boundaryBlock", LevelTest.boundaryBlock(context, db));
    }

    // --- WaniKani import -------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private String importWaniKani(final JsonNode api) throws Exception {
        final ObjectMapper mapper = Converters.getObjectMapper();
        final ApiUser user = mapper.treeToValue(api.get("user"), ApiUser.class);
        final Constructor<WaniKaniImporter.Download> ctor = WaniKaniImporter.Download.class.getDeclaredConstructor(ApiUser.class);
        ctor.setAccessible(true);
        final WaniKaniImporter.Download d = ctor.newInstance(user);
        fill(d, "assignments", api.path("assignments"), ApiAssignment.class, mapper);
        fill(d, "statistics", api.path("review_statistics"), ApiReviewStatistic.class, mapper);
        fill(d, "materials", api.path("study_materials"), ApiStudyMaterial.class, mapper);
        fill(d, "levels", api.path("level_progressions"), ApiLevelProgression.class, mapper);
        return WaniKaniImporter.apply(d);
    }

    /** Parse API envelopes {id, object, data} the way ApiTask.parseEntity does and add them to a Download list. */
    @SuppressWarnings("unchecked")
    private static <T extends WaniKaniEntity> void fill(final WaniKaniImporter.Download d, final String field, final JsonNode arr,
                                                       final Class<T> cls, final ObjectMapper mapper) throws Exception {
        final Field f = WaniKaniImporter.Download.class.getDeclaredField(field);
        f.setAccessible(true);
        final List<Object> list = (List<Object>) f.get(d);
        for (final JsonNode e: arr) {
            final T value = mapper.treeToValue(e.get("data"), cls);
            value.setId(e.get("id").asInt());
            value.setObject(e.get("object").asText());
            list.add(value);
        }
    }
}
