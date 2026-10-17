/*
 * KanjiKodama local mode: saving, restoring and resetting learning progress.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.database.Cursor;

import androidx.sqlite.db.SupportSQLiteDatabase;

import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.enums.SessionType;
import com.smouldering_durtles.wk.livedata.LiveAlertContext;
import com.smouldering_durtles.wk.livedata.LiveBurnedItems;
import com.smouldering_durtles.wk.livedata.LiveCriticalCondition;
import com.smouldering_durtles.wk.livedata.LiveLevelDuration;
import com.smouldering_durtles.wk.livedata.LiveLevelProgress;
import com.smouldering_durtles.wk.livedata.LiveRecentUnlocks;
import com.smouldering_durtles.wk.livedata.LiveSrsBreakDown;
import com.smouldering_durtles.wk.livedata.LiveTimeLine;
import com.smouldering_durtles.wk.model.Session;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Progress lives in the subject table (assignment, review statistic and study material columns), the
 * level_progression table and the user level property. Content columns are never touched here.
 *
 * <p>The saved file is plain JSON (progress is not sensitive): a format tag, a version, the user level, the
 * level progression rows and one object per subject that has any progress or notes.</p>
 */
public final class ProgressStore {
    public static final String FORMAT = "kanjikodama-progress";
    /** Files saved before the app was renamed; same content. */
    private static final String LEGACY_FORMAT = "mojimori-progress";
    public static final int VERSION = 1;

    /** Numeric progress columns of the subject table, reset to 0. */
    private static final String[] NUMERIC = {
            "availableAt", "burnedAt", "passedAt", "resurrectedAt", "startedAt", "unlockedAt", "srsStage",
            "lastIncorrectAnswer", "assignmentId", "studyMaterialId", "reviewStatisticId",
            "meaningCorrect", "meaningIncorrect", "meaningMaxStreak", "meaningCurrentStreak",
            "readingCorrect", "readingIncorrect", "readingMaxStreak", "readingCurrentStreak",
            "percentageCorrect", "leechScore", "levelProgressScore",
            "passed", "resurrected", "assignmentPatched", "studyMaterialPatched", "statisticPatched",
    };

    /** Text progress columns (the learner's own notes and synonyms), reset to NULL. */
    private static final String[] TEXT = {"meaningNote", "meaningSynonyms", "readingNote"};

    private static final String[] LEVEL_PROGRESSION = {
            "id", "level", "abandonedAt", "completedAt", "createdAt", "passedAt", "startedAt", "unlockedAt",
    };

    private ProgressStore() {
        //
    }

    private static List<String> existing(final SupportSQLiteDatabase sql, final String table, final String[] wanted) {
        final List<String> have = new ArrayList<>();
        try (final Cursor c = sql.query("PRAGMA table_info(`" + table + "`)")) {
            final int idx = c.getColumnIndexOrThrow("name");
            while (c.moveToNext()) {
                have.add(c.getString(idx));
            }
        }
        final List<String> out = new ArrayList<>();
        for (final String w: wanted) {
            if (have.contains(w)) {
                out.add(w);
            }
        }
        return out;
    }

    /** Forget all progress: every subject back to locked, no level history, level 1, no session. */
    public static void resetProgress(final AppDatabase db) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        final StringBuilder sets = new StringBuilder();
        for (final String col: existing(sql, "subject", NUMERIC)) {
            sets.append(sets.length() == 0 ? "" : ", ").append('`').append(col).append("` = 0");
        }
        for (final String col: existing(sql, "subject", TEXT)) {
            sets.append(", `").append(col).append("` = NULL");
        }
        sql.execSQL("UPDATE subject SET " + sets);
        sql.execSQL("DELETE FROM level_progression");
        Curriculum.ensureTables(sql);
        sql.execSQL("DELETE FROM mm_probation");
        sql.execSQL("DELETE FROM mm_jump");
        db.sessionItemDao().deleteAll();
        db.propertiesDao().setSessionType(SessionType.NONE);
        Session.getInstance().reset();
        db.propertiesDao().setUserLevel(1);
    }

    /** Snapshot of all progress as JSON text. */
    public static String export(final AppDatabase db) throws Exception {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getReadableDatabase();
        final JSONObject root = new JSONObject();
        root.put("format", FORMAT);
        root.put("version", VERSION);
        root.put("exportedAt", Clock.now());
        root.put("userLevel", db.propertiesDao().getUserLevel());

        final JSONArray levels = new JSONArray();
        final List<String> lpCols = existing(sql, "level_progression", LEVEL_PROGRESSION);
        try (final Cursor c = sql.query("SELECT " + join(lpCols) + " FROM level_progression ORDER BY level")) {
            while (c.moveToNext()) {
                levels.put(row(c, lpCols));
            }
        }
        root.put("levelProgression", levels);

        final List<String> cols = new ArrayList<>(existing(sql, "subject", NUMERIC));
        cols.addAll(existing(sql, "subject", TEXT));
        cols.add(0, "id");
        final JSONArray subjects = new JSONArray();
        try (final Cursor c = sql.query("SELECT " + join(cols) + " FROM subject WHERE unlockedAt != 0 OR meaningNote IS NOT NULL"
                + " OR meaningSynonyms IS NOT NULL OR readingNote IS NOT NULL OR meaningCorrect + meaningIncorrect + readingCorrect + readingIncorrect > 0")) {
            while (c.moveToNext()) {
                subjects.put(row(c, cols));
            }
        }
        root.put("subjects", subjects);

        Curriculum.ensureTables(db.getOpenHelper().getWritableDatabase());
        root.put("curriculum", Curriculum.getMode().name());
        final JSONArray probation = new JSONArray();
        try (final Cursor c = sql.query("SELECT id, since FROM mm_probation ORDER BY id")) {
            while (c.moveToNext()) {
                probation.put(new JSONArray().put(c.getLong(0)).put(c.getLong(1)));
            }
        }
        root.put("probation", probation);
        final JSONArray jumps = new JSONArray();
        try (final Cursor c = sql.query("SELECT at, fromLevel, toLevel FROM mm_jump ORDER BY at")) {
            while (c.moveToNext()) {
                jumps.put(new JSONArray().put(c.getLong(0)).put(c.getInt(1)).put(c.getInt(2)));
            }
        }
        root.put("jumps", jumps);
        return root.toString(1);
    }

    /** Quick validity check of a saved file, returning a short human summary. */
    public static String describe(final String json) throws Exception {
        final JSONObject root = new JSONObject(json);
        final String format = root.optString("format");
        if (!FORMAT.equals(format) && !LEGACY_FORMAT.equals(format)) {
            throw new IllegalArgumentException("This is not a KanjiKodama progress file.");
        }
        if (root.optInt("version") > VERSION) {
            throw new IllegalArgumentException("This progress file was made by a newer KanjiKodama.");
        }
        final java.text.DateFormat fmt = java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.MEDIUM, java.text.DateFormat.SHORT);
        return "Saved " + fmt.format(new java.util.Date(root.optLong("exportedAt")))
                + ("JLPT".equals(root.optString("curriculum")) ? ", JLPT order" : ", WaniKani order")
                + ", level " + root.optInt("userLevel", 1)
                + ", " + root.optJSONArray("subjects").length() + " items with progress.";
    }

    /** Replace all local progress with the snapshot. */
    public static void restore(final AppDatabase db, final String json) throws Exception {
        describe(json);
        final JSONObject root = new JSONObject(json);
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        sql.beginTransaction();
        try {
            resetProgress(db);
            final List<String> subjectCols = new ArrayList<>(existing(sql, "subject", NUMERIC));
            subjectCols.addAll(existing(sql, "subject", TEXT));
            final JSONArray subjects = root.getJSONArray("subjects");
            for (int i = 0; i < subjects.length(); i++) {
                update(sql, "subject", subjects.getJSONObject(i), subjectCols);
            }
            final List<String> lpCols = existing(sql, "level_progression", LEVEL_PROGRESSION);
            final JSONArray levels = root.optJSONArray("levelProgression");
            if (levels != null) {
                for (int i = 0; i < levels.length(); i++) {
                    insert(sql, "level_progression", levels.getJSONObject(i), lpCols);
                }
            }
            final JSONArray probation = root.optJSONArray("probation");
            if (probation != null) {
                for (int i = 0; i < probation.length(); i++) {
                    final JSONArray p = probation.getJSONArray(i);
                    // KanjiKodama: only for subjects this content has; others could never be answered and would block fast travel.
                    sql.execSQL("INSERT OR REPLACE INTO mm_probation (id, since) SELECT id, ? FROM subject WHERE id = ?",
                            new Object[] {p.getLong(1), p.getLong(0)});
                }
            }
            final JSONArray jumps = root.optJSONArray("jumps");
            if (jumps != null) {
                for (int i = 0; i < jumps.length(); i++) {
                    final JSONArray j = jumps.getJSONArray(i);
                    sql.execSQL("INSERT INTO mm_jump (at, fromLevel, toLevel) VALUES (?, ?, ?)", new Object[] {j.getLong(0), j.getInt(1), j.getInt(2)});
                }
            }
            sql.setTransactionSuccessful();
        } finally {
            sql.endTransaction();
        }
        Curriculum.adopt(db, "JLPT".equals(root.optString("curriculum")) ? Curriculum.Mode.JLPT : Curriculum.Mode.WANIKANI);
        db.propertiesDao().setUserLevel(Math.max(1, root.optInt("userLevel", 1)));
        afterChange(db);
    }

    /** Recompute unlocks and refresh every dashboard view after progress changed wholesale. */
    public static void afterChange(final AppDatabase db) {
        LocalProgression.update(db);
        LiveTimeLine.getInstance().update();
        LiveSrsBreakDown.getInstance().update();
        LiveLevelProgress.getInstance().update();
        LiveRecentUnlocks.getInstance().update();
        LiveCriticalCondition.getInstance().update();
        LiveBurnedItems.getInstance().update();
        LiveLevelDuration.getInstance().forceUpdate();
        LiveAlertContext.getInstance().update();
    }

    private static String join(final List<String> cols) {
        final StringBuilder sb = new StringBuilder();
        for (final String c: cols) {
            sb.append(sb.length() == 0 ? "" : ", ").append('`').append(c).append('`');
        }
        return sb.toString();
    }

    private static JSONObject row(final Cursor c, final List<String> cols) throws Exception {
        final JSONObject o = new JSONObject();
        for (int i = 0; i < cols.size(); i++) {
            switch (c.getType(i)) {
                case Cursor.FIELD_TYPE_NULL: break;
                case Cursor.FIELD_TYPE_INTEGER: o.put(cols.get(i), c.getLong(i)); break;
                case Cursor.FIELD_TYPE_FLOAT: o.put(cols.get(i), c.getDouble(i)); break;
                default: o.put(cols.get(i), c.getString(i)); break;
            }
        }
        return o;
    }

    private static Object[] values(final JSONObject o, final List<String> cols) {
        final Object[] v = new Object[cols.size()];
        for (int i = 0; i < cols.size(); i++) {
            final Object x = o.opt(cols.get(i));
            v[i] = x == null || x == JSONObject.NULL ? null : x;
        }
        return v;
    }

    private static void update(final SupportSQLiteDatabase sql, final String table, final JSONObject o, final List<String> cols) {
        if (!o.has("id")) {
            return;
        }
        final List<String> present = new ArrayList<>();
        for (final Iterator<String> it = o.keys(); it.hasNext();) {
            final String k = it.next();
            if (cols.contains(k)) {
                present.add(k);
            }
        }
        if (present.isEmpty()) {
            return;
        }
        final StringBuilder sets = new StringBuilder();
        for (final String c: present) {
            sets.append(sets.length() == 0 ? "" : ", ").append('`').append(c).append("` = ?");
        }
        final Object[] args = new Object[present.size() + 1];
        System.arraycopy(values(o, present), 0, args, 0, present.size());
        args[present.size()] = o.optLong("id");
        sql.execSQL("UPDATE `" + table + "` SET " + sets + " WHERE id = ?", args);
    }

    private static void insert(final SupportSQLiteDatabase sql, final String table, final JSONObject o, final List<String> cols) {
        final StringBuilder marks = new StringBuilder();
        for (int i = 0; i < cols.size(); i++) {
            marks.append(i == 0 ? "?" : ", ?");
        }
        final Object[] v = values(o, cols);
        for (int i = 0; i < v.length; i++) {
            if (v[i] == null && !"id".equals(cols.get(i))) {
                v[i] = 0;
            }
        }
        sql.execSQL("INSERT OR REPLACE INTO `" + table + "` (" + join(cols) + ") VALUES (" + marks + ")", v);
    }
}
