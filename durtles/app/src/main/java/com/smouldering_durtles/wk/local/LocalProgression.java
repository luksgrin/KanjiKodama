/*
 * MojiMori local mode.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.database.Cursor;

import androidx.sqlite.db.SupportSQLiteDatabase;

import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.livedata.LiveAlertContext;
import com.smouldering_durtles.wk.livedata.LiveLevelDuration;
import com.smouldering_durtles.wk.livedata.LiveLevelProgress;
import com.smouldering_durtles.wk.livedata.LiveRecentUnlocks;
import com.smouldering_durtles.wk.livedata.LiveSrsBreakDown;
import com.smouldering_durtles.wk.livedata.LiveTimeLine;
import com.smouldering_durtles.wk.util.Logger;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Does locally what the WaniKani server does after reviews: level-ups and unlocks.
 *
 * <ul>
 *     <li>The user levels up when at least 90 % of the current level's kanji have passed
 *     (reached Guru). Levels never go down.</li>
 *     <li>Within unlocked levels, radicals and kana-only vocabulary unlock immediately, kanji
 *     unlock when all their component radicals have passed, and vocabulary unlocks when all its
 *     component kanji have passed.</li>
 * </ul>
 *
 * <p>The curriculum order is whatever the subject table's level and lessonPosition columns say,
 * so a different ordering (for example JLPT blocks) only needs those columns rewritten.</p>
 */
public final class LocalProgression {
    private static final Logger LOGGER = Logger.get(LocalProgression.class);
    private static final double LEVEL_UP_SHARE = 0.9;

    private LocalProgression() {
        //
    }

    /** Recompute level and unlocks. Safe to call often; returns the number of new unlocks. */
    public static synchronized int update(final AppDatabase db) {
        final long now = System.currentTimeMillis();
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();

        int level = Math.max(1, db.propertiesDao().getUserLevel());
        final int startLevel = level;
        while (level < Curriculum.maxLevel() && levelComplete(sql, level)) {
            level++;
        }
        if (level != db.propertiesDao().getUserLevel()) {
            db.propertiesDao().setUserLevel(level);
        }
        for (int l = 1; l <= level; l++) {
            sql.execSQL("INSERT OR IGNORE INTO level_progression (id, level, unlockedAt, startedAt, createdAt, passedAt, completedAt, abandonedAt)"
                    + " VALUES (?, ?, ?, ?, ?, 0, 0, 0)", new Object[] {l, l, now, now, now});
            if (l < level) {
                sql.execSQL("UPDATE level_progression SET passedAt = ? WHERE id = ? AND passedAt = 0", new Object[] {now, l});
            }
        }

        final Set<Long> passed = new HashSet<>();
        try (final Cursor c = sql.query("SELECT id FROM subject WHERE passedAt != 0 OR hiddenAt != 0")) {
            while (c.moveToNext()) {
                passed.add(c.getLong(0));
            }
        }

        final List<Long> toUnlock = new ArrayList<>();
        try (final Cursor c = sql.query("SELECT id, componentSubjectIds FROM subject"
                + " WHERE hiddenAt = 0 AND object IS NOT NULL AND unlockedAt = 0 AND level <= ?", new Object[] {level})) {
            while (c.moveToNext()) {
                final long id = c.getLong(0);
                final String components = c.isNull(1) ? "" : c.getString(1);
                if (allPassed(components, passed)) {
                    toUnlock.add(id);
                }
            }
        }
        for (final long id: toUnlock) {
            db.subjectSyncDao().forceLessonAvailable(id, now, LocalMode.MAX_LEVEL);
        }

        if (!toUnlock.isEmpty() || level != startLevel) {
            LOGGER.info("Local progression: level %d, %d new unlocks", level, toUnlock.size());
            LiveTimeLine.getInstance().update();
            LiveSrsBreakDown.getInstance().update();
            LiveLevelProgress.getInstance().update();
            LiveRecentUnlocks.getInstance().update();
            LiveLevelDuration.getInstance().forceUpdate();
            LiveAlertContext.getInstance().update();
        }
        return toUnlock.size();
    }

    private static boolean levelComplete(final SupportSQLiteDatabase sql, final int level) {
        try (final Cursor c = sql.query("SELECT COUNT(*), SUM(passedAt != 0) FROM subject"
                + " WHERE object = 'kanji' AND hiddenAt = 0 AND level = ?", new Object[] {level})) {
            if (!c.moveToFirst()) {
                return false;
            }
            final int total = c.getInt(0);
            final int done = c.getInt(1);
            return total > 0 && done >= Math.ceil(total * LEVEL_UP_SHARE);
        }
    }

    /** Components are stored as a JSON array of ids, e.g. "[103,25]". Empty means none. */
    static boolean allPassed(final String components, final Set<Long> passed) {
        final String body = components.replace("[", "").replace("]", "").trim();
        if (body.isEmpty()) {
            return true;
        }
        for (final String part: body.split(",")) {
            final String t = part.trim();
            if (!t.isEmpty() && !passed.contains(Long.parseLong(t))) {
                return false;
            }
        }
        return true;
    }
}
