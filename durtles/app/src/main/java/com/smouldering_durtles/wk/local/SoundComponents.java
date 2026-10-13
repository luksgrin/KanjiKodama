/*
 * KanjiKodama local mode: component and on'yomi teaching.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 * Data: assets/sound-components.db, built from KANJIDIC2 and KanjiVG (CC BY-SA) by tools/content.
 */

package com.smouldering_durtles.wk.local;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.api.model.Reading;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.util.Logger;

import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.annotation.Nullable;

/**
 * Looks up which part of a kanji carries its meaning and which carries its sound, and the
 * phonetic series the sound part belongs to, then renders that as a short explanation.
 */
public final class SoundComponents {
    private static final Logger LOGGER = Logger.get(SoundComponents.class);
    private static final String ASSET = "sound-components.db";
    private static final int MAX_MEMBERS_SHOWN = 12;

    private static @Nullable SQLiteDatabase db = null;

    private SoundComponents() {
        //
    }

    private static void deleteTree(final File file) {
        final @Nullable File[] children = file.listFiles();
        if (children != null) {
            for (final File child: children) {
                deleteTree(child);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private static synchronized @Nullable SQLiteDatabase open() {
        if (db != null && db.isOpen()) {
            return db;
        }
        try {
            final Context context = WkApplication.getInstance();
            deleteTree(new File(context.getFilesDir(), "mojimori")); // copy made under the app's former name
            final File dir = new File(context.getFilesDir(), "kanjikodama");
            if (!dir.exists() && !dir.mkdirs()) {
                return null;
            }
            final File file = new File(dir, ASSET);
            final File stamp = new File(dir, ASSET + ".size");
            final long assetSize;
            try (final InputStream in = context.getAssets().open(ASSET)) {
                long n = 0;
                final byte[] buf = new byte[1 << 16];
                int r;
                while ((r = in.read(buf)) > 0) {
                    n += r;
                }
                assetSize = n;
            }
            final String expected = Long.toString(assetSize);
            boolean fresh = false;
            if (file.exists() && stamp.exists()) {
                try (final InputStream in = new java.io.FileInputStream(stamp)) {
                    final byte[] buf = new byte[64];
                    final int n = in.read(buf);
                    fresh = n > 0 && expected.equals(new String(buf, 0, n).trim());
                }
            }
            if (!fresh) {
                try (final InputStream in = context.getAssets().open(ASSET); final OutputStream out = new FileOutputStream(file)) {
                    final byte[] buf = new byte[1 << 16];
                    int r;
                    while ((r = in.read(buf)) > 0) {
                        out.write(buf, 0, r);
                    }
                }
                try (final OutputStream out = new FileOutputStream(stamp)) {
                    out.write(expected.getBytes());
                }
            }
            db = SQLiteDatabase.openDatabase(file.getPath(), null, SQLiteDatabase.OPEN_READONLY);
            return db;
        } catch (final Exception e) {
            LOGGER.error(e, "Opening sound-components.db failed");
            return null;
        }
    }

    /** One part of a kanji with its role. */
    static final class Part {
        final String glyph;
        final String role;
        final String name;

        Part(final String glyph, final String role, final String name) {
            this.glyph = glyph;
            this.role = role;
            this.name = name;
        }
    }

    /** Collapse voicing and vowel length, mirroring tools/content kana.core(). */
    static String core(final String hiragana) {
        final String devoiced = "がかぎきぐくげけごこざさじしずすぜせぞそだたぢちづつでてどとばはびひぶふべへぼほぱはぴひぷふぺへぽほ";
        final StringBuilder sb = new StringBuilder();
        for (int i = 0; i < hiragana.length(); i++) {
            char c = hiragana.charAt(i);
            if (i == 0) {
                final int idx = devoiced.indexOf(c);
                if (idx >= 0 && idx % 2 == 0) {
                    c = devoiced.charAt(idx + 1);
                }
            }
            sb.append(c);
        }
        String s = sb.toString().replace(".", "").replace("-", "");
        // long vowels: こう→こ, くう→く, せい→せ ... (only a trailing う/い after o/u/e rows)
        if (s.length() >= 2) {
            final char last = s.charAt(s.length() - 1);
            final char prev = s.charAt(s.length() - 2);
            if (last == 'う' && "おこごそぞとどのほぼぽもよろょうくぐすずつづぬふぶぷむゆるゅ".indexOf(prev) >= 0
                    || last == 'い' && "えけげせぜてでねへべぺめれ".indexOf(prev) >= 0) {
                s = s.substring(0, s.length() - 1);
            }
        }
        return s;
    }

    static String classify(final String actual, final String seriesReading) {
        if (actual.equals(seriesReading)) {
            return "exact";
        }
        return core(actual).equals(core(seriesReading)) ? "variant" : "irregular";
    }

    private static String esc(final String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    /** Name for a part: WaniKani radical name, else WaniKani kanji meaning, else the open-data name. */
    private static String displayName(final String glyph, final String fallback) {
        try (final Cursor c = WkApplication.getDatabase().getOpenHelper().getReadableDatabase().query(
                "SELECT meanings FROM subject WHERE characters = ? AND hiddenAt = 0 AND object IN ('radical', 'kanji')"
                        + " ORDER BY object = 'radical' DESC LIMIT 1", new Object[] {glyph})) {
            if (c.moveToFirst() && !c.isNull(0)) {
                final JSONArray arr = new JSONArray(c.getString(0));
                if (arr.length() > 0) {
                    return arr.getJSONObject(0).getString("meaning");
                }
            }
        } catch (final Exception e) {
            // fall through
        }
        return fallback;
    }

    /**
     * Render the "Parts and sound" section for a kanji, or null when there is nothing to say.
     * The result is HTML for TextUtil.renderHtml().
     */
    public static @Nullable String renderHtml(final Subject subject) {
        final @Nullable String literal = subject.getCharacters();
        final @Nullable SQLiteDatabase sdb = open();
        if (literal == null || sdb == null) {
            return null;
        }
        final List<Part> parts = new ArrayList<>();
        try (final Cursor c = sdb.rawQuery("SELECT glyph, role, name FROM kanji_part WHERE literal = ? ORDER BY ordinal", new String[] {literal})) {
            while (c.moveToNext()) {
                parts.add(new Part(c.getString(0), c.getString(1), displayName(c.getString(0), c.getString(2))));
            }
        }
        String phonetic = null;
        String seriesReading = null;
        long seriesId = -1;
        String dictReading = null;
        String dictMatch = null;
        try (final Cursor c = sdb.rawQuery("SELECT phonetic, series_reading, series_id, actual_reading, match FROM kanji_sound WHERE literal = ?",
                new String[] {literal})) {
            if (c.moveToFirst()) {
                phonetic = c.getString(0);
                seriesReading = c.getString(1);
                seriesId = c.getLong(2);
                dictReading = c.getString(3);
                dictMatch = c.getString(4);
            }
        }
        if (parts.isEmpty() && phonetic == null) {
            return null;
        }

        final StringBuilder html = new StringBuilder();
        if (!parts.isEmpty()) {
            html.append("<b>Parts:</b> ");
            for (int i = 0; i < parts.size(); i++) {
                final Part p = parts.get(i);
                if (i > 0) {
                    html.append(" + ");
                }
                html.append("<ja>").append(esc(p.glyph)).append("</ja> ").append(esc(p.name));
                switch (p.role) {
                    case "semantic": html.append(" <i>(meaning)</i>"); break;
                    case "phonetic": html.append(" <i>(sound)</i>"); break;
                    case "both": html.append(" <i>(meaning + sound)</i>"); break;
                    default: break;
                }
            }
            html.append("<br/>");
        }

        if (phonetic == null || seriesReading == null) {
            html.append("No part of this kanji hints at its on'yomi; learn the reading directly.");
            return html.toString();
        }

        // Compare the series reading with the on'yomi WaniKani teaches for this kanji.
        String asked = null;
        String bestOn = null;
        String bestMatch = "irregular";
        for (final Reading r: subject.getReadings()) {
            if (!r.isOnYomi()) {
                continue;
            }
            final @Nullable String v = r.getValue(false);
            if (v == null) {
                continue;
            }
            if (r.isPrimary() && asked == null) {
                asked = v;
            }
            final String m = classify(v, seriesReading);
            if (bestOn == null || rank(m) < rank(bestMatch)) {
                bestOn = v;
                bestMatch = m;
            }
        }
        html.append("<b>Sound:</b> <ja>").append(esc(phonetic)).append("</ja> gives the on'yomi <ja>")
                .append(esc(seriesReading)).append("</ja>. ");
        final String askedMatch = asked == null ? null : classify(asked, seriesReading);
        if ("exact".equals(askedMatch)) {
            html.append("<ja>").append(esc(literal)).append("</ja> follows it: <ja>").append(esc(asked)).append("</ja> ✓");
        } else if ("variant".equals(askedMatch)) {
            html.append("<ja>").append(esc(literal)).append("</ja> reads <ja>").append(esc(asked))
                    .append("</ja>, a regular variant (voicing or vowel length) ≈");
        } else if (bestOn != null && !"irregular".equals(bestMatch)) {
            html.append("<ja>").append(esc(literal)).append("</ja> also has the on'yomi <ja>").append(esc(bestOn))
                    .append("</ja>, but the main one is <ja>").append(esc(asked == null ? "?" : asked)).append("</ja>.");
        } else if (dictReading != null && !"irregular".equals(dictMatch) && asked != null) {
            // The dictionary lists the series reading for this kanji, but it is rare: WaniKani teaches another one.
            html.append("<ja>").append(esc(literal)).append("</ja> reads <ja>").append(esc(asked))
                    .append("</ja> ✗. It does have the series reading <ja>").append(esc(dictReading))
                    .append("</ja>, but only in rare words.");
        } else {
            html.append("<ja>").append(esc(literal)).append("</ja> is an exception");
            if (asked != null) {
                html.append(": <ja>").append(esc(asked)).append("</ja>");
            }
            html.append(" ✗");
        }
        html.append("<br/>");

        try (final Cursor c = sdb.rawQuery("SELECT reliability, core_members FROM series WHERE id = ?", new String[] {Long.toString(seriesId)})) {
            if (c.moveToFirst() && c.getInt(1) > 1) {
                html.append(String.format(Locale.ROOT, "%d%% of the %d common <ja>%s</ja>-series kanji follow this reading.",
                        Math.round(c.getDouble(0) * 100), c.getInt(1), esc(phonetic)));
            }
        }
        // Other members that WaniKani teaches, in WaniKani level order.
        final List<String> members = new ArrayList<>();
        final List<String[]> candidates = new ArrayList<>();
        try (final Cursor c = sdb.rawQuery("SELECT literal, reading, match FROM series_member WHERE series_id = ? AND literal != ?",
                new String[] {Long.toString(seriesId), literal})) {
            while (c.moveToNext()) {
                candidates.add(new String[] {c.getString(0), c.getString(1), c.getString(2)});
            }
        }
        final List<Object[]> taught = new ArrayList<>();
        for (final String[] m: candidates) {
            final int level = wkKanjiLevel(m[0]);
            if (level > 0) {
                taught.add(new Object[] {level, m});
            }
        }
        java.util.Collections.sort(taught, (a, b) -> Integer.compare((Integer) a[0], (Integer) b[0]));
        for (final Object[] t: taught) {
            if (members.size() >= MAX_MEMBERS_SHOWN) {
                break;
            }
            final String[] m = (String[]) t[1];
            final String mark = "exact".equals(m[2]) ? "✓" : "variant".equals(m[2]) ? "≈" : "✗";
            members.add("<ja>" + esc(m[0]) + " " + esc(m[1]) + "</ja> " + mark + " <small>L" + t[0] + "</small>");
        }
        if (!members.isEmpty()) {
            html.append("<br/>Also in WaniKani: ").append(android.text.TextUtils.join(" · ", members));
        }
        return html.toString();
    }

    /** WaniKani level of a kanji, or 0 when WaniKani does not teach it. */
    private static int wkKanjiLevel(final String literal) {
        try (final Cursor c = WkApplication.getDatabase().getOpenHelper().getReadableDatabase().query(
                "SELECT level FROM subject WHERE characters = ? AND object = 'kanji' AND hiddenAt = 0 LIMIT 1", new Object[] {literal})) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        } catch (final Exception e) {
            return 0;
        }
    }

    private static int rank(final String match) {
        return "exact".equals(match) ? 0 : "variant".equals(match) ? 1 : 2;
    }
}
