/*
 * KanjiKodama local mode: WaniKani order or JLPT order.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.content.Context;
import android.database.Cursor;

import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.sqlite.db.SupportSQLiteStatement;

import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.util.Logger;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.Nullable;

/**
 * The curriculum decides the order in which subjects are taught. Progress is stored per subject
 * and shared by both orders; switching only rewrites the subject table's level and lessonPosition
 * columns and then places the learner with {@link Placement}.
 *
 * <p>State lives in a few raw tables next to Room's own, in the same database file, so it changes
 * in the same transactions as the subjects: mm_state (mode, applied ordering, level blocks),
 * mm_wk_order (WaniKani's original level and lesson position of every subject), and the fast
 * travel tables used by {@link FastTravel}.</p>
 */
public final class Curriculum {
    private static final Logger LOGGER = Logger.get(Curriculum.class);
    public static final String JLPT_ASSET = "jlpt-kanji.tsv";

    /** The two orders. */
    public enum Mode {
        WANIKANI("WaniKani order"), JLPT("JLPT order");

        public final String label;

        Mode(final String label) {
            this.label = label;
        }
    }

    private static volatile Mode mode = Mode.WANIKANI;
    private static volatile Mode ordering = Mode.WANIKANI;
    private static volatile List<Integer> blocks = Collections.emptyList();

    private Curriculum() {
        //
    }

    // --- state -----------------------------------------------------------------------------------

    static void ensureTables(final SupportSQLiteDatabase sql) {
        sql.execSQL("CREATE TABLE IF NOT EXISTS mm_state (key TEXT PRIMARY KEY NOT NULL, value TEXT)");
        sql.execSQL("CREATE TABLE IF NOT EXISTS mm_wk_order (id INTEGER PRIMARY KEY NOT NULL,"
                + " level INTEGER NOT NULL, lessonPosition INTEGER NOT NULL)");
        sql.execSQL("CREATE TABLE IF NOT EXISTS mm_probation (id INTEGER PRIMARY KEY NOT NULL, since INTEGER NOT NULL)");
        sql.execSQL("CREATE TABLE IF NOT EXISTS mm_jump (at INTEGER NOT NULL, fromLevel INTEGER NOT NULL, toLevel INTEGER NOT NULL)");
    }

    static @Nullable String getState(final SupportSQLiteDatabase sql, final String key) {
        try (final Cursor c = sql.query("SELECT value FROM mm_state WHERE key = ?", new Object[] {key})) {
            return c.moveToFirst() ? c.getString(0) : null;
        }
    }

    static void putState(final SupportSQLiteDatabase sql, final String key, final String value) {
        sql.execSQL("INSERT OR REPLACE INTO mm_state (key, value) VALUES (?, ?)", new Object[] {key, value});
    }

    private static Mode parseMode(final @Nullable String s) {
        return Mode.JLPT.name().equals(s) ? Mode.JLPT : Mode.WANIKANI;
    }

    private static void loadCache(final SupportSQLiteDatabase sql) {
        mode = parseMode(getState(sql, "mode"));
        ordering = parseMode(getState(sql, "ordering"));
        final List<Integer> b = new ArrayList<>();
        final @Nullable String csv = getState(sql, "blocks");
        if (csv != null && !csv.isEmpty()) {
            for (final String s: csv.split(",")) {
                b.add(Integer.parseInt(s.trim()));
            }
        }
        blocks = Collections.unmodifiableList(b);
    }

    /** The order the learner chose. */
    public static Mode getMode() {
        return mode;
    }

    /** The highest level of the current order. */
    public static int maxLevel() {
        return ordering == Mode.JLPT && !blocks.isEmpty() ? blocks.size() : LocalMode.MAX_LEVEL;
    }

    /** "N4, level 2 of 5" in JLPT order, null in WaniKani order. */
    public static @Nullable String describeLevel(final int level) {
        return ordering == Mode.JLPT ? describe(blocks, level) : null;
    }

    private static @Nullable String describe(final List<Integer> b, final int level) {
        if (level < 1 || level > b.size()) {
            return null;
        }
        final int block = b.get(level - 1);
        int first = level;
        while (first > 1 && b.get(first - 2) == block) {
            first--;
        }
        int count = 0;
        for (final int x: b) {
            if (x == block) {
                count++;
            }
        }
        return JlptPlan.blockName(block) + ", level " + (level - first + 1) + " of " + count;
    }

    /**
     * Called when switching to server mode: the server's subjects are in WaniKani order. The chosen order stays
     * stored and applies again when the bundled content is imported on the way back to local mode.
     */
    public static void onServerMode() {
        ordering = Mode.WANIKANI;
        blocks = Collections.emptyList();
    }

    // --- startup and content import ----------------------------------------------------------

    /** Called after bundled content was (re)imported: the subject table is in WaniKani order again. */
    public static void onContentImported(final AppDatabase db) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        ensureTables(sql);
        sql.execSQL("DELETE FROM mm_wk_order");
        sql.execSQL("INSERT INTO mm_wk_order (id, level, lessonPosition) SELECT id, level, lessonPosition FROM subject");
        sql.execSQL("DELETE FROM mm_probation");
        sql.execSQL("DELETE FROM mm_jump");
        putState(sql, "ordering", Mode.WANIKANI.name());
        putState(sql, "blocks", "");
        putState(sql, "extra_version", "");
        loadCache(sql);
    }

    /** Make sure the subject table is in the chosen order. Call at startup, after the content import. */
    public static synchronized void ensureOrdering(final Context context, final AppDatabase db) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        ensureTables(sql);
        boolean haveWkOrder;
        try (final Cursor c = sql.query("SELECT COUNT(*) FROM mm_wk_order")) {
            haveWkOrder = c.moveToFirst() && c.getLong(0) > 0;
        }
        if (!haveWkOrder) {
            if (parseMode(getState(sql, "ordering")) == Mode.WANIKANI) {
                sql.execSQL("INSERT INTO mm_wk_order (id, level, lessonPosition) SELECT id, level, lessonPosition FROM subject");
            }
            else {
                LOGGER.info("WaniKani order missing while the subject table is in JLPT order; restoring it from the asset");
                copyWkOrderFromAsset(context, sql);
            }
        }
        final boolean extrasChanged = ExtraContent.ensureImported(context, db);
        loadCache(sql);
        if (ordering != mode || extrasChanged && ordering == Mode.JLPT) {
            applyOrdering(context, db, mode);
        }
    }

    private static void copyWkOrderFromAsset(final Context context, final SupportSQLiteDatabase sql) {
        final File file = new File(context.getCacheDir(), "wk-order.db");
        try {
            try (final InputStream in = context.getAssets().open(LocalContent.ASSET); final OutputStream out = new FileOutputStream(file)) {
                final byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                }
            }
            sql.execSQL("ATTACH DATABASE '" + file.getAbsolutePath().replace("'", "''") + "' AS wko");
            try {
                sql.execSQL("INSERT OR REPLACE INTO mm_wk_order (id, level, lessonPosition) SELECT id, level, lessonPosition FROM wko.subject");
            } finally {
                sql.execSQL("DETACH DATABASE wko");
            }
        } catch (final Exception e) {
            LOGGER.error(e, "Restoring WaniKani order failed");
        } finally {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }

    // --- orderings -----------------------------------------------------------------------------

    /** Subject id to {level, lessonPosition} for an order, plus the block of every level (JLPT only). */
    static final class Layout {
        final Map<Long, int[]> placement;
        final List<Integer> blocks;

        Layout(final Map<Long, int[]> placement, final List<Integer> blocks) {
            this.placement = placement;
            this.blocks = blocks;
        }
    }

    /** The JLPT order of every subject, whatever order the subject table is in now. */
    static Layout jlptLayout(final Context context, final AppDatabase db) {
        return layout(context, db.getOpenHelper().getReadableDatabase(), Mode.JLPT);
    }

    static @Nullable String describe(final Layout layout, final int level) {
        return describe(layout.blocks, level);
    }

    private static Map<Long, int[]> wkOrder(final SupportSQLiteDatabase sql) {
        final Map<Long, int[]> out = new HashMap<>();
        try (final Cursor c = sql.query("SELECT id, level, lessonPosition FROM mm_wk_order")) {
            while (c.moveToNext()) {
                out.put(c.getLong(0), new int[] {c.getInt(1), c.getInt(2)});
            }
        }
        return out;
    }

    static Map<String, Integer> loadJlptKanji(final Context context) {
        final Map<String, Integer> out = new HashMap<>();
        try (final BufferedReader r = new BufferedReader(new InputStreamReader(context.getAssets().open(JLPT_ASSET), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                final String[] parts = line.split("\t");
                if (parts.length == 2) {
                    out.put(parts[0], Integer.parseInt(parts[1].trim()));
                }
            }
        } catch (final Exception e) {
            LOGGER.error(e, "Reading the JLPT kanji list failed");
        }
        return out;
    }

    private static Layout layout(final Context context, final SupportSQLiteDatabase sql, final Mode target) {
        final Map<Long, int[]> wk = wkOrder(sql);
        if (target == Mode.WANIKANI) {
            return new Layout(wk, Collections.emptyList());
        }
        final List<JlptPlan.Row> rows = new ArrayList<>();
        try (final Cursor c = sql.query("SELECT id, object, characters, componentSubjectIds, hiddenAt FROM subject WHERE object IS NOT NULL")) {
            while (c.moveToNext()) {
                final long id = c.getLong(0);
                final int[] w = wk.get(id);
                rows.add(new JlptPlan.Row(id, c.getString(1), w == null ? 60 : w[0], w == null ? 0 : w[1],
                        parseIds(c.isNull(3) ? "" : c.getString(3)), c.getLong(4) != 0, c.isNull(2) ? null : c.getString(2)));
            }
        }
        final JlptPlan plan = JlptPlan.build(rows, loadJlptKanji(context));
        return new Layout(plan.placement, plan.blockOfLevel);
    }

    static long[] parseIds(final String json) {
        final String body = json.replace("[", "").replace("]", "").trim();
        if (body.isEmpty()) {
            return new long[0];
        }
        final String[] parts = body.split(",");
        final long[] out = new long[parts.length];
        for (int i = 0; i < parts.length; i++) {
            out[i] = Long.parseLong(parts[i].trim());
        }
        return out;
    }

    /** Rewrite the subject table into the given order. Does not move the learner. */
    static synchronized void applyOrdering(final Context context, final AppDatabase db, final Mode target) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        final Layout layout = layout(context, sql, target);
        if (layout.placement.isEmpty()) {
            return;
        }
        final StringBuilder csv = new StringBuilder();
        for (final int b: layout.blocks) {
            csv.append(csv.length() == 0 ? "" : ",").append(b);
        }
        sql.beginTransaction();
        try {
            final SupportSQLiteStatement stmt = sql.compileStatement("UPDATE subject SET level = ?, lessonPosition = ? WHERE id = ?");
            for (final Map.Entry<Long, int[]> e: layout.placement.entrySet()) {
                stmt.bindLong(1, e.getValue()[0]);
                stmt.bindLong(2, e.getValue()[1]);
                stmt.bindLong(3, e.getKey());
                stmt.executeUpdateDelete();
            }
            putState(sql, "ordering", target.name());
            putState(sql, "blocks", csv.toString());
            sql.setTransactionSuccessful();
        } finally {
            sql.endTransaction();
        }
        loadCache(sql);
        LOGGER.info("Curriculum: subjects rewritten into %s (%d levels)", target.label, maxLevel());
    }

    // --- placement -----------------------------------------------------------------------------

    /** What switching to a mode would do, without changing anything. */
    public static final class Preview {
        public final Mode target;
        public final Placement placement;
        public final @Nullable String levelDescription;

        Preview(final Mode target, final Placement placement, final @Nullable String levelDescription) {
            this.target = target;
            this.placement = placement;
            this.levelDescription = levelDescription;
        }
    }

    public static Preview preview(final Context context, final AppDatabase db, final Mode target) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getReadableDatabase();
        ensureTables(db.getOpenHelper().getWritableDatabase());
        final Layout layout = layout(context, sql, target);
        final int levels = target == Mode.JLPT ? Math.max(1, layout.blocks.size()) : LocalMode.MAX_LEVEL;
        final int[] total = new int[levels];
        final int[] passed = new int[levels];
        try (final Cursor c = sql.query("SELECT id, passedAt != 0 FROM subject WHERE object = 'kanji' AND hiddenAt = 0")) {
            while (c.moveToNext()) {
                final int[] p = layout.placement.get(c.getLong(0));
                if (p != null && p[0] >= 1 && p[0] <= levels) {
                    total[p[0] - 1]++;
                    passed[p[0] - 1] += c.getInt(1);
                }
            }
        }
        final Placement placement = Placement.of(total, passed);
        return new Preview(target, placement, target == Mode.JLPT ? describe(layout.blocks, placement.level) : null);
    }

    /** Place the learner in the current order: set the level and unlock backfill kanji as lessons. */
    public static Placement place(final AppDatabase db) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        final int levels = maxLevel();
        final int[] total = new int[levels];
        final int[] passed = new int[levels];
        try (final Cursor c = sql.query("SELECT level, COUNT(*), SUM(passedAt != 0) FROM subject"
                + " WHERE object = 'kanji' AND hiddenAt = 0 GROUP BY level")) {
            while (c.moveToNext()) {
                final int l = c.getInt(0);
                if (l >= 1 && l <= levels) {
                    total[l - 1] = c.getInt(1);
                    passed[l - 1] = c.getInt(2);
                }
            }
        }
        final Placement placement = Placement.of(total, passed);
        final long now = Clock.now();
        final List<Long> backfill = new ArrayList<>();
        try (final Cursor c = sql.query("SELECT id FROM subject WHERE object = 'kanji' AND hiddenAt = 0 AND unlockedAt = 0 AND level < ?",
                new Object[] {placement.level})) {
            while (c.moveToNext()) {
                backfill.add(c.getLong(0));
            }
        }
        for (final long id: backfill) {
            db.subjectSyncDao().forceLessonAvailable(id, now, LocalMode.MAX_LEVEL);
        }
        sql.execSQL("DELETE FROM level_progression");
        db.propertiesDao().setUserLevel(placement.level);
        LocalProgression.update(db);
        LOGGER.info("Curriculum: placed at level %d, %d backfill kanji", placement.level, backfill.size());
        return placement;
    }

    /** Switch order and place the learner. The caller makes sure no session is running. */
    public static synchronized Placement switchTo(final Context context, final AppDatabase db, final Mode target) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        ensureTables(sql);
        applyOrdering(context, db, target);
        putState(sql, "mode", target.name());
        loadCache(sql);
        final Placement placement = place(db);
        ProgressStore.afterChange(db);
        return placement;
    }

    /** Adopt a mode without placing the learner (restoring a saved file that carries its own level). */
    static synchronized void adopt(final AppDatabase db, final Mode target) {
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        ensureTables(sql);
        if (ordering != target) {
            applyOrdering(WkApplication.getInstance(), db, target);
        }
        putState(sql, "mode", target.name());
        loadCache(sql);
    }
}
