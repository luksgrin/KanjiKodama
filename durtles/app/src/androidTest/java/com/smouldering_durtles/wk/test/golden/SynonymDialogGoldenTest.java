/*
 * KanjiKodama golden fixtures (Tier B): the real "Add synonym" dialog of SubjectInfoView.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.os.SystemClock;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inspector.WindowInspector;
import android.widget.EditText;
import android.widget.TextView;

import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.test.core.app.ActivityScenario;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.smouldering_durtles.wk.R;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.activities.BrowseActivity;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.local.LocalContent;
import com.smouldering_durtles.wk.local.LocalMode;
import com.smouldering_durtles.wk.util.ObjectSupport;

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
 * Writes {@code answers/synonyms-dialog-device.json}: the real "Add synonym" dialog of {@code SubjectInfoView}, opened
 * from the subject info screen ({@code BrowseActivity} with extra {@code id}, i.e. SubjectInfoFragment). RESETS THE
 * APP'S PROGRESS (back up first, see web/test/golden/README.md).
 *
 * <p>Per case: the subject's {@code meaningSynonyms}, {@code meaningNote}, {@code readingNote} columns are set
 * ({@code before}), the screen opened, then {@code ops} run in order:</p>
 * <ul>
 *   <li>{@code {"open": true}}: clicks the "+" (addSynonymButton); the dialog's window is found with
 *   {@code WindowInspector.getGlobalWindowViews()}.</li>
 *   <li>{@code {"setText": t}}: {@code EditText.setText(t)}, cursor at the end (as a paste would leave it).</li>
 *   <li>{@code {"keys": s}}: key events for the ASCII characters of s from the virtual keyboard, injected with
 *   {@code Instrumentation.sendKeySync} (the whole input pipeline, IME stage included).</li>
 *   <li>{@code {"key": name, "meta": [shift|ctrl|alt]}}: one key (a {@code KeyEvent.KEYCODE_} suffix), down and up,
 *   injected the same way.</li>
 *   <li>{@code {"ime": "performEditorAction", "actionId": n}}, {@code {"ime": "commitText", "text": t}}: through the
 *   field's InputConnection (what a soft keyboard calls).</li>
 *   <li>{@code {"button": "save" | "cancel"}}: clicks the dialog's positive or negative button.</li>
 * </ul>
 * <p>After each op: {@code dialogShowing}, {@code field} (the dialog's text, null once closed) and {@code shown} (the
 * synonyms line of the info screen). After the last op the test waits up to 5 s for the save job
 * ({@code studyMaterialPatched} = 1) and records {@code stored} (the columns), {@code storedSynonyms}
 * ({@code Subject.getMeaningSynonyms} of the stored row), {@code saved} (whether the job ran) and
 * {@code shownReopened} (the synonyms line after opening the screen again). The test records the field's
 * {@code inputType}/{@code imeOptions} once ({@code field/editorInfo}).</p>
 */
@LargeTest
public final class SynonymDialogGoldenTest {
    private static final KeyCharacterMap KCM = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD);
    private static Context context;
    private static Context testContext;
    private static Instrumentation instrumentation;

    @BeforeClass
    public static void setUp() throws Exception {
        instrumentation = InstrumentationRegistry.getInstrumentation();
        context = instrumentation.getTargetContext();
        testContext = instrumentation.getContext();
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

    private static String repeat(final String s, final int n) {
        final StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) {
            sb.append(s);
        }
        return sb.toString();
    }

    private static Map<String, Object> open() {
        return obj("open", true);
    }

    private static Map<String, Object> text(final String t) {
        return obj("setText", t);
    }

    private static Map<String, Object> save() {
        return obj("button", "save");
    }

    private static Map<String, Object> key(final String name, final String... meta) {
        return obj("key", name, "meta", Arrays.asList(meta));
    }

    private static Map<String, Object> ime(final int actionId) {
        return obj("ime", "performEditorAction", "actionId", actionId);
    }

    private static Map<String, Object> commit(final String t) {
        return obj("ime", "commitText", "text", t);
    }

    @Test
    public void synonymDialog() throws Exception {
        final ScenarioRunner runner = new ScenarioRunner(context, testContext);
        final StringBuilder twelve = new StringBuilder("[");
        for (int i = 1; i <= 12; i++) {
            twelve.append(i == 1 ? "" : ",").append("\"syn ").append(i).append('"');
        }
        twelve.append(']');
        final Object[][] cases = {
                // {name, subject, meaningSynonyms column, ops}
                {"save-plain", 512L, "[]", new Object[] {open(), text("papa"), save()}},
                {"save-trimmed", 512L, "[]", new Object[] {open(), text("  papa \t"), save()}},
                {"save-to-null-column", 512L, null, new Object[] {open(), text("papa"), save()}},
                {"save-appends", 512L, "[\"papa\"]", new Object[] {open(), text("daddy"), save()}},
                {"save-empty", 512L, "[\"papa\"]", new Object[] {open(), save()}},
                {"save-spaces", 512L, "[\"papa\"]", new Object[] {open(), text("   "), save()}},
                {"save-nbsp-only", 512L, "[\"papa\"]", new Object[] {open(), text(" "), save()}},
                {"save-ideographic-space-only", 512L, "[\"papa\"]", new Object[] {open(), text("　　"), save()}},
                {"save-nbsp-padded", 512L, "[]", new Object[] {open(), text(" papa "), save()}},
                {"save-ideographic-padded", 512L, "[]", new Object[] {open(), text("　父　"), save()}},
                {"duplicate-exact", 512L, "[\"papa\"]", new Object[] {open(), text("papa"), save()}},
                {"duplicate-after-trim", 512L, "[\"papa\"]", new Object[] {open(), text(" papa "), save()}},
                {"duplicate-other-case", 512L, "[\"papa\"]", new Object[] {open(), text("Papa"), save()}},
                {"unicode", 512L, "[]", new Object[] {open(), text("パパ 🍺 café"), save()}},
                {"html-specials", 512L, "[]", new Object[] {open(), text("<b>x</b> & \"y\""), save()}},
                {"inner-spaces-kept", 512L, "[]", new Object[] {open(), text("big   dad"), save()}},
                {"long-not-truncated", 512L, "[]", new Object[] {open(), text(repeat("long ", 80)), save()}},
                {"twelve-plus-one", 440L, twelve.toString(), new Object[] {open(), text("thirteen"), save()}},
                {"blank-entries-in-column", 512L, "[\"\",\"papa\",\" \"]", new Object[] {open(), text("x"), save()}},
                {"two-in-a-row", 512L, "[]", new Object[] {open(), text("a"), save(), open(), text("b"), save()}},
                {"same-twice-in-a-row", 512L, "[]", new Object[] {open(), text("a"), save(), open(), text("a"), save()}},
                {"cancel", 512L, "[\"papa\"]", new Object[] {open(), text("daddy"), obj("button", "cancel")}},
                {"back-key", 512L, "[\"papa\"]", new Object[] {open(), text("daddy"), key("BACK")}},
                {"hardware-keys-enter", 512L, "[]", new Object[] {open(), obj("keys", "Dad"), key("ENTER")}},
                {"hardware-enter-trims", 512L, "[]", new Object[] {open(), obj("keys", " dad "), key("ENTER")}},
                {"hardware-enter-empty", 512L, "[\"papa\"]", new Object[] {open(), key("ENTER")}},
                {"hardware-shift-enter", 512L, "[]", new Object[] {open(), obj("keys", "dad"), key("ENTER", "shift"), save()}},
                {"hardware-numpad-enter", 512L, "[]", new Object[] {open(), obj("keys", "dad"), key("NUMPAD_ENTER"), save()}},
                {"hardware-enter-then-save-twice", 512L, "[]", new Object[] {open(), obj("keys", "dad"), key("ENTER"), key("ENTER")}},
                {"ime-done", 512L, "[]", new Object[] {open(), text("dad"), ime(EditorInfo.IME_ACTION_DONE)}},
                {"ime-go", 512L, "[]", new Object[] {open(), text("dad"), ime(EditorInfo.IME_ACTION_GO), save()}},
                {"ime-unspecified", 512L, "[]", new Object[] {open(), text("dad"), ime(EditorInfo.IME_ACTION_UNSPECIFIED), save()}},
                {"ime-newline-commit", 512L, "[]", new Object[] {open(), commit("line"), commit("\n"), commit("break"), save()}},
                {"ime-trailing-newline", 512L, "[]", new Object[] {open(), commit("dad"), commit("\n"), save()}},
                {"paste-newline", 512L, "[]", new Object[] {open(), text("line\nbreak"), save()}},
                {"paste-crlf-padded", 512L, "[]", new Object[] {open(), text(" dad\r\n"), save()}},
                {"hardware-numpad-enter-empty", 512L, "[\"papa\"]", new Object[] {open(), key("NUMPAD_ENTER")}},
        };
        try (final GoldenWriter w = GoldenWriter.open("answers/synonyms-dialog-device.json", "answers.synonymsDialogDevice",
                "views/SubjectInfoView.prepareAddSynonymButton/onSynonymEditorAction/addSynonym (real dialog in"
                        + " BrowseActivity's SubjectInfoFragment, SaveStudyMaterialJob)")) {
            runner.baseReset(1);
            final SupportSQLiteDatabase sql = WkApplication.getDatabase().getOpenHelper().getWritableDatabase();
            boolean editorInfoDone = false;
            for (final Object[] c: cases) {
                final String name = (String) c[0];
                final long id = (Long) c[1];
                final String column = (String) c[2];
                final Object[] ops = (Object[]) c[3];
                sql.execSQL("UPDATE subject SET meaningSynonyms = ?, meaningNote = ?, readingNote = ?, studyMaterialPatched = 0 WHERE id = ?",
                        new Object[] {column, "m", "r", id});
                final Map<String, Object> before = row(sql, id);
                final List<Object> steps = new ArrayList<>();
                final AtomicReference<Map<String, Object>> editorInfo = new AtomicReference<>();
                String shownAtStart;
                try (final ActivityScenario<BrowseActivity> scenario = ActivityScenario.launch(browse(id))) {
                    shownAtStart = waitForScreen();
                    for (final Object o: ops) {
                        @SuppressWarnings("unchecked") final Map<String, Object> op = (Map<String, Object>) o;
                        perform(op);
                        instrumentation.waitForIdleSync();
                        Thread.sleep(300);
                        instrumentation.waitForIdleSync();
                        if (!editorInfoDone && op.containsKey("open")) {
                            instrumentation.runOnMainSync(() -> {
                                final EditText f = dialogField();
                                if (f != null) {
                                    final EditorInfo ei = new EditorInfo();
                                    f.onCreateInputConnection(ei);
                                    editorInfo.set(obj("inputType", ei.inputType, "imeOptions", ei.imeOptions,
                                            "singleLine", f.getMaxLines() == 1));
                                }
                            });
                        }
                        steps.add(obj("op", op, "after", state()));
                    }
                    if (editorInfo.get() != null) {
                        w.add("field/editorInfo", obj(), editorInfo.get());
                        editorInfoDone = true;
                    }
                }
                final long deadline = System.currentTimeMillis() + 5000;
                boolean saved = false;
                while (System.currentTimeMillis() < deadline) {
                    if (Long.valueOf(1).equals(((Map<?, ?>) row(sql, id).get("studyMaterialPatched")).get("value"))) {
                        saved = true;
                        break;
                    }
                    Thread.sleep(100);
                }
                final Map<String, Object> stored = row(sql, id);
                final Subject s = WkApplication.getDatabase().subjectDao().getById(id);
                String shownReopened;
                try (final ActivityScenario<BrowseActivity> scenario = ActivityScenario.launch(browse(id))) {
                    shownReopened = waitForScreen();
                }
                w.add("dialog/" + name, obj("subject", id, "before", before, "ops", Arrays.asList(ops)),
                        obj("shownAtStart", shownAtStart, "steps", steps, "saved", saved, "stored", stored,
                                "storedSynonyms", new ArrayList<>(s.getMeaningSynonyms()), "shownReopened", shownReopened));
            }
        }
        runner.baseReset(1);
    }

    private static Intent browse(final long id) {
        return new Intent(context, BrowseActivity.class).putExtra("id", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    // --- views ---------------------------------------------------------------------------------------

    private static @Nullable View infoRoot() {
        for (final View v: WindowInspector.getGlobalWindowViews()) {
            if (v.isAttachedToWindow() && v.findViewById(R.id.addSynonymButton) != null) {
                return v;
            }
        }
        return null;
    }

    private static @Nullable View dialogRoot() {
        for (final View v: WindowInspector.getGlobalWindowViews()) {
            if (v.isAttachedToWindow() && v.isShown() && v.findViewById(android.R.id.button1) != null
                    && firstEditText(v) != null) {
                return v;
            }
        }
        return null;
    }

    private static @Nullable EditText firstEditText(final View v) {
        if (v instanceof EditText) {
            return (EditText) v;
        }
        if (v instanceof ViewGroup) {
            final ViewGroup g = (ViewGroup) v;
            for (int i = 0; i < g.getChildCount(); i++) {
                final @Nullable EditText e = firstEditText(g.getChildAt(i));
                if (e != null) {
                    return e;
                }
            }
        }
        return null;
    }

    private static @Nullable EditText dialogField() {
        final @Nullable View root = dialogRoot();
        return root == null ? null : firstEditText(root);
    }

    private static String shown() {
        final @Nullable View root = infoRoot();
        if (root == null) {
            return null;
        }
        final TextView t = (TextView) root.findViewById(R.id.synonyms);
        return t == null ? null : t.getText().toString();
    }

    /** Waits for the info screen and its "+" button, returns the synonyms line. */
    private static String waitForScreen() throws Exception {
        final long deadline = System.currentTimeMillis() + 20_000;
        while (true) {
            final AtomicReference<String> out = new AtomicReference<>();
            final boolean[] ready = {false};
            instrumentation.runOnMainSync(() -> {
                final @Nullable View root = infoRoot();
                if (root != null) {
                    final View b = root.findViewById(R.id.addSynonymButton);
                    ready[0] = b.isShown() && root.hasWindowFocus();
                    out.set(shown());
                }
            });
            if (ready[0]) {
                return out.get();
            }
            assertTrue("info screen did not get ready", System.currentTimeMillis() < deadline);
            Thread.sleep(100);
        }
    }

    private static Map<String, Object> state() {
        final AtomicReference<Map<String, Object>> out = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            final @Nullable EditText f = dialogField();
            out.set(obj("dialogShowing", f != null, "field", f == null ? null : f.getText().toString(), "shown", shown()));
        });
        return out.get();
    }

    // --- ops -----------------------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private static void perform(final Map<String, Object> op) throws Exception {
        if (op.containsKey("open")) {
            instrumentation.runOnMainSync(() -> infoRoot().findViewById(R.id.addSynonymButton).performClick());
            final long deadline = System.currentTimeMillis() + 10_000;
            while (true) {
                final boolean[] ok = {false};
                instrumentation.runOnMainSync(() -> {
                    final @Nullable View root = dialogRoot();
                    ok[0] = root != null && root.hasWindowFocus();
                });
                if (ok[0]) {
                    return;
                }
                assertTrue("dialog did not open", System.currentTimeMillis() < deadline);
                Thread.sleep(100);
            }
        }
        if (op.containsKey("setText")) {
            instrumentation.runOnMainSync(() -> {
                final EditText f = dialogField();
                f.setText((String) op.get("setText"));
                f.setSelection(f.length());
            });
            return;
        }
        if (op.containsKey("keys")) {
            final KeyEvent[] events = KCM.getEvents(((String) op.get("keys")).toCharArray());
            for (final KeyEvent e: events) {
                instrumentation.sendKeySync(KeyEvent.changeTimeRepeat(e, SystemClock.uptimeMillis(), 0));
            }
            return;
        }
        if (op.containsKey("key")) {
            final int code = KeyEvent.class.getField("KEYCODE_" + op.get("key")).getInt(null);
            int meta = 0;
            final List<Integer> metaCodes = new ArrayList<>();
            for (final Object m: (List<Object>) op.get("meta")) {
                if ("shift".equals(m)) {
                    meta |= KeyEvent.META_SHIFT_ON | KeyEvent.META_SHIFT_LEFT_ON;
                    metaCodes.add(KeyEvent.KEYCODE_SHIFT_LEFT);
                }
                else if ("ctrl".equals(m)) {
                    meta |= KeyEvent.META_CTRL_ON | KeyEvent.META_CTRL_LEFT_ON;
                    metaCodes.add(KeyEvent.KEYCODE_CTRL_LEFT);
                }
                else {
                    meta |= KeyEvent.META_ALT_ON | KeyEvent.META_ALT_LEFT_ON;
                    metaCodes.add(KeyEvent.KEYCODE_ALT_LEFT);
                }
            }
            final long t = SystemClock.uptimeMillis();
            for (final int mc: metaCodes) {
                instrumentation.sendKeySync(event(t, KeyEvent.ACTION_DOWN, mc, meta));
            }
            instrumentation.sendKeySync(event(t, KeyEvent.ACTION_DOWN, code, meta));
            instrumentation.sendKeySync(event(t, KeyEvent.ACTION_UP, code, meta));
            for (final int mc: metaCodes) {
                instrumentation.sendKeySync(event(t, KeyEvent.ACTION_UP, mc, 0));
            }
            return;
        }
        if (op.containsKey("ime")) {
            instrumentation.runOnMainSync(() -> {
                final EditText f = dialogField();
                final InputConnection ic = f.onCreateInputConnection(new EditorInfo());
                if ("performEditorAction".equals(op.get("ime"))) {
                    ic.performEditorAction((Integer) op.get("actionId"));
                }
                else {
                    ic.commitText((String) op.get("text"), 1);
                }
            });
            return;
        }
        if (op.containsKey("button")) {
            final int id = "save".equals(op.get("button")) ? android.R.id.button1 : android.R.id.button2;
            instrumentation.runOnMainSync(() -> {
                final @Nullable View root = dialogRoot();
                if (root != null) {
                    root.findViewById(id).performClick();
                }
            });
            return;
        }
        throw new IllegalArgumentException("bad op " + op);
    }

    private static KeyEvent event(final long t, final int action, final int code, final int meta) {
        return new KeyEvent(t, SystemClock.uptimeMillis(), action, code, 0, meta, KeyCharacterMap.VIRTUAL_KEYBOARD, 0,
                KeyEvent.FLAG_FROM_SYSTEM, android.view.InputDevice.SOURCE_KEYBOARD);
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
