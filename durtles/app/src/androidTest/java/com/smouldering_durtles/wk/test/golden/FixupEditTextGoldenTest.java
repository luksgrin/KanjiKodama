package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static com.smouldering_durtles.wk.util.ObjectSupport.safe;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.text.Editable;
import android.text.InputType;
import android.text.Selection;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextWatcher;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.widget.EditText;

import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.fasterxml.jackson.databind.JsonNode;
import com.smouldering_durtles.wk.util.PseudoIme;

import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Golden cases for {@link PseudoIme#fixup} as it runs in the app: from the quiz answer field's
 * TextWatcher on a real {@link EditText}, which fires again for every replacement fixup itself makes
 * (re-entrancy). Writes {@code kana/fixup-edittext.json}.
 *
 * <p>The watcher below is a copy of the anonymous TextWatcher in
 * {@code UnansweredSessionFragment.addTextWatcherToEditText()} (keep them in sync), with the
 * fragment state it reads fixed to what it is while a reading question is being typed:
 * the field is active ({@code questionEdit.getTag() == true}) and {@code question.getType().isKana()}.
 * {@code FloatingUiState.setCurrentAnswer} is left out (it only stores the text). The EditText gets the
 * fragment's input type ({@code TYPE_CLASS_TEXT | TYPE_TEXT_FLAG_NO_SUGGESTIONS}) and {@code setSingleLine()}.
 * The watcher additionally counts its fixup calls and nesting depth and records exceptions (which
 * {@code ObjectSupport.safe} swallows in the app).</p>
 *
 * <p>Each case replays its edits three ways:
 * <ul>
 *   <li>{@code editText}: through the EditText's {@link InputConnection}, the way a soft keyboard
 *   types: insert = move the cursor, {@code commitText}; backspace/deleteAt = move the cursor,
 *   {@code deleteSurroundingText(1, 0)}; replace = select, {@code commitText}; setText =
 *   {@code EditText.setText}; compose = {@code setComposingText}; finishComposing.</li>
 *   <li>{@code editable}: the same edits as direct {@link Editable} calls on {@code EditText.getText()}
 *   (insert/delete/replace), still with the real watcher.</li>
 *   <li>{@code dummy}: the Tier A model ({@code KanaGolden.apply}): PseudoIme's private
 *   {@code DummyEditable}, one {@code fixup(s, at, at + insertedLength)} call per edit, no re-entrancy.
 *   Compose edits have no dummy equivalent (null).</li>
 * </ul>
 *
 * <p>Edits: {@code {"insert": text, "at": i}} (at -1 = end; clamped to the length),
 * {@code {"backspace": true}} (delete the last character), {@code {"deleteAt": i}} (delete the character
 * before index i), {@code {"replace": [a, b], "text": t}}, {@code {"setText": t}},
 * {@code {"compose": t}}, {@code {"finishComposing": true}}.</p>
 *
 * <p>Cases: {@code seq-N} are the 200 sequences of {@code kana/fixup-sequences.json} (read from the
 * androidTest asset {@code golden-inputs/kana-fixup-sequences.json}, a verbatim copy of that fixture;
 * the test asserts the device's dummy results equal the Tier A ones), then targeted re-entrancy cases
 * and seeded random sequences.</p>
 */
@LargeTest
public final class FixupEditTextGoldenTest {
    private static Context context;
    private static Context testContext;

    @BeforeClass
    public static void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        testContext = InstrumentationRegistry.getInstrumentation().getContext();
        GoldenWriter.setBaseDir(new File(context.getExternalFilesDir(null), "golden"));
    }

    /** Copy of the app's watcher (see class javadoc), plus counters. */
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

    @Test
    public void fixupEditText() throws Exception {
        final JsonNode tierA = ScenarioRunner.JSON.readTree(
                ScenarioRunner.readAsset(testContext, "golden-inputs/kana-fixup-sequences.json"));
        final List<String> names = new ArrayList<>();
        final List<List<Map<String, Object>>> sequences = new ArrayList<>();
        final List<JsonNode> expectedDummy = new ArrayList<>();
        for (final JsonNode c: tierA.get("cases")) {
            names.add(c.get("name").asText());
            final List<Map<String, Object>> edits = new ArrayList<>();
            for (final JsonNode e: c.get("input").get("edits")) {
                if (e.has("backspace")) {
                    edits.add(obj("backspace", true));
                }
                else {
                    edits.add(obj("insert", e.get("insert").asText(), "at", e.get("at").asInt()));
                }
            }
            sequences.add(edits);
            expectedDummy.add(c.get("output").get("after"));
        }
        assertEquals(200, names.size());
        targeted(names, sequences);
        random(names, sequences);

        final List<String> differing = new ArrayList<>();
        final List<String> tierAMismatch = new ArrayList<>();
        try (final GoldenWriter w = GoldenWriter.open("kana/fixup-edittext.json", "kana.fixupEditText",
                "fragments/UnansweredSessionFragment TextWatcher -> util/PseudoIme.fixup on a real EditText")) {
            for (int n = 0; n < names.size(); n++) {
                final List<Map<String, Object>> edits = sequences.get(n);
                final Object[] result = new Object[3];
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                    try {
                        result[0] = runEditText(edits, true);
                        result[1] = runEditText(edits, false);
                        result[2] = runDummy(edits);
                    }
                    catch (final Throwable t) {
                        result[0] = t;
                    }
                });
                if (result[0] instanceof Throwable) {
                    throw new AssertionError(names.get(n), (Throwable) result[0]);
                }
                @SuppressWarnings("unchecked") final List<Map<String, Object>> viaIc = (List<Map<String, Object>>) result[0];
                @SuppressWarnings("unchecked") final List<Map<String, Object>> viaEditable = (List<Map<String, Object>>) result[1];
                @SuppressWarnings("unchecked") final List<String> dummy = (List<String>) result[2];
                if (n < 200) {
                    final JsonNode expected = expectedDummy.get(n);
                    for (int i = 0; i < dummy.size(); i++) {
                        final String want = expected.get(i).get("value").asText();
                        // The Tier A fixture writes a lone surrogate (an emoji typed one Java char at a
                        // time) as "?", so its inputs no longer reproduce its outputs; skip those steps.
                        if (want.codePoints().anyMatch(cp -> cp > 0xFFFF)) {
                            tierAMismatch.add(names.get(n) + "#" + i);
                            continue;
                        }
                        assertEquals(names.get(n) + " step " + i + ": device DummyEditable differs from Tier A",
                                want, dummy.get(i));
                    }
                }
                Integer firstDiff = null;
                Integer firstDiffEditable = null;
                for (int i = 0; i < edits.size(); i++) {
                    final String d = dummy.get(i);
                    if (d == null) {
                        continue;
                    }
                    if (firstDiff == null && !d.equals(viaIc.get(i).get("value"))) {
                        firstDiff = i;
                    }
                    if (firstDiffEditable == null && !d.equals(viaEditable.get(i).get("value"))) {
                        firstDiffEditable = i;
                    }
                }
                if (firstDiff != null || firstDiffEditable != null) {
                    differing.add(names.get(n));
                }
                w.add(names.get(n), obj("edits", edits), obj(
                        "editText", viaIc,
                        "editable", viaEditable,
                        "dummy", dummy,
                        "firstDiffFromDummy", firstDiff,
                        "firstDiffFromDummyEditable", firstDiffEditable));
            }
        }
        android.util.Log.i("FixupEditTextGolden", "cases " + names.size() + ", differing from DummyEditable: "
                + differing.size() + " " + differing + "; Tier A steps skipped (lone surrogate): " + tierAMismatch);
        assertTrue(names.size() > 200);
    }

    private static EditText newEditText() {
        final EditText edit = new EditText(context);
        edit.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        edit.setSingleLine();
        return edit;
    }

    /** Replay on a real EditText, through its InputConnection (ic = true) or direct Editable calls. */
    private static List<Map<String, Object>> runEditText(final List<Map<String, Object>> edits, final boolean ic) {
        final EditText edit = newEditText();
        final AppWatcher watcher = new AppWatcher();
        edit.addTextChangedListener(watcher);
        final InputConnection conn = edit.onCreateInputConnection(new EditorInfo());
        final List<Map<String, Object>> steps = new ArrayList<>();
        for (final Map<String, Object> e: edits) {
            watcher.calls = 0;
            watcher.maxDepth = 0;
            watcher.errors.clear();
            final Editable s = edit.getText();
            boolean applied = true;
            if (e.containsKey("insert")) {
                final String text = (String) e.get("insert");
                final int at = clampAt((Integer) e.get("at"), s.length());
                if (ic) {
                    Selection.setSelection(s, at);
                    conn.commitText(text, 1);
                }
                else {
                    s.insert(at, text);
                }
            }
            else if (e.containsKey("backspace")) {
                if (s.length() > 0) {
                    if (ic) {
                        Selection.setSelection(s, s.length());
                        conn.deleteSurroundingText(1, 0);
                    }
                    else {
                        s.delete(s.length() - 1, s.length());
                    }
                }
            }
            else if (e.containsKey("deleteAt")) {
                final int at = Math.min((Integer) e.get("deleteAt"), s.length());
                if (at > 0) {
                    if (ic) {
                        Selection.setSelection(s, at);
                        conn.deleteSurroundingText(1, 0);
                    }
                    else {
                        s.delete(at - 1, at);
                    }
                }
            }
            else if (e.containsKey("replace")) {
                final int[] r = range(e, s.length());
                final String text = (String) e.get("text");
                if (ic) {
                    Selection.setSelection(s, r[0], r[1]);
                    conn.commitText(text, 1);
                }
                else {
                    s.replace(r[0], r[1], text);
                }
            }
            else if (e.containsKey("setText")) {
                edit.setText((String) e.get("setText"));
            }
            else if (e.containsKey("compose")) {
                if (ic) {
                    if (Selection.getSelectionStart(s) < 0) {
                        Selection.setSelection(s, s.length());
                    }
                    conn.setComposingText((String) e.get("compose"), 1);
                }
                else {
                    applied = false;
                }
            }
            else if (e.containsKey("finishComposing")) {
                if (ic) {
                    conn.finishComposingText();
                }
                else {
                    applied = false;
                }
            }
            else {
                throw new IllegalArgumentException("unknown edit " + e);
            }
            final Editable t = edit.getText();
            final Map<String, Object> step = obj(
                    "value", t.toString(),
                    "selStart", Selection.getSelectionStart(t),
                    "selEnd", Selection.getSelectionEnd(t),
                    "fixupCalls", watcher.calls,
                    "maxDepth", watcher.maxDepth);
            if (ic) {
                step.put("composing", new int[] {BaseIc.composingStart(t), BaseIc.composingEnd(t)});
            }
            if (!applied) {
                step.put("skipped", true);
            }
            if (!watcher.errors.isEmpty()) {
                step.put("errors", new ArrayList<>(watcher.errors));
            }
            steps.add(step);
        }
        return steps;
    }

    /** Composing region of an Editable, as BaseInputConnection tracks it. */
    private static final class BaseIc {
        static int composingStart(final android.text.Spannable s) {
            return android.view.inputmethod.BaseInputConnection.getComposingSpanStart(s);
        }

        static int composingEnd(final android.text.Spannable s) {
            return android.view.inputmethod.BaseInputConnection.getComposingSpanEnd(s);
        }
    }

    /** The Tier A model: DummyEditable, one fixup per edit (KanaGolden.apply). */
    private static List<String> runDummy(final List<Map<String, Object>> edits) throws Exception {
        Editable s = dummyEditable("");
        final List<String> steps = new ArrayList<>();
        for (final Map<String, Object> e: edits) {
            String value;
            try {
                if (e.containsKey("insert")) {
                    final String text = (String) e.get("insert");
                    final int at = clampAt((Integer) e.get("at"), s.length());
                    s.insert(at, text);
                    PseudoIme.fixup(s, at, at + text.length());
                }
                else if (e.containsKey("backspace")) {
                    if (s.length() > 0) {
                        s.delete(s.length() - 1, s.length());
                        PseudoIme.fixup(s, s.length(), s.length());
                    }
                }
                else if (e.containsKey("deleteAt")) {
                    final int at = Math.min((Integer) e.get("deleteAt"), s.length());
                    if (at > 0) {
                        s.delete(at - 1, at);
                        PseudoIme.fixup(s, at - 1, at - 1);
                    }
                }
                else if (e.containsKey("replace")) {
                    final int[] r = range(e, s.length());
                    final String text = (String) e.get("text");
                    s.replace(r[0], r[1], text);
                    PseudoIme.fixup(s, r[0], r[0] + text.length());
                }
                else if (e.containsKey("setText")) {
                    final String text = (String) e.get("setText");
                    s = dummyEditable(text);
                    PseudoIme.fixup(s, 0, text.length());
                }
                else {
                    steps.add(null);
                    continue;
                }
                value = s.toString();
            }
            catch (final RuntimeException ex) {
                value = s.toString();
            }
            steps.add(value);
        }
        return steps;
    }

    private static int clampAt(final int at, final int length) {
        return at < 0 ? length : Math.min(at, length);
    }

    private static int[] range(final Map<String, Object> e, final int length) {
        final int[] r = (int[]) e.get("replace");
        return new int[] {Math.min(r[0], length), Math.min(r[1], length)};
    }

    private static Editable dummyEditable(final String value) throws Exception {
        final Class<?> c = Class.forName("com.smouldering_durtles.wk.util.PseudoIme$DummyEditable");
        final Constructor<?> ctor = c.getDeclaredConstructor(String.class);
        ctor.setAccessible(true);
        return (Editable) ctor.newInstance(value);
    }

    private static void add(final List<String> names, final List<List<Map<String, Object>>> seqs, final String name,
                            final List<Map<String, Object>> edits) {
        names.add(name);
        seqs.add(edits);
    }

    private static List<Map<String, Object>> keys(final String typed) {
        final List<Map<String, Object>> edits = new ArrayList<>();
        for (int i = 0; i < typed.length(); i++) {
            edits.add(ins(typed.substring(i, i + 1), -1));
        }
        return edits;
    }

    private static Map<String, Object> ins(final String text, final int at) {
        return obj("insert", text, "at", at);
    }

    @SafeVarargs
    private static List<Map<String, Object>> concat(final List<Map<String, Object>>... parts) {
        final List<Map<String, Object>> all = new ArrayList<>();
        for (final List<Map<String, Object>> p: parts) {
            all.addAll(p);
        }
        return all;
    }

    @SafeVarargs
    private static List<Map<String, Object>> list(final Map<String, Object>... edits) {
        final List<Map<String, Object>> all = new ArrayList<>();
        for (final Map<String, Object> e: edits) {
            all.add(e);
        }
        return all;
    }

    /** Hand-picked re-entrancy cases. */
    private static void targeted(final List<String> names, final List<List<Map<String, Object>>> seqs) {
        // Keystroke by keystroke: n before vowels / y / n, doubled consonants, replacements whose result
        // follows text that could still convert.
        final String[] typed = {
                "na", "nya", "nyu", "nye", "nyi", "nyo", "n'a", "n'ya", "nna", "nnya", "nnnya", "nnn", "nnnn",
                "kanya", "kannya", "kanyu", "nyan", "nyann", "nyn", "nynya", "nyy", "nyya", "ny'a", "n a", "n ya",
                "kka", "kkya", "kkk", "kkka", "kkkya", "ttsu", "tttsu", "cchi", "ccchi", "sshi", "ppa", "nkk",
                "nkka", "nkkya", "nssha", "nnkka", "kkn", "kkna", "kknya", "xtsu", "xxtsu", "ltu", "lltu",
                "shinbun", "onnna", "konnnichiha", "kekkonn", "zasshi", "matcha", "ippunn", "anna", "annna",
                "Na", "NYA", "nYA", "Nya", "NNa", "nN", "Nn", "KKA", "kKa", "KkA", "n-", "nn-", "kk-", "n'", "nn'",
        };
        for (final String t: typed) {
            add(names, seqs, "keys-" + t.replace(' ', '_'), keys(t));
        }
        // Paste the whole string at once.
        final String[] pasted = {
                "na", "nya", "nye", "nnya", "nnnya", "nnn", "nnnn", "nnnnn", "kka", "kkka", "kkkka", "nkka",
                "nnkka", "kknya", "kknna", "ttsu", "tttsu", "shinbun", "kannji", "kanji", "konnnichiha", "kekkonn",
                "ka na", "  ka ", "n a", "a n n a", "nyan", "nnyan", "rra-men", "nkkya", "xxtu", "kkkk", "nnk",
                "nyye", "nyyye", "nnyye", "Kanji", "KANJI", "nN", "NNA", "n'a", "n''a", "ka\nna",
        };
        for (final String p: pasted) {
            add(names, seqs, "paste-" + p.replace(' ', '_').replace('\n', '~'), list(ins(p, -1)));
        }
        // An unconverted n before the edit point (only reachable by editing in the middle), then a
        // replacement right after it: the nested watcher call looks one character further back.
        add(names, seqs, "mid-n-then-n-then-k", list(ins("n", -1), ins("n", 0), ins("k", -1)));
        add(names, seqs, "mid-ny-n0-a", list(ins("n", -1), ins("y", -1), ins("n", 0), ins("a", -1)));
        add(names, seqs, "mid-ny-n0-e", list(ins("n", -1), ins("y", -1), ins("n", 0), ins("e", -1)));
        add(names, seqs, "mid-k-n0-k", list(ins("k", -1), ins("n", 0), ins("k", -1)));
        add(names, seqs, "mid-k-n0-k-a", list(ins("k", -1), ins("n", 0), ins("k", -1), ins("a", -1)));
        add(names, seqs, "mid-y-n0-a", list(ins("y", -1), ins("n", 0), ins("a", -1)));
        add(names, seqs, "mid-y-n0-n0-a", list(ins("y", -1), ins("n", 0), ins("n", 0), ins("a", -1)));
        add(names, seqs, "mid-a-n0", list(ins("a", -1), ins("n", 0)));
        add(names, seqs, "mid-ka-n1", list(ins("k", -1), ins("a", -1), ins("n", 1)));
        add(names, seqs, "mid-ka-n0-n1", list(ins("k", -1), ins("a", -1), ins("n", 0), ins("n", 1)));
        add(names, seqs, "mid-s-n0-s-ha", list(ins("s", -1), ins("n", 0), ins("s", -1), ins("h", -1), ins("a", -1)));
        add(names, seqs, "mid-t-n0-t-su", list(ins("t", -1), ins("n", 0), ins("t", -1), ins("s", -1), ins("u", -1)));
        add(names, seqs, "mid-y-n0-paste-a", list(ins("y", -1), ins("n", 0), ins("a", 2)));
        add(names, seqs, "mid-n-n0-paste-ka", list(ins("n", -1), ins("n", 0), ins("ka", -1)));
        add(names, seqs, "mid-kana-paste-nka-1", concat(keys("kana"), list(ins("nka", 1))));
        add(names, seqs, "mid-kana-paste-n-1", concat(keys("kana"), list(ins("n", 1))));
        add(names, seqs, "mid-kana-paste-nn-1", concat(keys("kana"), list(ins("nn", 1))));
        add(names, seqs, "mid-kana-paste-kk-1", concat(keys("kana"), list(ins("kk", 1))));
        add(names, seqs, "mid-kana-k-1-k-2", concat(keys("kana"), list(ins("k", 1), ins("k", 2))));
        add(names, seqs, "mid-kana-y-1-a-2", concat(keys("kana"), list(ins("n", 1), ins("y", 2), ins("a", 3))));
        // Deletions in the middle of a word.
        add(names, seqs, "del-ky-1-a", list(ins("k", -1), ins("y", -1), obj("deleteAt", 1), ins("a", -1)));
        add(names, seqs, "del-k1a-2", list(ins("k", -1), ins("1", -1), ins("a", -1), obj("deleteAt", 2)));
        add(names, seqs, "del-k1a-2-a", list(ins("k", -1), ins("1", -1), ins("a", -1), obj("deleteAt", 2), ins("a", -1)));
        add(names, seqs, "del-n1y-2-a", list(ins("n", -1), ins("1", -1), ins("y", -1), obj("deleteAt", 2), ins("a", -1)));
        add(names, seqs, "del-kana-1", concat(keys("kana"), list(obj("deleteAt", 1))));
        add(names, seqs, "del-kanji-2-n", concat(keys("kanji"), list(obj("deleteAt", 2), ins("n", 1))));
        add(names, seqs, "del-nyk-mid", list(ins("n", -1), ins("y", -1), ins("k", -1), obj("deleteAt", 2), ins("a", -1)));
        add(names, seqs, "del-nn-k", list(ins("n", -1), ins("n", 0), obj("deleteAt", 1), ins("k", -1)));
        add(names, seqs, "del-backspace-all", concat(keys("kan"), list(obj("backspace", true), obj("backspace", true),
                obj("backspace", true), obj("backspace", true)), keys("na")));
        // Replacing a selection (paste over).
        add(names, seqs, "repl-kan-last-with-na", concat(keys("kan"), list(obj("replace", new int[] {1, 2}, "text", "na"))));
        add(names, seqs, "repl-kan-all-with-nnn", concat(keys("kan"), list(obj("replace", new int[] {0, 2}, "text", "nnn"))));
        add(names, seqs, "repl-ny-y-with-k", list(ins("n", -1), ins("y", -1), obj("replace", new int[] {1, 2}, "text", "k")));
        add(names, seqs, "repl-nn0-with-ya", list(ins("n", -1), ins("n", 0), obj("replace", new int[] {1, 2}, "text", "ya")));
        add(names, seqs, "repl-kana-mid-with-kka", concat(keys("kana"), list(obj("replace", new int[] {0, 1}, "text", "kka"))));
        // setText (the fragment restores the saved answer with setText while the watcher is active).
        for (final String t: new String[] {"n", "nn", "nnn", "kanji", "kka", "nyan", "nnya", "ka na", "かn", "かna"}) {
            add(names, seqs, "setText-" + t.replace(' ', '_'), list(obj("setText", t)));
        }
        add(names, seqs, "setText-n-then-a", list(obj("setText", "n"), ins("a", -1)));
        add(names, seqs, "setText-n-then-k", list(obj("setText", "n"), ins("k", -1)));
        // A soft keyboard that keeps the word in a composing region (setComposingText with the whole word
        // each key), as some IMEs do despite NO_SUGGESTIONS.
        for (final String t: new String[] {"kanji", "shinbun", "kka", "nya", "nnn", "ka na", "toukyou"}) {
            final List<Map<String, Object>> edits = new ArrayList<>();
            for (int i = 1; i <= t.length(); i++) {
                edits.add(obj("compose", t.substring(0, i)));
            }
            edits.add(obj("finishComposing", true));
            add(names, seqs, "compose-" + t.replace(' ', '_'), edits);
        }
        add(names, seqs, "compose-ka-finish-na", list(obj("compose", "k"), obj("compose", "ka"), obj("finishComposing", true),
                obj("compose", "n"), obj("compose", "na"), obj("finishComposing", true)));
    }

    /** Seeded random sequences over n/y/consonant/vowel-heavy letters, with edits anywhere. */
    private static void random(final List<String> names, final List<List<Map<String, Object>>> seqs) {
        final Random random = new Random(3L);
        final String letters = "nnnnyykkkssttaiueo'- ";
        for (int n = 0; n < 400; n++) {
            final List<Map<String, Object>> edits = new ArrayList<>();
            int approxLength = 0;
            final int count = 2 + random.nextInt(10);
            for (int i = 0; i < count; i++) {
                final int kind = random.nextInt(100);
                if (kind < 60 || approxLength == 0) {
                    edits.add(ins(String.valueOf(letters.charAt(random.nextInt(letters.length()))), -1));
                    approxLength++;
                }
                else if (kind < 80) {
                    edits.add(ins(String.valueOf(letters.charAt(random.nextInt(letters.length()))), random.nextInt(approxLength + 1)));
                    approxLength++;
                }
                else if (kind < 88) {
                    final StringBuilder sb = new StringBuilder();
                    final int len = 2 + random.nextInt(4);
                    for (int j = 0; j < len; j++) {
                        sb.append(letters.charAt(random.nextInt(letters.length())));
                    }
                    edits.add(ins(sb.toString(), random.nextInt(2) == 0 ? -1 : random.nextInt(approxLength + 1)));
                    approxLength += len;
                }
                else if (kind < 94) {
                    edits.add(obj("backspace", true));
                    approxLength--;
                }
                else {
                    edits.add(obj("deleteAt", 1 + random.nextInt(approxLength)));
                    approxLength--;
                }
            }
            add(names, seqs, "random-" + (n + 1), edits);
        }
    }
}
