/*
 * KanjiKodama local mode: fast travel in JLPT order.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.database.Cursor;

import androidx.sqlite.db.SupportSQLiteDatabase;

import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.util.Logger;

import java.util.ArrayList;
import java.util.List;

import javax.annotation.Nullable;

/**
 * Lets a learner who already knows part of the JLPT order jump ahead, without burning anything.
 *
 * <ul>
 *     <li>One jump moves up to {@link #MAX_JUMP} levels. The next jump needs {@link #COOLDOWN}
 *     to have passed and every probation item from the previous jump to have been answered.</li>
 *     <li>Kanji and vocabulary of the skipped levels that were not started yet go on probation:
 *     they enter reviews at Apprentice IV, spread evenly over the cooldown. A correct answer
 *     moves them to Guru as usual; a wrong one sends them back to the lesson queue, so anything
 *     the learner did not really know gets taught properly.</li>
 *     <li>Radicals of the skipped levels are not tested; they wait in the lesson queue.</li>
 * </ul>
 */
public final class FastTravel {
    private static final Logger LOGGER = Logger.get(FastTravel.class);
    public static final int MAX_JUMP = 5;
    private static final long HOUR = 60L * 60 * 1000;
    public static final long COOLDOWN = 72 * HOUR;
    /** Stage a probation item starts at (Apprentice IV); one correct answer reaches Guru I. */
    private static final int PROBATION_STAGE = 4;
    /** Rough time per review item (meaning and reading), for the workload estimate. */
    private static final int SECONDS_PER_ITEM = 12;

    private FastTravel() {
        //
    }

    /** One possible jump. */
    public static final class Option {
        public final int target;
        public final @Nullable String targetDescription;
        public final int probation;
        public final int radicals;
        public final int minutesPerDay;

        Option(final int target, final @Nullable String targetDescription, final int probation, final int radicals) {
            this.target = target;
            this.targetDescription = targetDescription;
            this.probation = probation;
            this.radicals = radicals;
            this.minutesPerDay = (int) Math.ceil(probation * SECONDS_PER_ITEM / 60.0 / (COOLDOWN / (24.0 * HOUR)));
        }
    }

    /** Whether a jump is possible now, and if not, why. */
    public static final class Status {
        public final int level;
        public final @Nullable String blocked;
        public final List<Option> options;

        Status(final int level, final @Nullable String blocked, final List<Option> options) {
            this.level = level;
            this.blocked = blocked;
            this.options = options;
        }
    }

    public static Status status(final AppDatabase db) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        Curriculum.ensureTables(sql);
        final int level = Math.max(1, db.propertiesDao().getUserLevel());
        final List<Option> options = new ArrayList<>();
        if (Curriculum.getMode() != Curriculum.Mode.JLPT) {
            return new Status(level, "Fast travel is only available in JLPT order."
                    + " Switch in Settings, Progress, Curriculum order.", options);
        }
        final int pending = pendingProbation(sql);
        if (pending > 0) {
            return new Status(level, "Answer the " + pending + " remaining probation reviews from your last jump first.", options);
        }
        final long last = lastJump(sql);
        final long wait = last + COOLDOWN - Clock.now();
        if (last > 0 && wait > 0) {
            final long hours = (wait + HOUR - 1) / HOUR;
            return new Status(level, "The next fast travel is available in " + (hours >= 24 ? (hours / 24) + " d " + (hours % 24) + " h" : hours + " h") + ".", options);
        }
        final int max = Curriculum.maxLevel();
        if (level >= max) {
            return new Status(level, "You are already on the last level.", options);
        }
        for (int target = level + 1; target <= Math.min(max, level + MAX_JUMP); target++) {
            options.add(new Option(target, Curriculum.describeLevel(target), count(sql, level, target, false), count(sql, level, target, true)));
        }
        return new Status(level, null, options);
    }

    private static int count(final SupportSQLiteDatabase sql, final int from, final int to, final boolean radicals) {
        try (final Cursor c = sql.query("SELECT COUNT(*) FROM subject WHERE hiddenAt = 0 AND startedAt = 0"
                + " AND object " + (radicals ? "=" : "!=") + " 'radical' AND level >= ? AND level < ?", new Object[] {from, to})) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    static int pendingProbation(final SupportSQLiteDatabase sql) {
        try (final Cursor c = sql.query("SELECT COUNT(*) FROM mm_probation")) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }

    private static long lastJump(final SupportSQLiteDatabase sql) {
        try (final Cursor c = sql.query("SELECT MAX(at) FROM mm_jump")) {
            return c.moveToFirst() && !c.isNull(0) ? c.getLong(0) : 0;
        }
    }

    /**
     * Jump to the target level. The caller checked {@link #status(AppDatabase)} and that no session runs.
     *
     * @return the number of probation items
     */
    public static int travel(final AppDatabase db, final int target) {
        return travel(db, target, COOLDOWN);
    }

    /**
     * Jump to the target level, spreading the probation reviews over the given window.
     *
     * @return the number of probation items
     */
    public static synchronized int travel(final AppDatabase db, final int target, final long window) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        Curriculum.ensureTables(sql);
        final int from = Math.max(1, db.propertiesDao().getUserLevel());
        final long now = Clock.now();
        final long firstSlot = now - now % HOUR;
        final int slots = (int) Math.max(1, window / HOUR);

        final List<long[]> items = new ArrayList<>();
        try (final Cursor c = sql.query("SELECT id, unlockedAt FROM subject WHERE hiddenAt = 0 AND startedAt = 0"
                + " AND object != 'radical' AND level >= ? AND level < ?"
                + " ORDER BY object = 'kanji' DESC, level, lessonPosition, id", new Object[] {from, target})) {
            while (c.moveToNext()) {
                items.add(new long[] {c.getLong(0), c.getLong(1)});
            }
        }

        sql.beginTransaction();
        try {
            for (int i = 0; i < items.size(); i++) {
                final long id = items.get(i)[0];
                final long unlockedAt = items.get(i)[1] != 0 ? items.get(i)[1] : now;
                final long availableAt = firstSlot + (long) i * slots / items.size() * HOUR;
                db.subjectSyncDao().patchAssignment(id, PROBATION_STAGE, unlockedAt, now, availableAt, 0, 0, 0);
                sql.execSQL("INSERT OR REPLACE INTO mm_probation (id, since) VALUES (?, ?)", new Object[] {id, now});
            }
            sql.execSQL("INSERT INTO mm_jump (at, fromLevel, toLevel) VALUES (?, ?, ?)", new Object[] {now, from, target});
            db.propertiesDao().setUserLevel(target);
            sql.setTransactionSuccessful();
        } finally {
            sql.endTransaction();
        }
        LocalProgression.update(db);
        ProgressStore.afterChange(db);
        LOGGER.info("Fast travel: level %d to %d, %d probation items", from, target, items.size());
        return items.size();
    }

    /**
     * Called after a review was recorded. A probation item answered wrong goes back to the lesson
     * queue; either way it leaves probation.
     */
    public static void onReviewed(final AppDatabase db, final long subjectId, final boolean wrong) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        Curriculum.ensureTables(sql);
        final boolean onProbation;
        try (final Cursor c = sql.query("SELECT 1 FROM mm_probation WHERE id = ?", new Object[] {subjectId})) {
            onProbation = c.moveToFirst();
        }
        if (!onProbation) {
            return;
        }
        sql.execSQL("DELETE FROM mm_probation WHERE id = ?", new Object[] {subjectId});
        if (!wrong) {
            return;
        }
        final @Nullable Subject subject = db.subjectDao().getById(subjectId);
        if (subject == null) {
            return;
        }
        final long initial = subject.getSrsSystem().getInitialStage().getId();
        db.subjectSyncDao().patchAssignment(subjectId, initial, subject.getUnlockedAt(), 0, 0, 0, 0, 0);
    }
}
