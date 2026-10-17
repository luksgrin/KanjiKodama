/*
 * KanjiKodama golden fixtures (Tier B): hardware keys and IME actions on the real answer field of a running session.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.SystemClock;
import android.preference.PreferenceManager;
import android.provider.Settings;
import android.view.InputDevice;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.widget.EditText;

import androidx.fragment.app.Fragment;
import androidx.test.core.app.ActivityScenario;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.smouldering_durtles.wk.R;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.activities.SessionActivity;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.local.LocalContent;
import com.smouldering_durtles.wk.local.LocalMode;
import com.smouldering_durtles.wk.model.Question;
import com.smouldering_durtles.wk.model.Session;
import com.smouldering_durtles.wk.util.ObjectSupport;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.atomic.AtomicReference;

import javax.annotation.Nullable;

/**
 * Writes {@code kana/keys-session.json}: the real {@code SessionActivity} with its real
 * {@code UnansweredSessionFragment}/{@code AnsweredSessionFragment}, fed by hardware key events that go through the
 * input pipeline ({@code Instrumentation.sendKeySync}: InputManager, ViewRootImpl) and by IME calls on the answer
 * field's InputConnection. This is the part {@code kana/fixup-keys.json} does not reach (it dispatches straight to a
 * copy of the field with a copy of {@code handleEditorAction}): the real fragment, focus moves between the field and
 * the buttons, the answered state, retries.
 *
 * <p>The session window gets {@code FLAG_ALT_FOCUSABLE_IM}, so no soft keyboard binds to the field and ViewRootImpl's
 * IME stage passes every key on. With Gboard bound, the IME sees each hardware key first; that was tried and is not
 * deterministic (in about 1 of 5 runs, a fast Enter after a retry verdict reached the field as an editor action plus a
 * lone Enter up, so focus moved to the Don't know button), so it is not part of the fixture. See the README.</p> RESETS THE APP'S PROGRESS (back up first, see web/test/golden/README.md).
 *
 * <p>Every case starts a fresh self-study session of kanji 一 (440: meaning "One", on'yomi いち, kun'yomi ひと), seed
 * 1, with these preferences (restored afterwards): {@code enable_lightning_mode} false, all {@code anki_mode*} false,
 * {@code self_study_order} null, haptics off, {@code delay_result_upload} false, {@code auto_download_audio} false,
 * {@code kanji_mode_onkun} false, {@code require_onyomi_in_katakana} false, {@code close_enough_action} null.</p>
 *
 * <p>Ops: {@code {"type": s}} key events for the ASCII characters of s (virtual keyboard map), where s may be
 * {@code "@answer"} (the correct answer for the current question: "one" or "ichi"), {@code "@wrong"} ("qqqq" or
 * "nunu"), {@code "@kun"} ("hito"); {@code {"key": name, "meta": [...], "repeat": n}} one key down (plus n
 * auto-repeat downs) and up; {@code {"keyDown": name}}, {@code {"keyUp": name}}; {@code {"ime":
 * "performEditorAction", "actionId": n}}, {@code {"ime": "sendKeyEvent", "key": name}} (down and up through the
 * InputConnection), {@code {"ime": "commitText", "text": t}}; {@code {"click": "submit" | "next" | "dontKnow"}}
 * (the fragment's button); {@code {"toReading": true}} answers a meaning question with "one" + Enter and clicks Next,
 * so the reading question is current; {@code {"toMeaning": true}} the same the other way round ("ichi").</p>
 *
 * <p>After each op: {@code fragment} (simple class name), {@code current} [id, questionType], {@code answered},
 * {@code correct}, {@code field} (answer field text), {@code fieldActive} (its "active" tag), {@code focus} (the
 * focused view's id name), {@code progress}. Whether the soft keyboard is visible is not recorded (it depends on
 * timing). {@code device/info} records the IME and the keyboard configuration the cases ran with.</p>
 */
@LargeTest
public final class KeysSessionGoldenTest {
    private static final long SUBJECT = 440L;
    private static final KeyCharacterMap KCM = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD);
    private static final Map<String, Object> PREFS = new LinkedHashMap<>();
    static {
        PREFS.put("enable_lightning_mode", false);
        for (final String t: new String[] {"lesson", "review", "self_study"}) {
            PREFS.put("anki_mode_" + t, false);
            PREFS.put("anki_mode_" + t + "_meaning", false);
            PREFS.put("anki_mode_" + t + "_reading", false);
        }
        PREFS.put("self_study_order", null);
        PREFS.put("enable_haptic_feedback_success", false);
        PREFS.put("enable_haptic_feedback_failure", false);
        PREFS.put("enable_advanced", false);
        PREFS.put("delay_result_upload", false);
        PREFS.put("auto_download_audio", false);
        PREFS.put("show_pitch_info", false);
        PREFS.put("kanji_mode_onkun", false);
        PREFS.put("require_onyomi_in_katakana", false);
        PREFS.put("close_enough_action", null);
        PREFS.put("shake_on_matching_kanji", null);
    }

    private static Context context;
    private static Context testContext;
    private static Instrumentation instrumentation;
    private static SessionActivity activity;

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

    private static Map<String, Object> type(final String s) {
        return obj("type", s);
    }

    private static Map<String, Object> key(final String name, final String... meta) {
        return obj("key", name, "meta", Arrays.asList(meta));
    }

    private static Map<String, Object> click(final String b) {
        return obj("click", b);
    }

    @Test
    public void keysSession() throws Exception {
        final Object[][] cases = {
                {"enter-correct", new Object[] {type("@answer"), key("ENTER")}},
                {"enter-wrong", new Object[] {type("@wrong"), key("ENTER")}},
                {"enter-empty", new Object[] {key("ENTER")}},
                {"enter-correct-then-enter-again", new Object[] {type("@answer"), key("ENTER"), key("ENTER"), key("ENTER")}},
                {"enter-correct-then-type", new Object[] {type("@answer"), key("ENTER"), type("abc")}},
                {"enter-wrong-then-next-then-type", new Object[] {type("@wrong"), key("ENTER"), click("next"), type("abc")}},
                {"enter-auto-repeat", new Object[] {type("@answer"), obj("key", "ENTER", "meta", Collections.emptyList(), "repeat", 3)}},
                {"enter-down-only", new Object[] {type("@answer"), obj("keyDown", "ENTER")}},
                {"enter-up-only", new Object[] {type("@answer"), obj("keyUp", "ENTER")}},
                {"shift-enter", new Object[] {type("@answer"), key("ENTER", "shift")}},
                {"ctrl-enter", new Object[] {type("@answer"), key("ENTER", "ctrl")}},
                {"alt-enter", new Object[] {type("@answer"), key("ENTER", "alt")}},
                {"numpad-enter", new Object[] {type("@answer"), key("NUMPAD_ENTER")}},
                {"dpad-center", new Object[] {type("@answer"), key("DPAD_CENTER")}},
                {"tab", new Object[] {type("@answer"), key("TAB")}},
                {"escape", new Object[] {type("@answer"), key("ESCAPE")}},
                {"del-and-retype", new Object[] {type("onx"), key("DEL"), type("e"), key("ENTER")}},
                {"capitals", new Object[] {type("ONE"), key("ENTER")}},
                {"reading-romaji-enter", new Object[] {obj("toReading", true), type("@answer"), key("ENTER")}},
                {"reading-trailing-n", new Object[] {obj("toReading", true), type("in"), key("ENTER")}},
                {"reading-kun-retry", new Object[] {obj("toReading", true), type("@kun"), key("ENTER"), key("ENTER")}},
                {"reading-kun-retry-then-fix", new Object[] {obj("toReading", true), type("@kun"), key("ENTER"),
                        key("DEL"), key("DEL"), type("ichi"), key("ENTER")}},
                {"reading-wrong-enter", new Object[] {obj("toReading", true), type("@wrong"), key("ENTER")}},
                {"ime-done", new Object[] {type("@answer"), obj("ime", "performEditorAction", "actionId", EditorInfo.IME_ACTION_DONE)}},
                {"ime-go", new Object[] {type("@answer"), obj("ime", "performEditorAction", "actionId", EditorInfo.IME_ACTION_GO)}},
                {"ime-unspecified", new Object[] {type("@answer"),
                        obj("ime", "performEditorAction", "actionId", EditorInfo.IME_ACTION_UNSPECIFIED)}},
                {"ime-send-enter", new Object[] {type("@answer"), obj("ime", "sendKeyEvent", "key", "ENTER")}},
                {"ime-commit-then-enter", new Object[] {obj("ime", "commitText", "text", "one"), key("ENTER")}},
                {"ime-commit-newline", new Object[] {obj("ime", "commitText", "text", "one"), obj("ime", "commitText", "text", "\n")}},
                {"ime-done-empty", new Object[] {obj("ime", "performEditorAction", "actionId", EditorInfo.IME_ACTION_DONE)}},
                {"submit-button", new Object[] {type("@answer"), click("submit")}},
                {"dont-know-then-enter", new Object[] {click("dontKnow"), key("ENTER")}},
                {"numpad-enter-twice", new Object[] {type("@answer"), key("NUMPAD_ENTER"), key("NUMPAD_ENTER")}},
                {"numpad-enter-then-type-enter", new Object[] {type("@answer"), key("NUMPAD_ENTER"), type("x"), key("ENTER")}},
                {"tab-then-enter", new Object[] {type("@answer"), key("TAB"), key("ENTER")}},
                {"escape-then-type-enter", new Object[] {type("@answer"), key("ESCAPE"), type("x"), key("ENTER")}},
                {"meaning-enter-correct", new Object[] {obj("toMeaning", true), type("@answer"), key("ENTER")}},
                {"meaning-capitals", new Object[] {obj("toMeaning", true), type("ONE"), key("ENTER")}},
                {"meaning-spaces", new Object[] {obj("toMeaning", true), type(" one "), key("ENTER")}},
                {"meaning-wrong", new Object[] {obj("toMeaning", true), type("@wrong"), key("ENTER"), key("ENTER")}},
        };
        final ScenarioRunner runner = new ScenarioRunner(context, testContext);
        final SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(context);
        final Map<String, Object> original = new LinkedHashMap<>();
        final Map<String, ?> all = prefs.getAll();
        for (final String k: PREFS.keySet()) {
            original.put(k, all.get(k));
        }
        try (final GoldenWriter w = GoldenWriter.open("kana/keys-session.json", "kana.keysSession",
                "activities/SessionActivity, fragments/UnansweredSessionFragment.handleEditorAction and"
                        + " AnsweredSessionFragment (real activity; keys via Instrumentation.sendKeySync)")) {
            runner.baseReset(1);
            setPrefs(prefs, PREFS);
            boolean infoDone = false;
            for (final Object[] c: cases) {
                final String name = (String) c[0];
                final Object[] ops = (Object[]) c[1];
                SessionDriver.baseReset(context);
                ObjectSupport.seedRandom(1);
                final List<Subject> subjects = WkApplication.getDatabase().subjectCollectionsDao().getByIds(
                        Collections.singletonList(SUBJECT));
                Session.getInstance().startNewSelfStudySession(subjects);
                final List<Object> steps = new ArrayList<>();
                final Map<String, Object> start;
                final Intent intent = new Intent(context, SessionActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try (final ActivityScenario<SessionActivity> scenario = ActivityScenario.launch(intent)) {
                    scenario.onActivity(a -> {
                        activity = a;
                        // No soft keyboard binds to the window (see the class javadoc: the IME stage is not deterministic).
                        a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
                    });
                    waitForField();
                    if (!infoDone) {
                        w.add("device/info", obj(), deviceInfo());
                        infoDone = true;
                    }
                    start = state();
                    for (final Object o: ops) {
                        @SuppressWarnings("unchecked") final Map<String, Object> op = (Map<String, Object>) o;
                        perform(op);
                        settle();
                        steps.add(obj("op", op, "after", state()));
                    }
                    Session.getInstance().finish();
                    settle();
                }
                activity = null;
                w.add("session/" + name, obj("subject", SUBJECT, "ops", Arrays.asList(ops)),
                        obj("start", start, "steps", steps));
            }
        }
        finally {
            setPrefs(prefs, original);
            SessionDriver.baseReset(context);
        }
        runner.baseReset(1);
    }

    private static void setPrefs(final SharedPreferences prefs, final Map<String, Object> values) {
        final SharedPreferences.Editor e = prefs.edit();
        for (final Map.Entry<String, Object> p: values.entrySet()) {
            final Object v = p.getValue();
            if (v == null) {
                e.remove(p.getKey());
            }
            else if (v instanceof Boolean) {
                e.putBoolean(p.getKey(), (Boolean) v);
            }
            else if (v instanceof Integer) {
                e.putInt(p.getKey(), (Integer) v);
            }
            else {
                e.putString(p.getKey(), v.toString());
            }
        }
        e.commit();
    }

    /** Waits until the shown fragment matches the session (answered: AnsweredSessionFragment, else the answer field). */
    private static void settle() throws Exception {
        instrumentation.waitForIdleSync();
        final long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            final boolean[] ok = {false};
            instrumentation.runOnMainSync(() -> {
                final Session s = Session.getInstance();
                final @Nullable Fragment f = fragment();
                if (!s.isActive() || f == null || f.getView() == null) {
                    ok[0] = true;
                    return;
                }
                final @Nullable View next = f.getView().findViewById(R.id.nextButton);
                final @Nullable EditText e = field();
                ok[0] = s.isAnswered() ? next != null && next.isShown() : next == null && e != null && e.isShown();
            });
            if (ok[0]) {
                break;
            }
            Thread.sleep(100);
        }
        Thread.sleep(500);
        instrumentation.waitForIdleSync();
    }

    // --- views ---------------------------------------------------------------------------------------

    private static @Nullable Fragment fragment() {
        return activity.getSupportFragmentManager().findFragmentById(R.id.fragment);
    }

    private static @Nullable EditText field() {
        final @Nullable Fragment f = fragment();
        if (f == null || f.getView() == null) {
            return null;
        }
        final @Nullable View v = f.getView().findViewById(R.id.questionEdit);
        return v instanceof EditText ? (EditText) v : null;
    }

    private static void waitForField() throws Exception {
        final long deadline = System.currentTimeMillis() + 20_000;
        while (true) {
            final boolean[] ok = {false};
            instrumentation.runOnMainSync(() -> {
                final @Nullable EditText f = field();
                ok[0] = f != null && f.isShown() && f.hasFocus() && Boolean.TRUE.equals(f.getTag()) && activity.hasWindowFocus();
            });
            if (ok[0]) {
                settle();
                return;
            }
            assertTrue("answer field did not get ready (screen locked?)", System.currentTimeMillis() < deadline);
            Thread.sleep(100);
        }
    }

    private static String idName(final @Nullable View v) {
        if (v == null) {
            return null;
        }
        if (v.getId() == View.NO_ID) {
            return v.getClass().getSimpleName();
        }
        try {
            return v.getResources().getResourceEntryName(v.getId());
        } catch (final Exception e) {
            return v.getClass().getSimpleName();
        }
    }

    private static Map<String, Object> state() {
        final AtomicReference<Map<String, Object>> out = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> {
            final Session s = Session.getInstance();
            final @Nullable Question q = s.getCurrentQuestion();
            final @Nullable Fragment f = fragment();
            final @Nullable EditText e = field();
            out.set(obj(
                    "fragment", f == null ? null : f.getClass().getSimpleName(),
                    "current", q == null ? null : Arrays.asList(q.getItem().getId(), q.getType().name()),
                    "answered", s.isAnswered(),
                    "correct", s.isCorrect(),
                    "field", e == null ? null : e.getText().toString(),
                    "fieldActive", e == null ? null : e.getTag(),
                    "focus", idName(activity.getCurrentFocus()),
                    "progress", s.getProgressText()));
        });
        return out.get();
    }

    private static Map<String, Object> deviceInfo() throws Exception {
        final AtomicReference<Map<String, Object>> out = new AtomicReference<>();
        final String ime = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.DEFAULT_INPUT_METHOD);
        instrumentation.runOnMainSync(() -> {
            final Configuration cfg = activity.getResources().getConfiguration();
            final EditText f = field();
            final EditorInfo ei = new EditorInfo();
            f.onCreateInputConnection(ei);
            out.set(obj("sdk", android.os.Build.VERSION.SDK_INT, "ime", ime,
                    "configKeyboard", cfg.keyboard, "hardKeyboardHidden", cfg.hardKeyboardHidden,
                    "fieldInputType", ei.inputType, "fieldImeOptions", ei.imeOptions, "fieldActionId", ei.actionId));
        });
        return out.get();
    }

    // --- ops -----------------------------------------------------------------------------------------

    private static String resolve(final String s) {
        if (!s.startsWith("@")) {
            return s;
        }
        final Question q = Session.getInstance().getCurrentQuestion();
        final boolean meaning = q.getType().isMeaning();
        switch (s) {
            case "@answer":
                return meaning ? "one" : "ichi";
            case "@wrong":
                return meaning ? "qqqq" : "nunu";
            case "@kun":
                return "hito";
            default:
                throw new IllegalArgumentException(s);
        }
    }

    private static KeyEvent event(final long down, final int action, final int code, final int repeat, final int meta) {
        return new KeyEvent(down, SystemClock.uptimeMillis(), action, code, repeat, meta, KeyCharacterMap.VIRTUAL_KEYBOARD, 0,
                0, InputDevice.SOURCE_KEYBOARD);
    }

    private static int code(final Object name) throws Exception {
        return KeyEvent.class.getField("KEYCODE_" + name).getInt(null);
    }

    private static void typeKeys(final String s) {
        for (final KeyEvent e: KCM.getEvents(s.toCharArray())) {
            instrumentation.sendKeySync(KeyEvent.changeTimeRepeat(e, SystemClock.uptimeMillis(), 0));
        }
    }

    private static void sendKey(final int code, final int meta, final List<Integer> metaCodes, final int repeat) {
        final long t = SystemClock.uptimeMillis();
        for (final int mc: metaCodes) {
            instrumentation.sendKeySync(event(t, KeyEvent.ACTION_DOWN, mc, 0, meta));
        }
        instrumentation.sendKeySync(event(t, KeyEvent.ACTION_DOWN, code, 0, meta));
        for (int i = 1; i <= repeat; i++) {
            instrumentation.sendKeySync(event(t, KeyEvent.ACTION_DOWN, code, i, meta | 0));
        }
        instrumentation.sendKeySync(event(t, KeyEvent.ACTION_UP, code, 0, meta));
        for (final int mc: metaCodes) {
            instrumentation.sendKeySync(event(t, KeyEvent.ACTION_UP, mc, 0, 0));
        }
    }

    private static void clickButton(final String b) {
        final int id = "submit".equals(b) ? R.id.submitButton : "next".equals(b) ? R.id.nextButton : R.id.dontKnowButton;
        instrumentation.runOnMainSync(() -> {
            final @Nullable View v = fragment().getView().findViewById(id);
            assertTrue("no " + b + " button on " + fragment().getClass().getSimpleName(), v != null);
            v.performClick();
        });
    }

    @SuppressWarnings("unchecked")
    private static void perform(final Map<String, Object> op) throws Exception {
        if (op.containsKey("type")) {
            typeKeys(resolve((String) op.get("type")));
            return;
        }
        if (op.containsKey("ime")) {
            final String what = (String) op.get("ime");
            final int keyCode = "sendKeyEvent".equals(what) ? code(op.get("key")) : 0;
            instrumentation.runOnMainSync(() -> {
                final InputConnection ic = field().onCreateInputConnection(new EditorInfo());
                if ("performEditorAction".equals(what)) {
                    ic.performEditorAction((Integer) op.get("actionId"));
                }
                else if ("sendKeyEvent".equals(what)) {
                    final long t = SystemClock.uptimeMillis();
                    ic.sendKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, keyCode, 0, 0, KeyCharacterMap.VIRTUAL_KEYBOARD, 0,
                            KeyEvent.FLAG_SOFT_KEYBOARD | KeyEvent.FLAG_KEEP_TOUCH_MODE));
                    ic.sendKeyEvent(new KeyEvent(t, SystemClock.uptimeMillis(), KeyEvent.ACTION_UP, keyCode, 0, 0,
                            KeyCharacterMap.VIRTUAL_KEYBOARD, 0, KeyEvent.FLAG_SOFT_KEYBOARD | KeyEvent.FLAG_KEEP_TOUCH_MODE));
                }
                else {
                    ic.commitText((String) op.get("text"), 1);
                }
            });
            return;
        }
        if (op.containsKey("key")) {
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
            sendKey(code(op.get("key")), meta, metaCodes, op.containsKey("repeat") ? (Integer) op.get("repeat") : 0);
            return;
        }
        if (op.containsKey("keyDown") || op.containsKey("keyUp")) {
            final boolean down = op.containsKey("keyDown");
            final long t = SystemClock.uptimeMillis();
            instrumentation.sendKeySync(event(t, down ? KeyEvent.ACTION_DOWN : KeyEvent.ACTION_UP,
                    code(down ? op.get("keyDown") : op.get("keyUp")), 0, 0));
            return;
        }
        if (op.containsKey("click")) {
            clickButton((String) op.get("click"));
            return;
        }
        if (op.containsKey("toReading") || op.containsKey("toMeaning")) {
            final boolean meaning = Session.getInstance().getCurrentQuestion().getType().isMeaning();
            if (meaning == op.containsKey("toReading")) {
                typeKeys(meaning ? "one" : "ichi");
                sendKey(KeyEvent.KEYCODE_ENTER, 0, Collections.emptyList(), 0);
                settle();
                clickButton("next");
                settle();
                waitForField();
            }
            return;
        }
        throw new IllegalArgumentException("bad op " + op);
    }
}
