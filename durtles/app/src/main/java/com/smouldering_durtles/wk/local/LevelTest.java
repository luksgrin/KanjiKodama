/*
 * KanjiKodama local mode: a kanji level test in two short self-study rounds.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.content.Context;
import android.database.Cursor;

import androidx.sqlite.db.SupportSQLiteDatabase;

import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.model.SessionItem;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.enums.SessionType;
import com.smouldering_durtles.wk.util.Logger;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import javax.annotation.Nullable;

/**
 * Estimates how far the learner's kanji knowledge reaches in JLPT order.
 *
 * <ol>
 *     <li>Round 1: {@link #ROUND1_PER_BLOCK} kanji from each of N5..N1 that are not mastered yet,
 *     asked in a self-study quiz (meaning and reading). A kanji counts as known only when both
 *     were answered right the first time.</li>
 *     <li>The share of each block the learner knows is estimated from the mastered kanji plus the
 *     sample. The boundary block is the first one below {@link Placement#THRESHOLD}.</li>
 *     <li>Round 2: {@link #ROUND2_PER_LEVEL} kanji from up to {@link #ROUND2_LEVELS} evenly spaced
 *     levels of that block. The result is the level after the last sampled level still above
 *     the threshold (conservative: probation catches what lies between).</li>
 * </ol>
 *
 * <p>Starting at the result moves the learner to JLPT order if needed, sends the kanji answered
 * right to Guru, and puts everything below the result on probation as a fast-travel jump spread
 * over {@link #PROBATION_WINDOW}.</p>
 */
public final class LevelTest {
    private static final Logger LOGGER = Logger.get(LevelTest.class);
    static final int ROUND1_PER_BLOCK = 6;
    static final int ROUND2_LEVELS = 6;
    static final int ROUND2_PER_LEVEL = 3;
    private static final long HOUR = 60L * 60 * 1000;
    public static final long PROBATION_WINDOW = 7 * 24 * HOUR;
    private static final int GURU_STAGE = 5;
    private static final int[] TESTED_BLOCKS = {5, 4, 3, 2, 1};

    /** Where the test stands. */
    public enum Status { NONE, ROUND1, ROUND1_DONE, ROUND2, ROUND2_DONE }

    private static volatile boolean roundActive = false;

    private LevelTest() {
        //
    }

    /** True while a level test round is the running self-study session. */
    public static boolean isRoundActive() {
        return roundActive;
    }

    private static void ensureTable(final SupportSQLiteDatabase sql) {
        Curriculum.ensureTables(sql);
        sql.execSQL("CREATE TABLE IF NOT EXISTS mm_level_test (id INTEGER PRIMARY KEY NOT NULL, round INTEGER NOT NULL, known INTEGER NOT NULL)");
    }

    public static Status status(final AppDatabase db) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        ensureTable(sql);
        final @Nullable String s = Curriculum.getState(sql, "level_test");
        try {
            return s == null || s.isEmpty() ? Status.NONE : Status.valueOf(s);
        } catch (final IllegalArgumentException e) {
            return Status.NONE;
        }
    }

    private static void setStatus(final SupportSQLiteDatabase sql, final Status status) {
        Curriculum.putState(sql, "level_test", status == Status.NONE ? "" : status.name());
    }

    public static void discard(final AppDatabase db) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        ensureTable(sql);
        sql.execSQL("DELETE FROM mm_level_test");
        setStatus(sql, Status.NONE);
        roundActive = false;
        Curriculum.putState(sql, "level_test_prompted", "");
    }

    /** Whether the dashboard already offered the next step of the test once. */
    public static boolean prompted(final AppDatabase db) {
        return "1".equals(Curriculum.getState(db.getOpenHelper().getWritableDatabase(), "level_test_prompted"));
    }

    public static void setPrompted(final AppDatabase db) {
        Curriculum.putState(db.getOpenHelper().getWritableDatabase(), "level_test_prompted", "1");
    }

    // --- per-level knowledge -------------------------------------------------------------------

    /** Kanji per JLPT-order level: total, mastered, and the ids not mastered yet. */
    static final class Levels {
        final Curriculum.Layout layout;
        final int count;
        final int[] total;
        final int[] mastered;
        final List<List<Long>> open = new ArrayList<>();

        Levels(final Curriculum.Layout layout, final int count) {
            this.layout = layout;
            this.count = count;
            total = new int[count + 1];
            mastered = new int[count + 1];
            for (int i = 0; i <= count; i++) {
                open.add(new ArrayList<>());
            }
        }

        int block(final int level) {
            return layout.blocks.get(level - 1);
        }

        List<Integer> levelsOf(final int block) {
            final List<Integer> out = new ArrayList<>();
            for (int l = 1; l <= count; l++) {
                if (block(l) == block) {
                    out.add(l);
                }
            }
            return out;
        }
    }

    static Levels levels(final Context context, final AppDatabase db) {
        final Curriculum.Layout layout = Curriculum.jlptLayout(context, db);
        final Levels levels = new Levels(layout, layout.blocks.size());
        try (final Cursor c = db.getOpenHelper().getReadableDatabase().query(
                "SELECT id, passedAt != 0 FROM subject WHERE object = 'kanji' AND hiddenAt = 0")) {
            while (c.moveToNext()) {
                final int[] p = layout.placement.get(c.getLong(0));
                if (p == null || p[0] < 1 || p[0] > levels.count) {
                    continue;
                }
                levels.total[p[0]]++;
                if (c.getInt(1) != 0) {
                    levels.mastered[p[0]]++;
                }
                else {
                    levels.open.get(p[0]).add(c.getLong(0));
                }
            }
        }
        return levels;
    }

    private static Map<Long, Integer> answers(final SupportSQLiteDatabase sql) {
        final Map<Long, Integer> out = new HashMap<>();
        try (final Cursor c = sql.query("SELECT id, known FROM mm_level_test")) {
            while (c.moveToNext()) {
                out.put(c.getLong(0), c.getInt(1));
            }
        }
        return out;
    }

    /** Estimated share of a set of levels the learner knows, from mastered kanji and answers. */
    private static double share(final Levels levels, final List<Integer> which, final Map<Long, Integer> answers) {
        int total = 0;
        int mastered = 0;
        int open = 0;
        int asked = 0;
        int known = 0;
        for (final int l: which) {
            total += levels.total[l];
            mastered += levels.mastered[l];
            open += levels.open.get(l).size();
            for (final long id: levels.open.get(l)) {
                final Integer a = answers.get(id);
                if (a != null && a >= 0) {
                    asked++;
                    known += a;
                }
            }
        }
        if (total == 0) {
            return 1;
        }
        final double p = asked > 0 ? (double) known / asked : open == 0 ? 1 : 0;
        return (mastered + p * open) / total;
    }

    // --- rounds --------------------------------------------------------------------------------

    private static List<Subject> startRound(final AppDatabase db, final SupportSQLiteDatabase sql, final int round,
                                            final List<Long> ids, final Status status) {
        for (final long id: ids) {
            sql.execSQL("INSERT OR REPLACE INTO mm_level_test (id, round, known) VALUES (?, ?, -1)", new Object[] {id, round});
        }
        setStatus(sql, status);
        Curriculum.putState(sql, "level_test_prompted", "");
        roundActive = true;
        final List<Subject> subjects = new ArrayList<>();
        for (final long id: ids) {
            final @Nullable Subject s = db.subjectDao().getById(id);
            if (s != null) {
                subjects.add(s);
            }
        }
        return subjects;
    }

    /** Prepare round 1. An empty list means there is nothing left to test. */
    public static List<Subject> startRound1(final Context context, final AppDatabase db) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        discard(db);
        final Levels levels = levels(context, db);
        final Random random = new Random();
        final List<Long> ids = new ArrayList<>();
        for (final int block: TESTED_BLOCKS) {
            final List<Long> pool = new ArrayList<>();
            for (final int l: levels.levelsOf(block)) {
                pool.addAll(levels.open.get(l));
            }
            Collections.shuffle(pool, random);
            ids.addAll(pool.subList(0, Math.min(ROUND1_PER_BLOCK, pool.size())));
        }
        if (ids.isEmpty()) {
            setStatus(sql, Status.ROUND2_DONE);
            return new ArrayList<>();
        }
        return startRound(db, sql, 1, ids, Status.ROUND1);
    }

    /** The per-block picture after round 1. */
    public static final class BlockScore {
        public final int block;
        public final int asked;
        public final int known;
        public final double share;

        BlockScore(final int block, final int asked, final int known, final double share) {
            this.block = block;
            this.asked = asked;
            this.known = known;
            this.share = share;
        }
    }

    public static List<BlockScore> blockScores(final Context context, final AppDatabase db) {
        final Levels levels = levels(context, db);
        final Map<Long, Integer> answers = answers(db.getOpenHelper().getWritableDatabase());
        final List<BlockScore> out = new ArrayList<>();
        for (final int block: TESTED_BLOCKS) {
            int asked = 0;
            int known = 0;
            final List<Integer> which = levels.levelsOf(block);
            for (final int l: which) {
                for (final long id: levels.open.get(l)) {
                    final Integer a = answers.get(id);
                    if (a != null && a >= 0) {
                        asked++;
                        known += a;
                    }
                }
            }
            out.add(new BlockScore(block, asked, known, share(levels, which, answers)));
        }
        return out;
    }

    /** The first tested block below the threshold, or 0 (Obscure) when all of N5..N1 are known. */
    static int boundaryBlock(final List<BlockScore> scores) {
        for (final BlockScore s: scores) {
            if (s.share < Placement.THRESHOLD) {
                return s.block;
            }
        }
        return 0;
    }

    public static int boundaryBlock(final Context context, final AppDatabase db) {
        return boundaryBlock(blockScores(context, db));
    }

    /** Levels of the block sampled in round 2: evenly spaced, first and last included. */
    static List<Integer> sampledLevels(final List<Integer> blockLevels) {
        final List<Integer> out = new ArrayList<>();
        final int n = blockLevels.size();
        final int k = Math.min(ROUND2_LEVELS, n);
        for (int i = 0; i < k; i++) {
            final int idx = k == 1 ? 0 : (int) Math.round(i * (n - 1) / (double) (k - 1));
            final int level = blockLevels.get(idx);
            if (!out.contains(level)) {
                out.add(level);
            }
        }
        return out;
    }

    /** Prepare round 2. An empty list means round 2 is not needed and the result is ready. */
    public static List<Subject> startRound2(final Context context, final AppDatabase db) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        ensureTable(sql);
        final Levels levels = levels(context, db);
        final int block = boundaryBlock(blockScores(context, db));
        final Set<Long> used = answers(sql).keySet();
        final Random random = new Random();
        final List<Long> ids = new ArrayList<>();
        if (block != 0) {
            for (final int l: sampledLevels(levels.levelsOf(block))) {
                final List<Long> pool = new ArrayList<>();
                for (final long id: levels.open.get(l)) {
                    if (!used.contains(id)) {
                        pool.add(id);
                    }
                }
                Collections.shuffle(pool, random);
                ids.addAll(pool.subList(0, Math.min(ROUND2_PER_LEVEL, pool.size())));
            }
        }
        if (ids.isEmpty()) {
            setStatus(sql, Status.ROUND2_DONE);
            return new ArrayList<>();
        }
        return startRound(db, sql, 2, ids, Status.ROUND2);
    }

    /** The test's verdict. */
    public static final class Result {
        public final int level;
        public final @Nullable String description;
        public final int proven;
        /** Kanji and vocabulary below the result that would go on probation. */
        public final int probation;
        public final int minutesPerDay;

        Result(final int level, final @Nullable String description, final int proven, final int probation) {
            this.level = level;
            this.description = description;
            this.proven = proven;
            this.probation = probation;
            this.minutesPerDay = (int) Math.ceil(probation * 12 / 60.0 / (PROBATION_WINDOW / (24.0 * HOUR)));
        }
    }

    public static Result result(final Context context, final AppDatabase db) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        final Levels levels = levels(context, db);
        final Map<Long, Integer> answers = answers(sql);
        final int block = boundaryBlock(blockScores(context, db));
        int level;
        if (block == 0) {
            level = Math.min(levels.count, firstLevelOf(levels, 0, levels.count));
        }
        else {
            final List<Integer> blockLevels = levels.levelsOf(block);
            level = blockLevels.get(blockLevels.size() - 1) + 1;
            Integer lastPassing = null;
            for (final int l: sampledLevels(blockLevels)) {
                if (share(levels, Collections.singletonList(l), answers) < Placement.THRESHOLD) {
                    level = lastPassing == null ? blockLevels.get(0) : lastPassing + 1;
                    break;
                }
                lastPassing = l;
            }
            level = Math.max(1, Math.min(levels.count, level));
        }
        int proven = 0;
        for (final int a: answers.values()) {
            proven += a > 0 ? 1 : 0;
        }
        int probation = 0;
        try (final Cursor c = sql.query("SELECT id FROM subject WHERE hiddenAt = 0 AND startedAt = 0 AND object != 'radical'")) {
            while (c.moveToNext()) {
                final int[] p = levels.layout.placement.get(c.getLong(0));
                final Integer a = answers.get(c.getLong(0));
                if (p != null && p[0] < level && (a == null || a <= 0)) {
                    probation++;
                }
            }
        }
        return new Result(level, Curriculum.describe(levels.layout, level), proven, probation);
    }

    private static int firstLevelOf(final Levels levels, final int block, final int fallback) {
        for (int l = 1; l <= levels.count; l++) {
            if (levels.block(l) == block) {
                return l;
            }
        }
        return fallback;
    }

    // --- results from the quiz -----------------------------------------------------------------

    /**
     * Called when a session finishes, before its items are cleared. Records a round's answers if
     * this was a level test round; a round that was mostly abandoned is ignored.
     */
    public static void onSessionFinishing(final SessionType type, final List<SessionItem> items) {
        if (!LocalMode.ENABLED || type != SessionType.SELF_STUDY || items.isEmpty()) {
            return;
        }
        if (!roundActive) {
            return;
        }
        roundActive = false;
        final Map<Long, Integer> results = new HashMap<>();
        for (final SessionItem item: items) {
            if (item.hasIncorrectAnswers()) {
                results.put(item.getId(), 0);
            }
            else if (!item.isAbandoned() && item.isFinished()) {
                // Self-study defers results, so a finished item is PENDING rather than REPORTED.
                results.put(item.getId(), 1);
            }
        }
        final Set<Long> all = new HashSet<>();
        for (final SessionItem item: items) {
            all.add(item.getId());
        }
        new Thread(() -> {
            try {
                record(WkApplication.getDatabase(), all, results);
            } catch (final Exception e) {
                LOGGER.error(e, "Recording level test answers failed");
            }
        }, "KanjiKodamaLevelTest").start();
    }

    private static synchronized void record(final AppDatabase db, final Set<Long> sessionIds, final Map<Long, Integer> results) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        ensureTable(sql);
        final Status status = status(db);
        if (status != Status.ROUND1 && status != Status.ROUND2) {
            return;
        }
        final int round = status == Status.ROUND1 ? 1 : 2;
        final Set<Long> roundIds = new HashSet<>();
        try (final Cursor c = sql.query("SELECT id FROM mm_level_test WHERE round = ?", new Object[] {round})) {
            while (c.moveToNext()) {
                roundIds.add(c.getLong(0));
            }
        }
        if (!sessionIds.equals(roundIds)) {
            return; // an ordinary self-study session
        }
        if (results.size() * 2 < roundIds.size()) {
            LOGGER.info("Level test round %d mostly abandoned; not recorded", round);
            return;
        }
        for (final Map.Entry<Long, Integer> e: results.entrySet()) {
            sql.execSQL("UPDATE mm_level_test SET known = ? WHERE id = ?", new Object[] {e.getValue(), e.getKey()});
        }
        setStatus(sql, round == 1 ? Status.ROUND1_DONE : Status.ROUND2_DONE);
        Curriculum.putState(sql, "level_test_prompted", "");
    }

    // --- starting at the result ----------------------------------------------------------------

    /** What starting at the result did. */
    public static final class Outcome {
        public final int level;
        public final int proven;
        public final int probation;
        public final boolean moved;

        Outcome(final int level, final int proven, final int probation, final boolean moved) {
            this.level = level;
            this.proven = proven;
            this.probation = probation;
            this.moved = moved;
        }
    }

    public static synchronized Outcome startAtResult(final Context context, final AppDatabase db) {
        final Result result = result(context, db);
        if (Curriculum.getMode() != Curriculum.Mode.JLPT) {
            Curriculum.switchTo(context, db, Curriculum.Mode.JLPT);
        }
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        final long now = System.currentTimeMillis();
        int proven = 0;
        for (final Map.Entry<Long, Integer> e: answers(sql).entrySet()) {
            if (e.getValue() <= 0) {
                continue;
            }
            final @Nullable Subject s = db.subjectDao().getById(e.getKey());
            if (s == null || s.getPassedAt() != 0) {
                continue;
            }
            final long interval = s.getSrsSystem().getStage(GURU_STAGE).getInterval();
            final long availableAt = now + interval;
            db.subjectSyncDao().patchAssignment(s.getId(), GURU_STAGE, s.getUnlockedAt() != 0 ? s.getUnlockedAt() : now,
                    s.getStartedAt() != 0 ? s.getStartedAt() : now, availableAt - availableAt % HOUR, now, 0, 0);
            sql.execSQL("DELETE FROM mm_probation WHERE id = ?", new Object[] {s.getId()});
            proven++;
        }
        final int current = Math.max(1, db.propertiesDao().getUserLevel());
        int probation = 0;
        final boolean moved = result.level > current;
        if (moved) {
            probation = FastTravel.travel(db, result.level, PROBATION_WINDOW);
        }
        else {
            LocalProgression.update(db);
            ProgressStore.afterChange(db);
        }
        discard(db);
        return new Outcome(Math.max(current, result.level), proven, probation, moved);
    }
}
