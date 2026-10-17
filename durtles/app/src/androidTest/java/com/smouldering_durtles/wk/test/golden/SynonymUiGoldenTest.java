/*
 * KanjiKodama golden fixtures (Tier B): what the study-material screens show and save on the device.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.text.Spanned;
import android.text.style.StyleSpan;
import android.view.View;
import android.widget.TextView;

import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.test.core.app.ActivityScenario;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.smouldering_durtles.wk.R;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.activities.StudyMaterialsActivity;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.SubjectType;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.local.LocalContent;
import com.smouldering_durtles.wk.local.LocalMode;
import com.smouldering_durtles.wk.util.ObjectSupport;
import com.smouldering_durtles.wk.views.SynonymRowView;

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
import java.util.TimeZone;
import java.util.concurrent.atomic.AtomicReference;

import javax.annotation.Nullable;

/**
 * Writes {@code answers/synonyms-ui-device.json}. RESETS THE APP'S PROGRESS (back up first, see
 * web/test/golden/README.md).
 *
 * <ul>
 *   <li>{@code richtext/...}: {@code Subject.getMeaningSynonymsRichText()} (HtmlCompat, FROM_HTML_MODE_COMPACT,
 *   WaniKaniTagHandler) for a {@code meaningSynonyms} column; {@code meaningNote/...}, {@code readingNote/...}: the
 *   note rich texts. Output {@code {text, spans}}: the plain text and every span as {@code [type, start, end]}
 *   (type {@code bold} for a bold StyleSpan, else the span's simple class name).</li>
 *   <li>{@code activity/...}: the real StudyMaterialsActivity. The subject's {@code meaningSynonyms},
 *   {@code meaningNote} and {@code readingNote} columns are set first ({@code before}; null = NULL), the activity is
 *   opened, the form read ({@code shown}: the 10 rows and both notes), {@code edits} applied in order
 *   ({@code {row, text}} sets a row's EditText, {@code {down: row}} / {@code {up: row}} clicks that row's arrow,
 *   {@code {meaningNote}} / {@code {readingNote}} set a note field), the form read again ({@code edited}), Save
 *   clicked, and the subject's columns read once the save job has run ({@code stored}) plus
 *   {@code Subject.getMeaningSynonyms()} on the stored row.</li>
 * </ul>
 */
@LargeTest
public final class SynonymUiGoldenTest {
    private static final int[] ROWS = {R.id.synonym0, R.id.synonym1, R.id.synonym2, R.id.synonym3, R.id.synonym4, R.id.synonym5,
            R.id.synonym6, R.id.synonym7, R.id.synonym8, R.id.synonym9};

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
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        GoldenWriter.setBaseDir(new File(context.getExternalFilesDir(null), "golden"));
    }

    @AfterClass
    public static void tearDown() {
        Clock.reset();
        ObjectSupport.unseedRandom();
    }

    @Test
    public void synonymUi() throws Exception {
        final ScenarioRunner runner = new ScenarioRunner(context, testContext);
        try (final GoldenWriter w = GoldenWriter.open("answers/synonyms-ui-device.json", "answers.synonymsUiDevice",
                "db/model/Subject.getMeaningSynonymsRichText/getMeaningNoteRichText/getReadingNoteRichText,"
                        + " activities/StudyMaterialsActivity (real activity, SynonymRowView, SaveStudyMaterialJob)")) {
            richText(w);
            runner.baseReset(1);
            activity(w);
        }
        runner.baseReset(1);
    }

    // --- rich text -----------------------------------------------------------------------------------

    private static void richText(final GoldenWriter w) throws Exception {
        final String[][] synonyms = {
                {"none", null}, {"empty-array", "[]"}, {"one", "[\"papa\"]"}, {"two", "[\"papa\",\"daddy\"]"},
                {"blank-entries-dropped", "[\"\",\" \",null,\"papa\"]"}, {"garbage", "papa, daddy"},
                {"html-specials", "[\"a & b\",\"<b>bold</b>\",\"x > y\",\"\\\"quoted\\\"\",\"it's\"]"},
                {"entity-text", "[\"&amp;\",\"&lt;b&gt;\",\"&#20013;\",\"&nbsp;\"]"}, {"tags-of-wanikani", "[\"<radical>x</radical>\",\"<ja>y</ja>\"]"},
                {"comma-inside", "[\"one, two\",\"three\"]"}, {"spaces", "[\"  big   dad  \",\"tab\\there\"]"},
                {"newline", "[\"line\\nbreak\",\"crlf\\r\\nx\"]"}, {"nbsp", "[\"a\\u00a0b\",\"\\u00a0\"]"},
                {"ideographic-space", "[\"\\u3000\\u4e00\\u3000\"]"}, {"japanese-emoji", "[\"\\u3044\\u3061\",\"\\ud83c\\udf7a\",\"caf\\u00e9\"]"},
                {"backslash", "[\"back\\\\slash\"]"}, {"twelve", "[\"s1\",\"s2\",\"s3\",\"s4\",\"s5\",\"s6\",\"s7\",\"s8\",\"s9\",\"s10\",\"s11\",\"s12\"]"},
        };
        for (final String[] c: synonyms) {
            final Subject s = subject(c[1], null, null);
            w.add("richtext/" + c[0], obj("meaningSynonymsColumn", c[1]),
                    obj("synonyms", new ArrayList<>(s.getMeaningSynonyms()), "rich", rich(s.getMeaningSynonymsRichText())));
        }
        final String[][] notes = {
                {"null", null}, {"empty", ""}, {"plain", "Dad is papa"}, {"newlines", "line 1\nline 2\n\nline 4\n"}, {"crlf", "a\r\nb"},
                {"html-specials", "a & b <b>x</b> > \"q\""}, {"spaces", "  lead   inner  trail  "}, {"tab", "a\tb"},
                {"japanese", "\u8aad\u307f\u306f\u3061\u3061"},
        };
        for (final String[] c: notes) {
            final Subject s = subject(null, c[1], c[1]);
            w.add("meaningNote/" + c[0], obj("meaningNote", c[1]), obj("rich", rich(s.getMeaningNoteRichText())));
            w.add("readingNote/" + c[0], obj("readingNote", c[1]), obj("rich", rich(s.getReadingNoteRichText())));
        }
    }

    private static Map<String, Object> rich(final CharSequence cs) {
        final List<Object> spans = new ArrayList<>();
        if (cs instanceof Spanned) {
            final Spanned sp = (Spanned) cs;
            for (final Object span: sp.getSpans(0, sp.length(), Object.class)) {
                final String type = span instanceof StyleSpan && ((StyleSpan) span).getStyle() == android.graphics.Typeface.BOLD
                        ? "bold" : span.getClass().getSimpleName();
                spans.add(Arrays.asList(type, sp.getSpanStart(span), sp.getSpanEnd(span)));
            }
        }
        return obj("text", cs.toString(), "spans", spans);
    }

    private static Subject subject(final @Nullable String column, final @Nullable String meaningNote, final @Nullable String readingNote) {
        final SubjectEntity e = new SubjectEntity();
        e.id = 512;
        e.type = SubjectType.WANIKANI_KANJI;
        e.characters = "\u7236";
        e.meaningSynonyms = column;
        e.meaningNote = meaningNote;
        e.readingNote = readingNote;
        return new Subject(e);
    }

    // --- activity ------------------------------------------------------------------------------------

    private static String repeat(final String s, final int n) {
        final StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) {
            sb.append(s);
        }
        return sb.toString();
    }

    private static String synonymsColumn(final int n) {
        final StringBuilder sb = new StringBuilder("[");
        for (int i = 1; i <= n; i++) {
            sb.append(i == 1 ? "" : ",").append("\"syn ").append(i).append('"');
        }
        return sb.append(']').toString();
    }

    private static Map<String, Object> set(final int row, final String text) {
        return obj("row", row, "text", text);
    }

    private void activity(final GoldenWriter w) throws Exception {
        final Object[][] cases = {
                // {name, subject, meaningSynonyms column, meaningNote, readingNote, edits}
                {"unchanged-two", 512L, "[\"papa\",\"daddy\"]", "Dad is papa", "", new Object[0]},
                {"unchanged-null-notes", 512L, "[\"papa\"]", null, null, new Object[0]},
                {"unchanged-null-column", 512L, null, null, null, new Object[0]},
                {"unchanged-twelve-drops-two", 440L, synonymsColumn(12), "m", "r", new Object[0]},
                {"unchanged-twenty-five", 440L, synonymsColumn(25), "", "", new Object[0]},
                {"edit-row-of-twelve", 440L, synonymsColumn(12), "", "", new Object[] {set(4, "edited")}},
                {"blank-entries-on-load", 512L, "[\"\",\"papa\",\" \",null,\"daddy\"]", "", "", new Object[0]},
                {"typed-untrimmed", 512L, "[]", "", "",
                        new Object[] {set(0, " papa "), set(1, "  "), set(2, "\t"), set(3, "\u00a0"), set(4, "daddy")}},
                {"arrows", 512L, "[\"a\",\"b\",\"c\"]", "", "",
                        new Object[] {obj("down", 0), obj("up", 2), obj("down", 2), obj("up", 9), obj("down", 9), obj("up", 0)}},
                {"arrows-swap-with-empty", 512L, "[\"a\"]", "", "", new Object[] {obj("down", 0), obj("down", 1)}},
                {"clear-all", 512L, "[\"papa\",\"daddy\"]", "note", "rnote",
                        new Object[] {set(0, ""), set(1, ""), obj("meaningNote", ""), obj("readingNote", "")}},
                {"long-note-truncated", 512L, "[]", repeat("abcdefghij", 60), repeat("\u3042", 501), new Object[0]},
                {"long-note-surrogate-boundary", 512L, "[]", repeat("a", 499) + "\ud83c\udf7a" + "b", "", new Object[0]},
                {"typed-long-note", 512L, "[]", "", "", new Object[] {obj("meaningNote", repeat("x", 520))}},
                {"long-synonym-kept", 512L, "[]", "", "", new Object[] {set(0, repeat("long ", 80))}},
                {"newline-in-synonym", 512L, "[\"line\\nbreak\"]", "", "", new Object[] {set(1, "typed\nnewline")}},
                {"notes-untrimmed", 512L, "[]", "  meaning \n", "\treading ", new Object[0]},
                {"special-characters", 440L, "[\"one, two\",\"say \\\"one\\\"\",\"</b>\",\"\\ud83c\\udf7a\"]", "<b>&</b>", "\u8aad\u307f",
                        new Object[] {set(4, "caf\u00e9")}},
        };
        final SupportSQLiteDatabase sql = WkApplication.getDatabase().getOpenHelper().getWritableDatabase();
        for (final Object[] c: cases) {
            final String name = (String) c[0];
            final long id = (Long) c[1];
            final String column = (String) c[2];
            final String meaningNote = (String) c[3];
            final String readingNote = (String) c[4];
            final Object[] edits = (Object[]) c[5];
            sql.execSQL("UPDATE subject SET meaningSynonyms = ?, meaningNote = ?, readingNote = ?, studyMaterialPatched = 0 WHERE id = ?",
                    new Object[] {column, meaningNote, readingNote, id});
            final Map<String, Object> before = row(sql, id);
            final Intent intent = new Intent(context, StudyMaterialsActivity.class).putExtra("id", id)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Map<String, Object> shown;
            Map<String, Object> edited;
            try (final ActivityScenario<StudyMaterialsActivity> scenario = ActivityScenario.launch(intent)) {
                waitFor(scenario, a -> ((TextView) a.findViewById(R.id.label)).getText().length() > 0);
                // Let onResume's enableInteraction run.
                waitFor(scenario, a -> a.findViewById(R.id.saveStudyMaterialsButton1).isShown());
                shown = form(scenario);
                scenario.onActivity(a -> {
                    for (final Object e: edits) {
                        @SuppressWarnings("unchecked") final Map<String, Object> m = (Map<String, Object>) e;
                        if (m.containsKey("row")) {
                            ((SynonymRowView) a.findViewById(ROWS[(Integer) m.get("row")])).setText((String) m.get("text"));
                        }
                        else if (m.containsKey("down")) {
                            a.findViewById(ROWS[(Integer) m.get("down")]).findViewById(R.id.arrowDown).performClick();
                        }
                        else if (m.containsKey("up")) {
                            a.findViewById(ROWS[(Integer) m.get("up")]).findViewById(R.id.arrowUp).performClick();
                        }
                        else if (m.containsKey("meaningNote")) {
                            ((TextView) a.findViewById(R.id.meaningNote)).setText((String) m.get("meaningNote"));
                        }
                        else {
                            ((TextView) a.findViewById(R.id.readingNote)).setText((String) m.get("readingNote"));
                        }
                    }
                });
                edited = form(scenario);
                scenario.onActivity(a -> a.findViewById(R.id.saveStudyMaterialsButton1).performClick());
                final long deadline = System.currentTimeMillis() + 20_000;
                while (!Long.valueOf(1).equals(((Map<?, ?>) row(sql, id).get("studyMaterialPatched")).get("value"))) {
                    assertTrue("save job did not run for " + name, System.currentTimeMillis() < deadline);
                    Thread.sleep(100);
                }
            }
            final Map<String, Object> stored = row(sql, id);
            final Subject s = WkApplication.getDatabase().subjectDao().getById(id);
            w.add("activity/" + name, obj("subject", id, "before", before, "edits", Arrays.asList(edits)),
                    obj("shown", shown, "edited", edited, "stored", stored, "storedSynonyms", new ArrayList<>(s.getMeaningSynonyms())));
        }
    }

    private interface Check {
        boolean test(Activity a);
    }

    private static void waitFor(final ActivityScenario<StudyMaterialsActivity> scenario, final Check check) throws Exception {
        final long deadline = System.currentTimeMillis() + 20_000;
        while (true) {
            final boolean[] ok = {false};
            scenario.onActivity(a -> ok[0] = check.test(a));
            if (ok[0]) {
                return;
            }
            assertTrue("activity did not get ready", System.currentTimeMillis() < deadline);
            Thread.sleep(100);
        }
    }

    private static Map<String, Object> form(final ActivityScenario<StudyMaterialsActivity> scenario) {
        final AtomicReference<Map<String, Object>> out = new AtomicReference<>();
        scenario.onActivity(a -> {
            final List<String> rows = new ArrayList<>();
            for (final int r: ROWS) {
                rows.add(((SynonymRowView) a.findViewById(r)).getText());
            }
            final View up0 = a.findViewById(ROWS[0]).findViewById(R.id.arrowUp);
            final View down9 = a.findViewById(ROWS[9]).findViewById(R.id.arrowDown);
            out.set(obj("rows", rows, "meaningNote", ((TextView) a.findViewById(R.id.meaningNote)).getText().toString(),
                    "readingNote", ((TextView) a.findViewById(R.id.readingNote)).getText().toString(),
                    "row0UpVisible", up0.getVisibility() == View.VISIBLE, "row9DownVisible", down9.getVisibility() == View.VISIBLE));
        });
        return out.get();
    }

    private static Map<String, Object> row(final SupportSQLiteDatabase sql, final long id) {
        final String[] cols = {"meaningSynonyms", "meaningNote", "readingNote", "studyMaterialPatched"};
        final Map<String, Object> out = new LinkedHashMap<>();
        try (final Cursor c = sql.query("SELECT meaningSynonyms, typeof(meaningSynonyms), meaningNote, typeof(meaningNote), readingNote,"
                + " typeof(readingNote), studyMaterialPatched, typeof(studyMaterialPatched) FROM subject WHERE id = ?", new Object[] {id})) {
            c.moveToFirst();
            for (int i = 0; i < cols.length; i++) {
                final String type = c.getString(2 * i + 1);
                final Object value = c.isNull(2 * i) ? null : "integer".equals(type) ? (Object) c.getLong(2 * i) : c.getString(2 * i);
                out.put(cols[i], obj("type", type, "value", value));
            }
        }
        return out;
    }
}
