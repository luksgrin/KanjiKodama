/*
 * KanjiKodama golden fixtures (Tier B): the "shake on matching kanji" setting and the matching kanji lookup over the
 * real content in the app DB.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.preference.PreferenceManager;

import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.smouldering_durtles.wk.GlobalSettings;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.local.LocalContent;
import com.smouldering_durtles.wk.local.LocalMode;
import com.smouldering_durtles.wk.model.MatchingKanji;

import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Writes {@code answers/matching-kanji-device.json}. RESETS THE APP'S PROGRESS (back up first, see
 * web/test/golden/README.md).
 *
 * <ul>
 *   <li>{@code setting/<enable_advanced>/<shake_on_matching_kanji>} (each "absent", true or false): output
 *   {@code {value}} = GlobalSettings.AdvancedOther.getShakeOnMatchingKanji().</li>
 *   <li>{@code lookup/<id>}: every subject (visible or hidden) for which MatchingKanji.lookupCharacters(subject, true)
 *   is not null, in id order: input {@code {id, object, characters, hiddenAt}}, output {@code {matchingKanji}}, the id
 *   SubjectDao.getKanjiByCharacters returns (a visible kanji with those characters) or null.</li>
 * </ul>
 */
@LargeTest
public final class MatchingKanjiGoldenTest {
    private static final String[] KEYS = {"enable_advanced", "shake_on_matching_kanji"};
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
        Thread.sleep(3000);
        Locale.setDefault(Locale.US);
        GoldenWriter.setBaseDir(new File(context.getExternalFilesDir(null), "golden"));
    }

    private static void put(final SharedPreferences.Editor e, final String key, final Object value) {
        if (value == null) {
            e.remove(key);
        }
        else {
            e.putBoolean(key, (Boolean) value);
        }
    }

    @Test
    public void matchingKanji() throws Exception {
        new ScenarioRunner(context, testContext).baseReset(1);
        final AppDatabase db = WkApplication.getDatabase();
        final SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
        final Map<String, ?> all = prefs.getAll();
        final Object[] original = {all.get(KEYS[0]), all.get(KEYS[1])};
        final Object[] values = {null, true, false};
        try (final GoldenWriter w = GoldenWriter.open("answers/matching-kanji-device.json", "answers.matchingKanjiDevice",
                "GlobalSettings.AdvancedOther.getShakeOnMatchingKanji, model/MatchingKanji.lookupCharacters,"
                        + " db/dao/SubjectDao.getKanjiByCharacters")) {
            try {
                for (final Object advanced: values) {
                    for (final Object shake: values) {
                        final SharedPreferences.Editor e = prefs.edit();
                        put(e, KEYS[0], advanced);
                        put(e, KEYS[1], shake);
                        e.commit();
                        w.add("setting/" + (advanced == null ? "absent" : advanced) + "/" + (shake == null ? "absent" : shake),
                                obj(KEYS[0], advanced, KEYS[1], shake),
                                obj("value", GlobalSettings.AdvancedOther.getShakeOnMatchingKanji()));
                    }
                }
            } finally {
                final SharedPreferences.Editor e = prefs.edit();
                put(e, KEYS[0], original[0]);
                put(e, KEYS[1], original[1]);
                e.commit();
            }

            final List<long[]> ids = new ArrayList<>();
            try (Cursor c = db.getOpenHelper().getWritableDatabase().query("SELECT id, hiddenAt FROM subject ORDER BY id")) {
                while (c.moveToNext()) {
                    ids.add(new long[] {c.getLong(0), c.getLong(1)});
                }
            }
            for (final long[] row: ids) {
                final Subject s = db.subjectDao().getById(row[0]);
                if (s == null) {
                    continue;
                }
                final String lookup = MatchingKanji.lookupCharacters(s, true);
                if (lookup == null) {
                    continue;
                }
                final Subject kanji = db.subjectDao().getKanjiByCharacters(lookup);
                w.add("lookup/" + s.getId(), obj("id", s.getId(), "object", s.getType().getDbTypeName(),
                        "characters", s.getCharacters(), "hiddenAt", row[1]),
                        obj("matchingKanji", kanji == null ? null : kanji.getId()));
            }
        }
    }
}
