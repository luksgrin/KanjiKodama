package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static com.smouldering_durtles.wk.util.ObjectSupport.safe;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.SystemClock;
import android.text.Editable;
import android.text.InputType;
import android.text.Selection;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextWatcher;
import android.view.InputDevice;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.test.core.app.ActivityScenario;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.smouldering_durtles.wk.activities.KeyboardHelpActivity;
import com.smouldering_durtles.wk.local.LocalMode;
import com.smouldering_durtles.wk.util.PseudoIme;

import org.junit.Test;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Golden cases for the answer field fed by a hardware (physical or Bluetooth) keyboard and by the real
 * clipboard, instead of a soft keyboard's InputConnection. Writes {@code kana/fixup-keys.json}.
 *
 * <p>Setup: a real {@link EditText} with the fragment's input type
 * ({@code TYPE_CLASS_TEXT | TYPE_TEXT_FLAG_NO_SUGGESTIONS}), ime options
 * ({@code IME_ACTION_UNSPECIFIED | IME_FLAG_NO_FULLSCREEN}) and {@code setSingleLine()}, with a copy of
 * the fragment's TextWatcher (as in {@link FixupEditTextGoldenTest}) and a copy of
 * {@code UnansweredSessionFragment.handleEditorAction} as its {@code OnEditorActionListener} (keep both in
 * sync). The listener's fragment state is fixed to: field active, interaction enabled, session not
 * answered; a submit is recorded (the field text at that moment) instead of calling
 * {@code Session.submit}, and the field stays active (as after a retry verdict). The field is attached
 * (laid out, so cursor movement and the select-all/cut/copy checks work) and focused (TextView's
 * context-menu cut/copy/paste ignore the selection of an unfocused field) in a window of
 * {@code KeyboardHelpActivity} that has window focus (Android only lets the focused app read the
 * clipboard). The window has {@code FLAG_ALT_FOCUSABLE_IM}, so no soft keyboard binds to the field, and
 * every clip carries SystemUI's emulator extra that suppresses the clipboard overlay (it would take
 * window focus).</p>
 *
 * <p>Key events are dispatched the way {@code ViewRootImpl} does after the IME stage:
 * {@code view.dispatchKeyEvent(e)}, and if that is not handled and the event is a first ctrl+key down,
 * {@code view.dispatchKeyShortcutEvent(e)} (this is how ctrl+V/X/C/A/Z reach the TextView). Events come
 * from the virtual full keyboard ({@code KeyCharacterMap.VIRTUAL_KEYBOARD}, so the TextView uses
 * {@code QwertyKeyListener}); letters come from {@link KeyCharacterMap#getEvents} (a capital is
 * shift down, letter down/up with shift meta, shift up).</p>
 *
 * <p>Ops (the case input {@code ops}):
 * <ul>
 *   <li>{@code {"type": s}} key events for the characters of s ({@code "capsLock": true} adds
 *   {@code META_CAPS_LOCK_ON} to every event);</li>
 *   <li>{@code {"key": name, "meta": [shift|ctrl|alt], "times": n}} modifier downs, n x (down, up),
 *   modifier ups; {@code "repeat": n} instead sends one down plus n auto-repeat downs, then one up;
 *   name is a {@code KeyEvent.KEYCODE_} suffix (DEL, FORWARD_DEL, DPAD_LEFT, MOVE_HOME, ENTER, ...);</li>
 *   <li>{@code {"keyDown": name}}, {@code {"keyUp": name}} a single event;</li>
 *   <li>{@code {"multiple": s}} one {@code ACTION_MULTIPLE} event carrying s (KEYCODE_UNKNOWN);</li>
 *   <li>{@code {"select": [a, b]}} {@code Selection.setSelection} (as a touch selection would);</li>
 *   <li>{@code {"clip": {"text": t} | {"html": h, "text": t} | {"items": [t, ...]}}} sets the primary clip
 *   ({@code ClipboardManager.setPrimaryClip});</li>
 *   <li>{@code {"menu": paste|pasteAsPlainText|cut|copy|selectAll|undo|redo}}
 *   {@code onTextContextMenuItem(android.R.id.<menu>)};</li>
 *   <li>{@code {"ime": "performEditorAction", "actionId": n}} and {@code {"ime": "commitText", "text": t}}
 *   through the field's InputConnection, for comparison with the keys.</li>
 * </ul>
 *
 * <p>Each step records {@code value}, {@code selStart}, {@code selEnd}, {@code fixupCalls}, {@code maxDepth},
 * the editor-action listener calls ({@code actions}: actionId, event action, keyCode, returned),
 * {@code submits} (the text passed to submit), {@code handled} (dispatch results per key event, if any)
 * and {@code clip} (the clipboard text after cut/copy). Each case also replays its ops through an
 * InputConnection on a second field ({@code inputConnection}): typed characters as one
 * {@code commitText} per character (SPACE as {@code commitText(" ")}), DEL/FORWARD_DEL as {@code deleteSurroundingText(1, 0)}/(0, 1) or
 * {@code commitText("")} over a selection, paste/ctrl+V as {@code commitText(clip text)}, cut/ctrl+X as
 * {@code commitText("")}, cursor and selection changes copied from the key field; ops with no
 * equivalent (undo, word delete, ...) end the replay ({@code inputConnectionStoppedAt}).
 * {@code firstDiffFromInputConnection} is the first step whose value or selection differs.</p>
 */
@LargeTest
public final class FixupKeysGoldenTest {
    private static Context context;
    private static ActivityScenario<KeyboardHelpActivity> scenario;
    private static Activity activity;
    private static FrameLayout host;
    private static ClipboardManager clipboard;
    private static final KeyCharacterMap KCM = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD);

    /**
     * Not a {@code @BeforeClass}: the test runner finishes all activities when a test starts.
     */
    private static void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        GoldenWriter.setBaseDir(new File(context.getExternalFilesDir(null), "golden"));
        assertTrue("The app must be in local mode", LocalMode.isEnabled());
        scenario = ActivityScenario.launch(KeyboardHelpActivity.class);
        scenario.onActivity(a -> {
            activity = a;
            host = new FrameLayout(a);
            // Keep the soft keyboard out: the window's views do not talk to the IME.
            a.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM);
            a.addContentView(host, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT));
            clipboard = (ClipboardManager) a.getSystemService(Context.CLIPBOARD_SERVICE);
        });
        final long deadline = SystemClock.uptimeMillis() + 15000;
        final AtomicBoolean focused = new AtomicBoolean(false);
        while (SystemClock.uptimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> focused.set(activity.hasWindowFocus()));
            if (focused.get()) {
                break;
            }
            Thread.sleep(200);
        }
        assertTrue("KeyboardHelpActivity has no window focus (screen locked?)", focused.get());
        final String[] probe = new String[1];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            clipboard.setPrimaryClip(quiet(ClipData.newPlainText("golden", "probe")));
            final ClipData c = clipboard.getPrimaryClip();
            probe[0] = c == null ? null : String.valueOf(c.getItemAt(0).getText());
        });
        assertEquals("the clipboard cannot be read", "probe", probe[0]);
    }

    private static void tearDown() {
        if (clipboard != null) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> clipboard.clearPrimaryClip());
        }
        if (scenario != null) {
            scenario.close();
        }
    }

    /** Copy of the app's watcher (see FixupEditTextGoldenTest), plus counters. */
    private static final class AppWatcher implements TextWatcher {
        private SpannableString spannable = new SpannableString("");
        int calls = 0;
        int depth = 0;
        int maxDepth = 0;
        final List<String> errors = new ArrayList<>();

        @Override
        public void beforeTextChanged(final CharSequence s, final int start, final int count, final int after) {
            //
        }

        @Override
        public void onTextChanged(final CharSequence s, final int start, final int before, final int count) {
            safe(() -> {
                spannable = new SpannableString(s);
                spannable.setSpan(this, start, start + count, Spanned.SPAN_COMPOSING);
            });
        }

        @Override
        public void afterTextChanged(final Editable s) {
            safe(() -> {
                final int beginIndex = spannable.getSpanStart(this);
                final int endIndex = spannable.getSpanEnd(this);
                spannable.removeSpan(this);
                calls++;
                depth++;
                maxDepth = Math.max(maxDepth, depth);
                try {
                    PseudoIme.fixup(s, beginIndex, endIndex);
                }
                catch (final RuntimeException e) {
                    errors.add(e.getClass().getName() + ": " + e.getMessage());
                    throw e;
                }
                finally {
                    depth--;
                }
            });
        }
    }

    /**
     * Copy of {@code UnansweredSessionFragment.handleEditorAction} (with {@code safe(false, ...)} around it),
     * fragment state fixed: active, interactionEnabled, not answered. Records calls and submits.
     */
    private static final class AppEditorAction implements TextView.OnEditorActionListener {
        final List<Map<String, Object>> calls = new ArrayList<>();
        final List<String> submits = new ArrayList<>();

        @Override
        public boolean onEditorAction(final TextView v, final int actionId, final KeyEvent event) {
            final Map<String, Object> call = obj(
                    "actionId", actionId,
                    "event", event == null ? null : event.getAction() == KeyEvent.ACTION_DOWN ? "down"
                            : event.getAction() == KeyEvent.ACTION_UP ? "up" : "other",
                    "keyCode", event == null ? null : KeyEvent.keyCodeToString(event.getKeyCode()));
            final boolean result = safe(false, () -> handle(v, actionId, event));
            call.put("returned", result);
            calls.add(call);
            return result;
        }

        private boolean handle(final TextView v, final int actionId, final KeyEvent event) {
            boolean ok = event == null && actionId != 0;
            if (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN) {
                ok = true;
            }
            if (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_UP) {
                return true;
            }
            if (ok) {
                submits.add(v.getText().toString());
                return true;
            }
            return false;
        }
    }

    private static final class Field {
        final EditText edit;
        final AppWatcher watcher = new AppWatcher();
        final AppEditorAction action = new AppEditorAction();
        final InputConnection conn;
        final EditorInfo info = new EditorInfo();

        Field(final boolean attach) {
            edit = new EditText(activity);
            edit.setImeOptions(EditorInfo.IME_ACTION_UNSPECIFIED | EditorInfo.IME_FLAG_NO_FULLSCREEN);
            edit.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
            edit.setSingleLine();
            edit.setText("");
            edit.addTextChangedListener(watcher);
            edit.setOnEditorActionListener(action);
            edit.setLayoutParams(new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT));
            if (attach) {
                host.removeAllViews();
                host.addView(edit);
                edit.requestFocus();
            }
            final int width = host.getWidth() > 0 ? host.getWidth() : 1080;
            edit.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
            edit.layout(0, 0, width, edit.getMeasuredHeight());
            conn = edit.onCreateInputConnection(info);
        }

        void resetCounters() {
            watcher.calls = 0;
            watcher.maxDepth = 0;
            watcher.errors.clear();
            action.calls.clear();
            action.submits.clear();
        }

        Map<String, Object> snapshot() {
            final Editable t = edit.getText();
            final Map<String, Object> step = obj(
                    "value", t.toString(),
                    "selStart", Selection.getSelectionStart(t),
                    "selEnd", Selection.getSelectionEnd(t),
                    "fixupCalls", watcher.calls,
                    "maxDepth", watcher.maxDepth);
            if (!watcher.errors.isEmpty()) {
                step.put("errors", new ArrayList<>(watcher.errors));
            }
            return step;
        }
    }

    private static int metaFor(final String m) {
        switch (m) {
            case "shift": return KeyEvent.META_SHIFT_ON | KeyEvent.META_SHIFT_LEFT_ON;
            case "ctrl": return KeyEvent.META_CTRL_ON | KeyEvent.META_CTRL_LEFT_ON;
            case "alt": return KeyEvent.META_ALT_ON | KeyEvent.META_ALT_LEFT_ON;
            default: throw new IllegalArgumentException(m);
        }
    }

    private static int keyFor(final String m) {
        switch (m) {
            case "shift": return KeyEvent.KEYCODE_SHIFT_LEFT;
            case "ctrl": return KeyEvent.KEYCODE_CTRL_LEFT;
            case "alt": return KeyEvent.KEYCODE_ALT_LEFT;
            default: throw new IllegalArgumentException(m);
        }
    }

    private static int code(final String name) {
        final int c = KeyEvent.keyCodeFromString("KEYCODE_" + name);
        if (c == KeyEvent.KEYCODE_UNKNOWN) {
            throw new IllegalArgumentException(name);
        }
        return c;
    }

    private static KeyEvent ev(final int action, final int code, final int repeat, final int meta) {
        final long t = SystemClock.uptimeMillis();
        return new KeyEvent(t, t, action, code, repeat, meta, KeyCharacterMap.VIRTUAL_KEYBOARD, 0, 0,
                InputDevice.SOURCE_KEYBOARD);
    }

    @SuppressWarnings("unchecked")
    private static List<KeyEvent> events(final Map<String, Object> op) {
        final List<KeyEvent> events = new ArrayList<>();
        if (op.containsKey("type")) {
            final KeyEvent[] es = KCM.getEvents(((String) op.get("type")).toCharArray());
            if (es == null) {
                throw new IllegalArgumentException("no key events for " + op);
            }
            final boolean caps = Boolean.TRUE.equals(op.get("capsLock"));
            for (final KeyEvent e: es) {
                events.add(caps ? new KeyEvent(e.getDownTime(), e.getEventTime(), e.getAction(), e.getKeyCode(),
                        e.getRepeatCount(), e.getMetaState() | KeyEvent.META_CAPS_LOCK_ON, e.getDeviceId(),
                        e.getScanCode(), e.getFlags(), e.getSource()) : e);
            }
        }
        else if (op.containsKey("key")) {
            final int c = code((String) op.get("key"));
            final List<String> mods = op.containsKey("meta") ? (List<String>) op.get("meta") : new ArrayList<>();
            int meta = 0;
            for (final String m: mods) {
                meta |= metaFor(m);
                events.add(ev(KeyEvent.ACTION_DOWN, keyFor(m), 0, meta));
            }
            if (op.containsKey("repeat")) {
                final int n = (Integer) op.get("repeat");
                for (int r = 0; r <= n; r++) {
                    events.add(ev(KeyEvent.ACTION_DOWN, c, r, meta));
                }
                events.add(ev(KeyEvent.ACTION_UP, c, 0, meta));
            }
            else {
                final int times = op.containsKey("times") ? (Integer) op.get("times") : 1;
                for (int r = 0; r < times; r++) {
                    events.add(ev(KeyEvent.ACTION_DOWN, c, 0, meta));
                    events.add(ev(KeyEvent.ACTION_UP, c, 0, meta));
                }
            }
            for (int i = mods.size() - 1; i >= 0; i--) {
                meta &= ~metaFor(mods.get(i));
                events.add(ev(KeyEvent.ACTION_UP, keyFor(mods.get(i)), 0, meta));
            }
        }
        else if (op.containsKey("keyDown")) {
            events.add(ev(KeyEvent.ACTION_DOWN, code((String) op.get("keyDown")), 0, 0));
        }
        else if (op.containsKey("keyUp")) {
            events.add(ev(KeyEvent.ACTION_UP, code((String) op.get("keyUp")), 0, 0));
        }
        else if (op.containsKey("multiple")) {
            events.add(new KeyEvent(SystemClock.uptimeMillis(), (String) op.get("multiple"),
                    KeyCharacterMap.VIRTUAL_KEYBOARD, 0));
        }
        return events;
    }

    /** As ViewRootImpl's ViewPostImeInputStage: dispatchKeyEvent, then the ctrl shortcut fallback. */
    private static boolean dispatch(final View view, final KeyEvent e) {
        if (view.dispatchKeyEvent(e)) {
            return true;
        }
        if (e.getAction() == KeyEvent.ACTION_DOWN && e.isCtrlPressed() && e.getRepeatCount() == 0
                && !KeyEvent.isModifierKey(e.getKeyCode())) {
            return view.dispatchKeyShortcutEvent(e);
        }
        return false;
    }

    private static int menuId(final String name) {
        switch (name) {
            case "paste": return android.R.id.paste;
            case "pasteAsPlainText": return android.R.id.pasteAsPlainText;
            case "cut": return android.R.id.cut;
            case "copy": return android.R.id.copy;
            case "selectAll": return android.R.id.selectAll;
            case "undo": return android.R.id.undo;
            case "redo": return android.R.id.redo;
            default: throw new IllegalArgumentException(name);
        }
    }

    /**
     * Marks a clip so that SystemUI on an emulator shows no clipboard overlay for it; the overlay takes
     * window focus, after which Android denies this app clipboard reads.
     */
    private static ClipData quiet(final ClipData clip) {
        final android.os.PersistableBundle extras = new android.os.PersistableBundle();
        extras.putBoolean("com.android.systemui.SUPPRESS_CLIPBOARD_OVERLAY", true);
        clip.getDescription().setExtras(extras);
        return clip;
    }

    @SuppressWarnings("unchecked")
    private static ClipData clipFor(final Map<String, Object> c) {
        if (c.containsKey("items")) {
            final List<String> items = (List<String>) c.get("items");
            final ClipData clip = ClipData.newPlainText("golden", items.get(0));
            for (int i = 1; i < items.size(); i++) {
                clip.addItem(new ClipData.Item(items.get(i)));
            }
            return clip;
        }
        if (c.containsKey("html")) {
            return ClipData.newHtmlText("golden", (String) c.get("text"), (String) c.get("html"));
        }
        return ClipData.newPlainText("golden", (String) c.get("text"));
    }

    private static String clipText() {
        final ClipData c = clipboard.getPrimaryClip();
        if (c == null) {
            return null;
        }
        final StringBuilder sb = new StringBuilder();
        for (int i = 0; i < c.getItemCount(); i++) {
            if (i > 0) {
                sb.append('\n');
            }
            sb.append(c.getItemAt(i).coerceToText(context));
        }
        return sb.toString();
    }

    private static boolean ctrl(final Map<String, Object> op, final String key) {
        @SuppressWarnings("unchecked") final List<String> mods = (List<String>) op.get("meta");
        return key.equals(op.get("key")) && mods != null && mods.contains("ctrl");
    }

    private static boolean noMeta(final Map<String, Object> op) {
        return !op.containsKey("meta");
    }

    private static final class CaseResult {
        final List<Map<String, Object>> keys = new ArrayList<>();
        final List<Map<String, Object>> ic = new ArrayList<>();
        Integer icStoppedAt = null;
        Integer firstDiff = null;
    }

    @SuppressWarnings("unchecked")
    private static CaseResult run(final List<Map<String, Object>> ops) {
        final CaseResult r = new CaseResult();
        final Field f = new Field(true);
        final Field g = new Field(false);
        boolean icLive = true;
        for (int i = 0; i < ops.size(); i++) {
            final Map<String, Object> op = ops.get(i);
            f.resetCounters();
            final String clipBefore = clipText();
            List<Boolean> handled = null;
            Object menuResult = null;
            if (op.containsKey("select")) {
                final List<Integer> s = (List<Integer>) op.get("select");
                final int len = f.edit.getText().length();
                Selection.setSelection(f.edit.getText(), Math.min(s.get(0), len), Math.min(s.get(1), len));
            }
            else if (op.containsKey("clip")) {
                clipboard.setPrimaryClip(quiet(clipFor((Map<String, Object>) op.get("clip"))));
                if (clipboard.getPrimaryClip() == null) {
                    throw new IllegalStateException("clipboard access denied (window focus lost?)");
                }
            }
            else if (op.containsKey("menu")) {
                menuResult = f.edit.onTextContextMenuItem(menuId((String) op.get("menu")));
            }
            else if (op.containsKey("ime")) {
                if ("performEditorAction".equals(op.get("ime"))) {
                    menuResult = f.conn.performEditorAction((Integer) op.get("actionId"));
                }
                else if ("commitText".equals(op.get("ime"))) {
                    menuResult = f.conn.commitText((String) op.get("text"), 1);
                }
                else {
                    throw new IllegalArgumentException(op.toString());
                }
            }
            else {
                final List<KeyEvent> events = events(op);
                if (events.isEmpty()) {
                    throw new IllegalArgumentException("unknown op " + op);
                }
                handled = new ArrayList<>();
                for (final KeyEvent e: events) {
                    handled.add(dispatch(f.edit, e));
                }
            }
            final Map<String, Object> step = f.snapshot();
            if (handled != null) {
                step.put("handled", handled);
            }
            if (menuResult != null) {
                step.put("returned", menuResult);
            }
            if (!f.action.calls.isEmpty()) {
                step.put("actions", new ArrayList<>(f.action.calls));
            }
            if (!f.action.submits.isEmpty()) {
                step.put("submits", new ArrayList<>(f.action.submits));
            }
            final String clipAfter = clipText();
            if (clipAfter != null && !clipAfter.equals(clipBefore) && !op.containsKey("clip")) {
                step.put("clip", clipAfter);
            }
            r.keys.add(step);

            // The InputConnection replay of the same op on the second field.
            if (icLive) {
                g.resetCounters();
                final Editable gt = g.edit.getText();
                final int gs = Math.max(0, Selection.getSelectionStart(gt));
                final int ge = Math.max(0, Selection.getSelectionEnd(gt));
                final boolean gSel = gs != ge;
                final boolean selectionOnly = op.containsKey("select") || op.containsKey("keyDown")
                        || op.containsKey("keyUp") || op.containsKey("clip")
                        || (op.containsKey("key") && Arrays.asList("DPAD_LEFT", "DPAD_RIGHT", "DPAD_UP",
                        "DPAD_DOWN", "MOVE_HOME", "MOVE_END", "ENTER", "NUMPAD_ENTER", "DPAD_CENTER", "SHIFT_LEFT",
                        "CTRL_LEFT", "ALT_LEFT", "TAB").contains(op.get("key")))
                        || ctrl(op, "A") || ctrl(op, "C") || "selectAll".equals(op.get("menu"))
                        || "copy".equals(op.get("menu"));
                boolean ok = true;
                if (op.containsKey("type")) {
                    final String s = (String) op.get("type");
                    final boolean caps = Boolean.TRUE.equals(op.get("capsLock"));
                    for (int k = 0; k < s.length(); k++) {
                        final String ch = s.substring(k, k + 1);
                        g.conn.commitText(caps ? ch.toUpperCase(java.util.Locale.ROOT) : ch, 1);
                    }
                }
                else if (op.containsKey("multiple")) {
                    g.conn.commitText((String) op.get("multiple"), 1);
                }
                else if ("SPACE".equals(op.get("key")) && noMeta(op) && !op.containsKey("repeat")) {
                    final int times = op.containsKey("times") ? (Integer) op.get("times") : 1;
                    for (int k = 0; k < times; k++) {
                        g.conn.commitText(" ", 1);
                    }
                }
                else if ("performEditorAction".equals(op.get("ime"))) {
                    g.conn.performEditorAction((Integer) op.get("actionId"));
                }
                else if ("commitText".equals(op.get("ime"))) {
                    g.conn.commitText((String) op.get("text"), 1);
                }
                else if (op.containsKey("key") && noMeta(op) && ("DEL".equals(op.get("key"))
                        || "FORWARD_DEL".equals(op.get("key")))) {
                    final boolean back = "DEL".equals(op.get("key"));
                    final int times = op.containsKey("repeat") ? (Integer) op.get("repeat") + 1
                            : op.containsKey("times") ? (Integer) op.get("times") : 1;
                    for (int k = 0; k < times; k++) {
                        final Editable t = g.edit.getText();
                        if (Selection.getSelectionStart(t) != Selection.getSelectionEnd(t)) {
                            g.conn.commitText("", 1);
                        }
                        else if (back) {
                            g.conn.deleteSurroundingText(1, 0);
                        }
                        else {
                            g.conn.deleteSurroundingText(0, 1);
                        }
                    }
                }
                else if ("paste".equals(op.get("menu")) || "pasteAsPlainText".equals(op.get("menu")) || ctrl(op, "V")) {
                    final String c = clipBefore == null ? "" : clipBefore;
                    g.conn.commitText(c, 1);
                }
                else if ("cut".equals(op.get("menu")) || ctrl(op, "X")) {
                    if (gSel) {
                        g.conn.commitText("", 1);
                    }
                }
                else if (!selectionOnly) {
                    ok = false;
                }
                if (ok && selectionOnly) {
                    final Editable t = g.edit.getText();
                    final int len = t.length();
                    g.conn.setSelection(Math.min((Integer) step.get("selStart"), len),
                            Math.min((Integer) step.get("selEnd"), len));
                }
                if (ok) {
                    r.ic.add(g.snapshot());
                }
                else {
                    icLive = false;
                    r.icStoppedAt = i;
                }
            }
            if (r.firstDiff == null && i < r.ic.size()) {
                final Map<String, Object> a = r.keys.get(i);
                final Map<String, Object> b = r.ic.get(i);
                if (!a.get("value").equals(b.get("value")) || !a.get("selStart").equals(b.get("selStart"))
                        || !a.get("selEnd").equals(b.get("selEnd"))) {
                    r.firstDiff = i;
                }
            }
        }
        return r;
    }

    // ---- case builders

    private static Map<String, Object> type(final String s) {
        return obj("type", s);
    }

    private static Map<String, Object> key(final String name, final String... meta) {
        final Map<String, Object> m = obj("key", name);
        if (meta.length > 0) {
            m.put("meta", new ArrayList<>(Arrays.asList(meta)));
        }
        return m;
    }

    private static Map<String, Object> keyTimes(final String name, final int times) {
        return obj("key", name, "times", times);
    }

    private static Map<String, Object> clip(final String text) {
        return obj("clip", obj("text", text));
    }

    private static Map<String, Object> menu(final String name) {
        return obj("menu", name);
    }

    private static Map<String, Object> select(final int a, final int b) {
        return obj("select", new ArrayList<>(Arrays.asList(a, b)));
    }

    private static List<Map<String, Object>> keys(final String typed) {
        final List<Map<String, Object>> ops = new ArrayList<>();
        for (int i = 0; i < typed.length(); i++) {
            ops.add(type(typed.substring(i, i + 1)));
        }
        return ops;
    }

    /** Cursor to index i with keys: MOVE_HOME, then DPAD_RIGHT i times. */
    private static List<Map<String, Object>> cursorTo(final int i) {
        final List<Map<String, Object>> ops = new ArrayList<>();
        ops.add(key("MOVE_HOME"));
        if (i > 0) {
            ops.add(keyTimes("DPAD_RIGHT", i));
        }
        return ops;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> seq(final Object... parts) {
        final List<Map<String, Object>> all = new ArrayList<>();
        for (final Object p: parts) {
            if (p instanceof List) {
                all.addAll((List<Map<String, Object>>) p);
            }
            else {
                all.add((Map<String, Object>) p);
            }
        }
        return all;
    }

    private static void cases(final Map<String, List<Map<String, Object>>> c) {
        // Keystroke by keystroke on the hardware keyboard, then Enter: the same strings as the keys-* cases
        // of kana/fixup-edittext.json.
        final String[] typed = {
                "na", "nya", "nyu", "nye", "nyi", "nyo", "n'a", "n'ya", "nna", "nnya", "nnnya", "nnn", "nnnn",
                "kanya", "kannya", "kanyu", "nyan", "nyann", "nyn", "nynya", "nyy", "nyya", "ny'a", "n a", "n ya",
                "kka", "kkya", "kkk", "kkka", "kkkya", "ttsu", "tttsu", "cchi", "ccchi", "sshi", "ppa", "nkk",
                "nkka", "nkkya", "nssha", "nnkka", "kkn", "kkna", "kknya", "xtsu", "xxtsu", "ltu", "lltu",
                "shinbun", "onnna", "konnnichiha", "kekkonn", "zasshi", "matcha", "ippunn", "anna", "annna",
                "Na", "NYA", "nYA", "Nya", "NNa", "nN", "Nn", "KKA", "kKa", "KkA", "n-", "nn-", "kk-", "n'", "nn'",
        };
        for (final String t: typed) {
            c.put("keys-" + t.replace(' ', '_'), seq(keys(t), key("ENTER")));
        }
        // Whole strings pasted from the clipboard: context-menu paste, paste as plain text, ctrl+V,
        // ctrl+shift+V. Same strings as the paste-* cases of kana/fixup-edittext.json.
        final String[] pasted = {
                "na", "nya", "nye", "nnya", "nnnya", "nnn", "nnnn", "nnnnn", "kka", "kkka", "kkkka", "nkka",
                "nnkka", "kknya", "kknna", "ttsu", "tttsu", "shinbun", "kannji", "kanji", "konnnichiha", "kekkonn",
                "ka na", "  ka ", "n a", "a n n a", "nyan", "nnyan", "rra-men", "nkkya", "xxtu", "kkkk", "nnk",
                "nyye", "nyyye", "nnyye", "Kanji", "KANJI", "nN", "NNA", "n'a", "n''a", "ka\nna",
        };
        for (final String p: pasted) {
            final String n = p.replace(' ', '_').replace('\n', '~');
            c.put("paste-" + n, seq(clip(p), menu("paste")));
            c.put("pastePlain-" + n, seq(clip(p), menu("pasteAsPlainText")));
            c.put("ctrlV-" + n, seq(clip(p), key("V", "ctrl")));
        }
        for (final String p: new String[] {"nya", "kka", "ka\nna"}) {
            c.put("ctrlShiftV-" + p.replace('\n', '~'), seq(clip(p), key("V", "ctrl", "shift")));
        }
        // Pasting in the middle and over a selection.
        c.put("mid-kana-paste-nka-1", seq(keys("kana"), cursorTo(1), clip("nka"), menu("paste")));
        c.put("mid-kana-paste-n-1", seq(keys("kana"), cursorTo(1), clip("n"), menu("paste")));
        c.put("mid-kana-paste-nn-1", seq(keys("kana"), cursorTo(1), clip("nn"), menu("paste")));
        c.put("mid-kana-paste-kk-1", seq(keys("kana"), cursorTo(1), clip("kk"), menu("paste")));
        c.put("mid-kana-paste-ya-1", seq(keys("kana"), cursorTo(1), clip("ya"), menu("paste")));
        c.put("mid-n-paste-ka-0", seq(type("n"), cursorTo(0), clip("ka"), menu("paste"), key("MOVE_END"), type("a")));
        c.put("mid-y-n0-paste-a", seq(type("y"), cursorTo(0), type("n"), key("MOVE_END"), clip("a"), menu("paste")));
        c.put("repl-kan-last-with-na", seq(keys("kan"), select(1, 2), clip("na"), menu("paste")));
        c.put("repl-kan-last-with-na-shiftLeft", seq(keys("kan"), key("DPAD_LEFT", "shift"), clip("na"), menu("paste")));
        c.put("repl-kan-all-with-nnn", seq(keys("kan"), select(0, 2), clip("nnn"), menu("paste")));
        c.put("repl-kan-all-with-nnn-ctrlA", seq(keys("kan"), key("A", "ctrl"), clip("nnn"), key("V", "ctrl")));
        c.put("repl-kan-all-with-nnn-selectAll", seq(keys("kan"), menu("selectAll"), clip("nnn"), menu("paste")));
        c.put("repl-ny-y-with-k", seq(keys("ny"), key("DPAD_LEFT", "shift"), clip("k"), menu("paste")));
        c.put("repl-nn0-with-ya", seq(type("n"), cursorTo(0), type("n"), key("DPAD_RIGHT", "shift"), clip("ya"), menu("paste")));
        c.put("repl-kana-mid-with-kka", seq(keys("kana"), cursorTo(0), key("DPAD_RIGHT", "shift"), clip("kka"), menu("paste")));
        c.put("repl-kanji-shiftHome-with-n", seq(keys("kanji"), key("MOVE_HOME", "shift"), clip("n"), menu("paste"), type("a")));
        // Clip kinds: several items, HTML (styled vs plain), kana, newline, empty.
        c.put("clip-items-ka-na", seq(obj("clip", obj("items", new ArrayList<>(Arrays.asList("ka", "na")))), menu("paste")));
        c.put("clip-items-n-n", seq(obj("clip", obj("items", new ArrayList<>(Arrays.asList("n", "n")))), menu("paste")));
        c.put("clip-items-n-a-plain", seq(obj("clip", obj("items", new ArrayList<>(Arrays.asList("n", "a")))), menu("pasteAsPlainText")));
        c.put("clip-html-kanji", seq(obj("clip", obj("text", "kanji", "html", "ka<b>n</b>ji")), menu("paste")));
        c.put("clip-html-kanji-plain", seq(obj("clip", obj("text", "kanji", "html", "ka<b>n</b>ji")), menu("pasteAsPlainText")));
        c.put("clip-html-differs", seq(obj("clip", obj("text", "nya", "html", "<i>kka</i>")), menu("paste")));
        c.put("clip-html-differs-plain", seq(obj("clip", obj("text", "nya", "html", "<i>kka</i>")), menu("pasteAsPlainText")));
        c.put("clip-kana-n-then-a", seq(clip("かn"), menu("paste"), type("a")));
        c.put("clip-kana-n-then-enter", seq(clip("かn"), menu("paste"), key("ENTER")));
        c.put("clip-empty", seq(type("n"), clip(""), menu("paste"), type("a")));
        c.put("clip-paste-twice-n", seq(clip("n"), menu("paste"), menu("paste"), menu("paste")));
        c.put("clip-tab", seq(clip("ka\tna"), menu("paste")));
        c.put("clip-crlf", seq(clip("ka\r\nna"), menu("paste")));
        // Cut, copy, undo, redo.
        c.put("cut-ctrlX-kanji-all", seq(keys("kanji"), key("A", "ctrl"), key("X", "ctrl"), key("V", "ctrl"), key("V", "ctrl")));
        c.put("cut-menu-n-from-kan", seq(keys("kan"), select(1, 2), menu("cut"), type("a")));
        c.put("copy-ctrlC-ka-paste-mid", seq(keys("ka"), key("A", "ctrl"), key("C", "ctrl"), key("MOVE_END"), type("n"),
                key("V", "ctrl")));
        c.put("copy-menu-n", seq(type("n"), menu("selectAll"), menu("copy"), key("MOVE_END"), menu("paste"), type("a")));
        c.put("undo-kka", seq(keys("kka"), key("Z", "ctrl"), key("Z", "ctrl"), key("Z", "ctrl", "shift")));
        c.put("undo-nya-menu", seq(keys("nya"), menu("undo"), menu("redo")));
        c.put("undo-paste-kanji", seq(clip("kanji"), key("V", "ctrl"), key("Z", "ctrl"), key("Z", "ctrl", "shift")));
        // Middle edits with the cursor keys (the mid-* re-entrancy cases of kana/fixup-edittext.json).
        c.put("mid-n-then-n-then-k", seq(type("n"), cursorTo(0), type("n"), key("MOVE_END"), type("k")));
        c.put("mid-ny-n0-a", seq(keys("ny"), cursorTo(0), type("n"), key("MOVE_END"), type("a")));
        c.put("mid-ny-n0-e", seq(keys("ny"), key("DPAD_LEFT", "alt"), type("n"), key("DPAD_RIGHT", "alt"), type("e")));
        c.put("mid-k-n0-k", seq(type("k"), key("DPAD_LEFT"), type("n"), key("DPAD_RIGHT"), type("k")));
        c.put("mid-k-n0-k-a", seq(type("k"), key("DPAD_LEFT"), type("n"), key("DPAD_RIGHT"), keys("ka")));
        c.put("mid-y-n0-a", seq(type("y"), key("DPAD_LEFT"), type("n"), key("DPAD_RIGHT"), type("a")));
        c.put("mid-a-n0", seq(type("a"), key("DPAD_LEFT"), type("n")));
        c.put("mid-ka-n0", seq(keys("ka"), key("DPAD_LEFT"), type("n")));
        c.put("mid-s-n0-s-ha", seq(type("s"), key("DPAD_LEFT"), type("n"), key("MOVE_END"), keys("sha")));
        c.put("mid-kana-k-1-k-2", seq(keys("kana"), cursorTo(1), type("k"), type("k")));
        c.put("mid-kana-n-y-a", seq(keys("kana"), cursorTo(1), keys("nya")));
        c.put("mid-dpad-left-past-start", seq(keys("ka"), keyTimes("DPAD_LEFT", 5), type("n"), keyTimes("DPAD_RIGHT", 9), type("n")));
        c.put("mid-dpad-up-down", seq(keys("kan"), key("DPAD_UP"), type("n"), key("DPAD_DOWN"), type("a")));
        c.put("mid-ctrl-left", seq(keys("ka"), type(" "), keys("na"), key("DPAD_LEFT", "ctrl"), type("n")));
        // Backspace and forward delete.
        c.put("del-kan-all", seq(keys("kan"), keyTimes("DEL", 4), keys("na")));
        c.put("del-ky-1-a", seq(keys("ky"), key("DPAD_LEFT"), key("DEL"), key("MOVE_END"), type("a")));
        c.put("del-k1a-2", seq(keys("k1a"), key("DPAD_LEFT"), key("DEL")));
        c.put("del-k1a-2-a", seq(keys("k1a"), key("DPAD_LEFT"), key("DEL"), key("MOVE_END"), type("a")));
        c.put("del-n1y-2-a", seq(keys("n1y"), key("DPAD_LEFT"), key("DEL"), key("MOVE_END"), type("a")));
        c.put("del-kana-1", seq(keys("kana"), cursorTo(1), key("DEL")));
        c.put("del-nn-k", seq(type("n"), cursorTo(0), type("n"), key("DEL"), key("MOVE_END"), type("k")));
        c.put("fdel-n1y-a", seq(keys("n1y"), cursorTo(1), key("FORWARD_DEL"), key("MOVE_END"), type("a")));
        c.put("fdel-k1a", seq(keys("k1a"), cursorTo(1), key("FORWARD_DEL")));
        c.put("fdel-at-end", seq(keys("ka"), key("FORWARD_DEL")));
        c.put("fdel-kan-0", seq(keys("kan"), cursorTo(0), keyTimes("FORWARD_DEL", 2)));
        c.put("del-selection-shift", seq(keys("kanji"), key("DPAD_LEFT", "shift"), key("DPAD_LEFT", "shift"), key("DEL"), type("a")));
        c.put("fdel-selection", seq(keys("kanji"), select(1, 3), key("FORWARD_DEL"), key("MOVE_END"), type("a")));
        c.put("del-repeat", seq(keys("kanji"), obj("key", "DEL", "repeat", 3)));
        c.put("del-alt", seq(keys("ka"), type(" "), keys("nji"), key("DEL", "alt")));
        c.put("del-ctrl", seq(keys("ka"), type(" "), keys("nji"), key("DEL", "ctrl")));
        c.put("del-shift", seq(keys("kanji"), key("DEL", "shift")));
        c.put("fdel-ctrl", seq(keys("ka"), type(" "), keys("nji"), cursorTo(0), key("FORWARD_DEL", "ctrl")));
        c.put("del-emoji", seq(clip("a😀"), menu("paste"), key("DEL"), type("n")));
        c.put("del-kana", seq(keys("kana"), key("DEL"), key("DEL")));
        // Shift, caps lock, ACTION_MULTIPLE.
        c.put("shift-sticky-a", seq(key("SHIFT_LEFT"), type("a"), type("n"), type("a")));
        c.put("shift-held-na", seq(obj("type", "NA")));
        c.put("capsLock-nya", seq(obj("type", "nya", "capsLock", true)));
        c.put("capsLock-kka", seq(obj("type", "kka", "capsLock", true)));
        c.put("multiple-ka", seq(obj("multiple", "ka")));
        c.put("multiple-kana", seq(type("n"), obj("multiple", "か"), type("a")));
        c.put("multiple-nn", seq(obj("multiple", "nn")));
        c.put("space-n", seq(type("n"), key("SPACE"), type("a")));
        c.put("tab-n", seq(type("n"), key("TAB"), type("a")));
        // Enter and other submit keys.
        c.put("enter-empty", seq(key("ENTER")));
        c.put("enter-n", seq(type("n"), key("ENTER")));
        c.put("enter-twice", seq(keys("ka"), key("ENTER"), key("ENTER")));
        c.put("enter-down-only", seq(keys("ka"), obj("keyDown", "ENTER")));
        c.put("enter-up-only", seq(keys("ka"), obj("keyUp", "ENTER")));
        c.put("enter-repeat", seq(keys("ka"), obj("key", "ENTER", "repeat", 2)));
        c.put("enter-shift", seq(keys("ka"), key("ENTER", "shift"), type("n")));
        c.put("enter-ctrl", seq(keys("ka"), key("ENTER", "ctrl")));
        c.put("enter-alt", seq(keys("ka"), key("ENTER", "alt")));
        c.put("enter-numpad", seq(keys("ka"), key("NUMPAD_ENTER")));
        c.put("enter-dpad-center", seq(keys("ka"), key("DPAD_CENTER")));
        c.put("enter-after-mid", seq(keys("ka"), key("DPAD_LEFT"), key("ENTER"), type("n")));
        c.put("enter-with-selection", seq(keys("kana"), select(0, 2), key("ENTER")));
        c.put("ime-performEditorAction-unspecified", seq(keys("ka"), obj("ime", "performEditorAction", "actionId", EditorInfo.IME_ACTION_UNSPECIFIED)));
        c.put("ime-performEditorAction-done", seq(keys("ka"), obj("ime", "performEditorAction", "actionId", EditorInfo.IME_ACTION_DONE)));
        c.put("ime-performEditorAction-go", seq(keys("ka"), obj("ime", "performEditorAction", "actionId", EditorInfo.IME_ACTION_GO)));
        c.put("ime-performEditorAction-next", seq(keys("ka"), obj("ime", "performEditorAction", "actionId", EditorInfo.IME_ACTION_NEXT)));
        c.put("ime-commitText-newline", seq(keys("ka"), obj("ime", "commitText", "text", "\n")));
        c.put("ime-commitText-n-newline", seq(type("n"), obj("ime", "commitText", "text", "\n")));
        // Seeded random sequences: letters, cursor keys, shift-selection, DEL, FORWARD_DEL, pastes; then Enter.
        final Random random = new Random(5L);
        final String letters = "nnnnyykkkssttaiueo'- ";
        for (int n = 0; n < 400; n++) {
            final List<Map<String, Object>> ops = new ArrayList<>();
            final int count = 2 + random.nextInt(12);
            for (int i = 0; i < count; i++) {
                final int kind = random.nextInt(100);
                if (kind < 50 || i == 0) {
                    String ch = String.valueOf(letters.charAt(random.nextInt(letters.length())));
                    if (random.nextInt(15) == 0) {
                        ch = ch.toUpperCase(java.util.Locale.ROOT);
                    }
                    ops.add(type(ch));
                }
                else if (kind < 60) {
                    ops.add(key("DPAD_LEFT"));
                }
                else if (kind < 66) {
                    ops.add(key("DPAD_RIGHT"));
                }
                else if (kind < 70) {
                    ops.add(key(random.nextBoolean() ? "MOVE_HOME" : "MOVE_END"));
                }
                else if (kind < 74) {
                    ops.add(key(random.nextBoolean() ? "DPAD_LEFT" : "DPAD_RIGHT", "shift"));
                }
                else if (kind < 82) {
                    ops.add(key("DEL"));
                }
                else if (kind < 86) {
                    ops.add(key("FORWARD_DEL"));
                }
                else {
                    final StringBuilder sb = new StringBuilder();
                    final int len = 1 + random.nextInt(4);
                    for (int j = 0; j < len; j++) {
                        sb.append(letters.charAt(random.nextInt(letters.length())));
                    }
                    ops.add(clip(sb.toString()));
                    ops.add(random.nextInt(3) == 0 ? key("V", "ctrl") : menu("paste"));
                }
            }
            ops.add(key("ENTER"));
            c.put("random-" + (n + 1), ops);
        }
    }

    @Test
    public void fixupKeys() throws Exception {
        try {
            setUp();
            fixupKeysCases();
        }
        finally {
            tearDown();
        }
    }

    private static void fixupKeysCases() throws Exception {
        final Map<String, List<Map<String, Object>>> cases = new LinkedHashMap<>();
        cases(cases);
        int differing = 0;
        int stopped = 0;
        final List<String> differ = new ArrayList<>();
        try (final GoldenWriter w = GoldenWriter.open("kana/fixup-keys.json", "kana.fixupKeys",
                "fragments/UnansweredSessionFragment TextWatcher + handleEditorAction on a real EditText, "
                        + "hardware key events and clipboard paste")) {
            final Object[] env = new Object[1];
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                final Field f = new Field(true);
                env[0] = obj(
                        "editorInfoImeOptions", f.info.imeOptions,
                        "editorInfoInputType", f.info.inputType,
                        "keyListener", f.edit.getKeyListener() == null ? null : f.edit.getKeyListener().getClass().getName(),
                        "movementMethod", f.edit.getMovementMethod() == null ? null : f.edit.getMovementMethod().getClass().getName(),
                        "focused", f.edit.isFocused(),
                        "imeActive", ((android.view.inputmethod.InputMethodManager) activity.getSystemService(
                                Context.INPUT_METHOD_SERVICE)).isActive(f.edit),
                        "keyboardType", KCM.getKeyboardType(),
                        "modifierBehavior", KCM.getModifierBehavior(),
                        "sdk", android.os.Build.VERSION.SDK_INT);
            });
            w.add("env", obj(), env[0]);
            for (final Map.Entry<String, List<Map<String, Object>>> e: cases.entrySet()) {
                final Object[] result = new Object[1];
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                    try {
                        result[0] = run(e.getValue());
                    }
                    catch (final Throwable t) {
                        result[0] = t;
                    }
                });
                if (result[0] instanceof Throwable) {
                    throw new AssertionError(e.getKey(), (Throwable) result[0]);
                }
                final CaseResult r = (CaseResult) result[0];
                assertNotNull(r);
                if (r.firstDiff != null) {
                    differing++;
                    differ.add(e.getKey());
                }
                if (r.icStoppedAt != null) {
                    stopped++;
                }
                w.add(e.getKey(), obj("ops", e.getValue()), obj(
                        "keys", r.keys,
                        "inputConnection", r.ic,
                        "inputConnectionStoppedAt", r.icStoppedAt,
                        "firstDiffFromInputConnection", r.firstDiff));
            }
        }
        android.util.Log.i("FixupKeysGolden", "cases " + cases.size() + ", differing from InputConnection: "
                + differing + " " + differ + "; replay stopped: " + stopped);
        assertTrue(cases.size() > 400);
    }
}
