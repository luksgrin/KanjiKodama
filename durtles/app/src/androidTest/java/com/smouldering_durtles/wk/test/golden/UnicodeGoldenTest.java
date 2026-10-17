/*
 * KanjiKodama golden fixtures (Tier B): runs inside the real debug app on a device or emulator.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.os.Build;

import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.enums.SubjectType;
import com.smouldering_durtles.wk.model.AnswerVerdict;
import com.smouldering_durtles.wk.model.DigraphMatch;
import com.smouldering_durtles.wk.util.FuzzyMatching;

import org.junit.BeforeClass;
import org.junit.Test;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Unicode behavior of the answer path on the device (ART + ICU) instead of the JVM. It touches no app data.
 *
 * <ul>
 *     <li>{@link #rerunJvmFixtures()}: re-runs every case of the Tier A answer fixtures
 *     ({@code answers/fuzzy*.json*}, {@code answers/check-*.json*}) on the device and compares with the JVM output.
 *     The fixtures are read from {@code <external files>/golden-in/answers/} (adb push them there first, see
 *     {@code durtles/golden/unicode.sh}). Writes a summary to {@code golden-report/unicode-compare.json} and every
 *     differing case, with the device output, to {@code answers/unicode-android-overrides.json}.</li>
 *     <li>{@link #targetedCases()}: a hand-made set of strings for every code point class {@code cleanString} treats
 *     specially, through {@code cleanString} and {@code FuzzyMatching.matches} → {@code answers/unicode-android.json}.</li>
 *     <li>{@link #cleanStringTable()}: the device's {@code Character.getType} classification of every code point
 *     as {@code cleanString} uses it, and every code point that {@code toLowerCase(Locale.ENGLISH)} changes
 *     → {@code answers/unicode-android-table.json}.</li>
 * </ul>
 */
@LargeTest
public final class UnicodeGoldenTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static File inDir;
    private static File reportDir;
    private static Method cleanString;

    @BeforeClass
    public static void setUp() throws Exception {
        final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        GoldenWriter.setBaseDir(new File(context.getExternalFilesDir(null), "golden"));
        inDir = new File(context.getExternalFilesDir(null), "golden-in");
        reportDir = new File(context.getExternalFilesDir(null), "golden-report");
        cleanString = FuzzyMatching.class.getDeclaredMethod("cleanString", String.class);
        cleanString.setAccessible(true);
    }

    private static String clean(final String s) {
        try {
            return (String) cleanString.invoke(null, s);
        } catch (final ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    // --- shared output helpers (same shape as the Tier A generators) ------------------------------------

    private static Map<String, Object> verdict(final AnswerVerdict v) {
        final DigraphMatch d = v.getDigraphMatch();
        return obj("ok", v.isOk(), "retry", v.isRetry(), "nearMatch", v.isNearMatch(),
                "givenAnswer", v.getGivenAnswer(), "matchedAnswer", v.getMatchedAnswer(),
                "digraph", d == null ? null : new String[] {String.valueOf(d.getRegularKana()), String.valueOf(d.getSmallKana())});
    }

    private interface VerdictCall {
        AnswerVerdict run();
    }

    private static Object safeVerdict(final VerdictCall call) {
        try {
            return verdict(call.run());
        } catch (final RuntimeException e) {
            return obj("error", e.getClass().getSimpleName());
        }
    }

    private static Map<String, Object> fuzzy(final String answer, final List<String> accepted, final List<String> rejected) {
        final Map<String, Object> out = new LinkedHashMap<>();
        for (final CloseEnoughAction action: CloseEnoughAction.values()) {
            out.put(action.name(), safeVerdict(() -> FuzzyMatching.matches(answer, accepted, rejected, action)));
        }
        return out;
    }

    private static List<String> strings(final JsonNode array) {
        final List<String> result = new ArrayList<>();
        for (final JsonNode n: array) {
            result.add(n.asText());
        }
        return result;
    }

    // --- 1. re-run the JVM fixtures ----------------------------------------------------------------------

    private static final class FileResult {
        int cases = 0;
        int differ = 0;
        final List<String> examples = new ArrayList<>();
    }

    @Test
    public void rerunJvmFixtures() throws Exception {
        final File answers = new File(inDir, "answers");
        final String[] names = answers.list();
        assertTrue("no fixtures in " + answers + " (push them first)", names != null && names.length > 0);
        Arrays.sort(names);
        final Map<Long, JsonNode> subjects = new HashMap<>();
        final File subjectFile = new File(answers, "check-subjects.jsonl");
        if (subjectFile.isFile()) {
            forEachCase(subjectFile, c -> subjects.put(c.get("input").get("id").asLong(), c.get("input")));
        }
        final Map<String, Object> report = new LinkedHashMap<>();
        report.put("device", obj("sdk", Build.VERSION.SDK_INT, "release", Build.VERSION.RELEASE,
                "icuUnicode", android.icu.lang.UCharacter.getUnicodeVersion().toString(),
                "icu", android.icu.util.VersionInfo.ICU_VERSION.toString()));
        final Map<String, Object> files = new LinkedHashMap<>();
        report.put("files", files);
        int totalCases = 0;
        int totalDiffer = 0;
        try (final GoldenWriter overrides = GoldenWriter.open("answers/unicode-android-overrides.json", "answers.unicodeOverrides",
                "util/FuzzyMatching.matches, enums/QuestionType.checkAnswer on Android (cases whose device output differs"
                        + " from the JVM fixture)")) {
            for (final String name: names) {
                // Only the files of FuzzyGolden and AnswerCheckGolden; other generators' files have other shapes.
                final boolean isFuzzy = name.matches("fuzzy(-wk-\\d+)?\\.jsonl?");
                final boolean isCheck = name.equals("check-synthetic.json") || name.matches("check-(radical-name|kanji-meaning"
                        + "|kanji-reading|kanji-onyomi|kanji-kunyomi|vocab-meaning|vocab-reading|kana-vocab-meaning)-\\d+\\.jsonl");
                if (!isFuzzy && !isCheck) {
                    continue;
                }
                final FileResult r = new FileResult();
                forEachCase(new File(answers, name), c -> {
                    final JsonNode input = c.get("input");
                    final Object device = isFuzzy
                            ? fuzzy(input.get("answer").asText(), strings(input.get("accepted")), strings(input.get("rejected")))
                            : check(input, subjects);
                    final JsonNode deviceTree = JSON.valueToTree(device);
                    r.cases++;
                    if (!deviceTree.equals(c.get("output"))) {
                        r.differ++;
                        if (r.examples.size() < 20) {
                            r.examples.add(c.get("name").asText());
                        }
                        overrides.add(name + "/" + c.get("name").asText(),
                                obj("file", "answers/" + name, "case", c.get("name").asText(), "input", input), device);
                    }
                });
                files.put(name, obj("cases", r.cases, "differ", r.differ, "examples", r.examples));
                totalCases += r.cases;
                totalDiffer += r.differ;
                android.util.Log.i("UnicodeGoldenTest", name + ": " + r.cases + " cases, " + r.differ + " differ");
            }
        }
        report.put("totalCases", totalCases);
        report.put("totalDiffer", totalDiffer);
        writeReport("unicode-compare.json", report);
        assertTrue("no cases compared", totalCases > 0);
    }

    private static Subject subject(final JsonNode row, final List<String> synonyms) throws Exception {
        final SubjectEntity e = new SubjectEntity();
        e.id = row.get("id").asLong();
        e.type = SubjectType.from(row.get("object").asText());
        e.characters = row.get("characters").isNull() ? null : row.get("characters").asText();
        e.hiddenAt = row.get("hiddenAt").asLong();
        e.meanings = tree(row.get("meanings"));
        e.auxiliaryMeanings = tree(row.get("auxiliaryMeanings"));
        e.readings = tree(row.get("readings"));
        e.meaningSynonyms = synonyms.isEmpty() ? null : JSON.writeValueAsString(synonyms);
        return new Subject(e);
    }

    private static String tree(final JsonNode n) throws Exception {
        return n == null || n.isNull() ? null : JSON.writeValueAsString(n);
    }

    private static JsonNode resolve(final JsonNode ref, final Map<Long, JsonNode> subjects) {
        if (ref.isObject()) {
            return ref;
        }
        final JsonNode row = subjects.get(ref.asLong());
        if (row == null) {
            throw new IllegalStateException("subject " + ref + " not in check-subjects.jsonl");
        }
        return row;
    }

    private static Object check(final JsonNode input, final Map<Long, JsonNode> subjects) throws Exception {
        final QuestionType q = QuestionType.valueOf(input.get("questionType").asText());
        final List<String> synonyms = strings(input.get("meaningSynonyms"));
        final Subject s = subject(resolve(input.get("subject"), subjects), synonyms);
        final JsonNode mkRef = input.get("matchingKanji");
        final Subject mk = mkRef == null || mkRef.isNull() ? null
                : subject(resolve(mkRef, subjects), Collections.<String>emptyList());
        final String answer = input.get("answer").asText();
        final Map<String, Object> out = new LinkedHashMap<>();
        if (q.isMeaning()) {
            for (final CloseEnoughAction action: CloseEnoughAction.values()) {
                out.put(action.name(), safeVerdict(() -> q.checkAnswer(s, mk, answer, action, false)));
            }
        }
        else {
            for (final boolean kata: new boolean[] {false, true}) {
                out.put("requireOnInKatakana=" + kata,
                        safeVerdict(() -> q.checkAnswer(s, mk, answer, CloseEnoughAction.SILENTLY_ACCEPT, kata)));
            }
        }
        return out;
    }

    private interface CaseVisitor {
        void visit(JsonNode c) throws Exception;
    }

    /** Every case of a .json (one case per line inside "cases") or .jsonl fixture, streamed line by line. */
    private static void forEachCase(final File file, final CaseVisitor visitor) throws Exception {
        final boolean jsonl = file.getName().endsWith(".jsonl");
        try (final BufferedReader in = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8),
                1 << 16)) {
            String line;
            boolean first = true;
            while ((line = in.readLine()) != null) {
                if (jsonl) {
                    if (first) {
                        first = false;
                        continue;
                    }
                    if (!line.isEmpty()) {
                        visitor.visit(JSON.readTree(line));
                    }
                    continue;
                }
                String t = line.trim();
                if (!t.startsWith("{\"name\"")) {
                    continue;
                }
                if (t.endsWith(",")) {
                    t = t.substring(0, t.length() - 1);
                }
                visitor.visit(JSON.readTree(t));
            }
        }
    }

    private static void writeReport(final String name, final Object report) throws Exception {
        if (!reportDir.isDirectory() && !reportDir.mkdirs()) {
            throw new IllegalStateException("cannot create " + reportDir);
        }
        try (final OutputStream os = Files.newOutputStream(new File(reportDir, name).toPath())) {
            os.write(JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(report));
        }
    }

    // --- 2. targeted Unicode cases ----------------------------------------------------------------------

    private static String s(final int... cps) {
        return new String(cps, 0, cps.length);
    }

    /**
     * Single code points (or short sequences) that cleanString classifies, with a label. No lone surrogates: the
     * fixture is UTF-8 with non-ASCII unescaped, which cannot carry them (they would turn into '?'). The table
     * covers U+D800..U+DFFF (type SURROGATE, class space).
     */
    private static final Object[][] PROBES = {
            // spaces, separators, controls, format characters (all become ' ' and collapse)
            {"tab", "\t"}, {"lf", "\n"}, {"cr", "\r"}, {"nel", s(0x85)}, {"nbsp", s(0xA0)}, {"ogham-space", s(0x1680)},
            {"en-quad", s(0x2000)}, {"figure-space", s(0x2007)}, {"thin-space", s(0x2009)}, {"hair-space", s(0x200A)},
            {"zwsp", s(0x200B)}, {"zwnj", s(0x200C)}, {"zwj", s(0x200D)}, {"lrm", s(0x200E)}, {"line-sep", s(0x2028)},
            {"para-sep", s(0x2029)}, {"narrow-nbsp", s(0x202F)}, {"mmsp", s(0x205F)}, {"word-joiner", s(0x2060)},
            {"ideographic-space", s(0x3000)}, {"bom", s(0xFEFF)}, {"soft-hyphen", s(0xAD)}, {"mongolian-vs", s(0x180E)},
            {"arabic-letter-mark", s(0x61C)}, {"tag-a", s(0xE0041)}, {"private-use", s(0xE000)},
            {"private-use-plane15", s(0xF0000)}, {"noncharacter", s(0xFFFF)}, {"unassigned-0378", s(0x378)},
            {"del", s(0x7F)}, {"c1-0x9f", s(0x9F)},
            // dashes and minus signs
            {"hyphen", s(0x2010)}, {"nb-hyphen", s(0x2011)}, {"figure-dash", s(0x2012)}, {"en-dash", s(0x2013)},
            {"em-dash", s(0x2014)}, {"horizontal-bar", s(0x2015)}, {"minus", s(0x2212)}, {"small-em-dash", s(0xFE58)},
            {"small-hyphen", s(0xFE63)}, {"fullwidth-hyphen", s(0xFF0D)}, {"wave-dash", s(0x301C)},
            {"wavy-dash", s(0x3030)}, {"katakana-long-vowel", s(0x30FC)}, {"halfwidth-long-vowel", s(0xFF70)},
            {"armenian-hyphen", s(0x58A)}, {"hebrew-maqaf", s(0x5BE)}, {"two-em-dash", s(0x2E3A)}, {"double-hyphen", s(0x2E40)},
            {"yezidi-hyphen", s(0x10EAD)},
            // apostrophes and quotes
            {"apostrophe", "'"}, {"left-single", s(0x2018)}, {"right-single", s(0x2019)}, {"single-high-reversed", s(0x201B)},
            {"single-low", s(0x201A)}, {"left-double", s(0x201C)}, {"right-double", s(0x201D)}, {"double-low", s(0x201E)},
            {"modifier-apostrophe", s(0x2BC)}, {"modifier-prime", s(0x2B9)}, {"modifier-turned-comma", s(0x2BB)},
            {"grave", "`"}, {"acute", s(0xB4)}, {"prime", s(0x2032)}, {"double-prime", s(0x2033)},
            {"fullwidth-apostrophe", s(0xFF07)}, {"fullwidth-quote", s(0xFF02)}, {"guillemet-left", s(0xAB)},
            {"guillemet-right", s(0xBB)}, {"single-guillemet", s(0x2039)}, {"cjk-corner-left", s(0x300C)},
            {"cjk-corner-right", s(0x300D)}, {"cjk-double-quote", s(0x301D)}, {"hebrew-geresh", s(0x5F3)},
            // other punctuation and symbols (DASH_PUNCTUATION and above go through cleanReplace)
            {"fullwidth-comma", s(0xFF0C)}, {"ideographic-comma", s(0x3001)}, {"ideographic-full-stop", s(0x3002)},
            {"fullwidth-exclamation", s(0xFF01)}, {"fullwidth-question", s(0xFF1F)}, {"inverted-question", s(0xBF)},
            {"fullwidth-paren", s(0xFF08)}, {"fullwidth-period", s(0xFF0E)}, {"fullwidth-slash", s(0xFF0F)},
            {"middle-dot", s(0xB7)}, {"katakana-middle-dot", s(0x30FB)}, {"ellipsis", s(0x2026)}, {"bullet", s(0x2022)},
            {"degree", s(0xB0)}, {"yen", s(0xA5)}, {"fullwidth-yen", s(0xFFE5)}, {"euro", s(0x20AC)}, {"copyright", s(0xA9)},
            {"trademark", s(0x2122)}, {"plus-minus", s(0xB1)}, {"multiplication", s(0xD7)}, {"music-note", s(0x266A)},
            {"circled-1", s(0x2460)}, {"superscript-2", s(0xB2)}, {"fraction-half", s(0xBD)}, {"roman-12", s(0x216B)},
            {"small-roman-12", s(0x217B)}, {"combining-acute", s(0x301)}, {"combining-dakuten", s(0x3099)},
            {"halfwidth-dakuten", s(0xFF9E)}, {"spacing-dakuten", s(0x309B)}, {"vs16", s(0xFE0F)}, {"vs1", s(0xFE00)},
            {"enclosing-keycap", s(0x20E3)},
            // digits
            {"fullwidth-1", s(0xFF11)}, {"arabic-indic-5", s(0x665)}, {"extended-arabic-5", s(0x6F5)},
            {"devanagari-7", s(0x96D)}, {"thai-3", s(0xE53)}, {"math-bold-1", s(0x1D7CF)}, {"math-monospace-9", s(0x1D7FF)},
            {"adlam-digit-1", s(0x1E951)}, {"segmented-digit-1", s(0x1FBF1)}, {"nko-digit-2", s(0x7C2)},
            {"kawi-digit-1", s(0x11F51)}, {"nag-mundari-digit-1", s(0x1E4F1)}, {"garay-digit-1", s(0x10D41)},
            {"sunuwar-digit-1", s(0x11BF1)}, {"gurung-khema-digit-1", s(0x16131)}, {"kirat-rai-digit-1", s(0x16D71)},
            {"ol-onal-digit-1", s(0x1E5F2)}, {"outlined-digit-1", s(0x1CCF1)}, {"myanmar-pao-digit", s(0x116D1)},
            // letters: Latin with diacritics, ligatures, compatibility, case oddities
            {"e-acute", s(0xE9)}, {"e-acute-decomposed", "e" + s(0x301)}, {"a-ring", s(0xE5)}, {"angstrom-sign", s(0x212B)},
            {"kelvin-sign", s(0x212A)}, {"ohm-sign", s(0x2126)}, {"oe-ligature", s(0x152)}, {"fi-ligature", s(0xFB01)},
            {"dz-titlecase", s(0x1C5)}, {"dz-upper", s(0x1C4)}, {"long-s", s(0x17F)}, {"dotless-i", s(0x131)},
            {"capital-i-dot", s(0x130)}, {"sharp-s", s(0xDF)}, {"capital-sharp-s", s(0x1E9E)}, {"fullwidth-A", s(0xFF21)},
            {"fullwidth-a", s(0xFF41)}, {"math-bold-A", s(0x1D400)}, {"circled-A", s(0x24B6)}, {"script-h", s(0x210B)},
            {"n-tilde", s(0xF1)}, {"u-umlaut", s(0xFC)}, {"y-umlaut-capital", s(0x178)}, {"modifier-small-h", s(0x2B0)},
            {"latin-a7cb", s(0xA7CB)}, {"latin-a7cc", s(0xA7CC)}, {"latin-a7cd", s(0xA7CD)}, {"latin-a7da", s(0xA7DA)},
            {"latin-a7db", s(0xA7DB)}, {"latin-a7dc", s(0xA7DC)}, {"latin-a7c0", s(0xA7C0)}, {"latin-a7d0", s(0xA7D0)},
            // Greek, Cyrillic and other cased scripts
            {"capital-sigma", s(0x3A3)}, {"small-sigma", s(0x3C3)}, {"final-sigma", s(0x3C2)}, {"capital-omega", s(0x3A9)},
            {"iota-dialytika-tonos", s(0x390)}, {"greek-capital-alpha-tonos", s(0x386)}, {"capital-theta-symbol", s(0x3F4)},
            {"cyrillic-capital-zhe", s(0x416)}, {"cyrillic-1c89", s(0x1C89)}, {"cyrillic-1c8a", s(0x1C8A)},
            {"georgian-mtavruli-an", s(0x1C90)}, {"cherokee-a", s(0x13A0)}, {"cherokee-small-a", s(0xAB70)},
            {"armenian-capital-ayb", s(0x531)}, {"glagolitic-capital-az", s(0x2C00)}, {"osage-capital-a", s(0x104B0)},
            {"adlam-capital-alif", s(0x1E900)}, {"garay-capital-a", s(0x10D50)}, {"garay-small-a", s(0x10D70)},
            {"vithkuqi-capital-a", s(0x10570)}, {"deseret-capital-long-i", s(0x10400)}, {"old-hungarian-capital-a", s(0x10C80)},
            // CJK, kana
            {"hiragana-a", s(0x3042)}, {"katakana-a", s(0x30A2)}, {"halfwidth-katakana-a", s(0xFF71)},
            {"kanji-one", s(0x4E00)}, {"cjk-ext-b", s(0x20000)}, {"cjk-ext-g", s(0x30000)}, {"cjk-ext-h", s(0x31350)},
            {"cjk-ext-i", s(0x2EBF0)}, {"cjk-ext-h-end", s(0x323AF)}, {"candidate-323b0", s(0x323B0)}, {"ids-2ffc", s(0x2FFC)}, {"cjk-stroke-31ef", s(0x31EF)},
            {"iteration-mark", s(0x3005)}, {"kana-supplement", s(0x1B000)}, {"small-kana-ext", s(0x1B132)},
            {"kana-ext-b", s(0x1AFF0)}, {"square-kanji", s(0x3300)}, {"circled-ideograph", s(0x3280)},
            // emoji, old and new
            {"grinning", s(0x1F600)}, {"thumbs-up-medium", s(0x1F44D, 0x1F3FD)}, {"skin-tone", s(0x1F3FD)},
            {"family-zwj", s(0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467)}, {"flag-jp", s(0x1F1EF, 0x1F1F5)},
            {"heart-vs16", s(0x2764, 0xFE0F)}, {"keycap-1", s(0x31, 0xFE0F, 0x20E3)}, {"emoji-15-shaking", s(0x1FAE8)},
            {"emoji-15-1-phoenix", s(0x1F426, 0x200D, 0x1F525)}, {"emoji-16-bags", s(0x1FAE9)},
            {"emoji-16-fingerprint", s(0x1FAC6)}, {"emoji-16-harp", s(0x1FA89)}, {"emoji-16-shovel", s(0x1FA8F)},
            {"emoji-16-splatter", s(0x1FADF)}, {"emoji-16-leafless-tree", s(0x1FABE)}, {"emoji-candidate-1fa8a", s(0x1FA8A)},
            {"emoji-candidate-1fac8", s(0x1FAC8)}, {"emoji-candidate-1facd", s(0x1FACD)}, {"emoji-tag-england",
                    s(0x1F3F4, 0xE0067, 0xE0062, 0xE0065, 0xE006E, 0xE0067, 0xE007F)},
            // scripts and symbols new in Unicode 15.1 / 16.0 / 17.0 (JDK 21 has 15.0)
            {"legacy-computing-supplement", s(0x1CC00)}, {"legacy-computing-1cc21", s(0x1CC21)},
            {"egyptian-ext-a", s(0x13460)}, {"todhri-a", s(0x105C0)}, {"tulu-tigalari-a", s(0x11380)},
            {"sunuwar-a", s(0x11BC0)}, {"gurung-khema-a", s(0x16100)}, {"kirat-rai-a", s(0x16D43)},
            {"ol-onal-a", s(0x1E5D0)}, {"myanmar-ext-c", s(0x116D0)}, {"symbols-arrows-c-1f8c0", s(0x1F8C0)},
            {"candidate-10940", s(0x10940)}, {"candidate-11db0", s(0x11DB0)}, {"candidate-16ea0", s(0x16EA0)},
            {"candidate-1e6c0", s(0x1E6C0)}, {"candidate-31350", s(0x31350)}, {"candidate-a7f1", s(0xA7F1)},
            {"candidate-10ec5", s(0x10EC5)}, {"candidate-1ac0", s(0x1AC0)}, {"candidate-1acf", s(0x1ACF)},
            {"candidate-1ade", s(0x1ADE)}, {"candidate-18d09", s(0x18D09)},
    };

    /** Whole-answer cases: answer, accepted (| separated), rejected (| separated). */
    private static final String[][] HAND = {
            {"cafe", "café", ""},
            {"café", "cafe", ""},
            {"cafe" + s(0x301), "café", ""},
            {"café", "cafe" + s(0x301), ""},
            {"naive", "naïve", ""},
            {"resume", "résumé", ""},
            {"ＯＮＥ", "one", ""},
            {"ｏｎｅ", "one", ""},
            {"ｏｎｅ　ｔｗｏ", "one two", ""},
            {"１０", "10", ""},
            {"（one）", "(one)", ""},
            {"one！", "one!", ""},
            {"to" + s(0x3000) + "be", "to be", ""},
            {"to" + s(0xA0) + "be", "to be", ""},
            {"to" + s(0x200B) + "be", "to be", ""},
            {"to" + s(0x200B) + "be", "tobe", ""},
            {"to" + s(0x2028) + "be", "to be", ""},
            {"mother" + s(0x2011) + "in" + s(0x2011) + "law", "mother-in-law", ""},
            {"mother" + s(0x2212) + "in" + s(0x2212) + "law", "mother-in-law", ""},
            {"mother" + s(0xFF0D) + "in" + s(0xFF0D) + "law", "mother-in-law", ""},
            {"mother" + s(0x30FC) + "in" + s(0x30FC) + "law", "mother-in-law", ""},
            {"o" + s(0x2BC) + "clock", "o'clock", ""},
            {"o" + s(0x201B) + "clock", "o'clock", ""},
            {"o" + s(0xFF07) + "clock", "o'clock", ""},
            {"o`clock", "o'clock", ""},
            {"o" + s(0xB4) + "clock", "o'clock", ""},
            {"o" + s(0x2032) + "clock", "o'clock", ""},
            {s(0x201E) + "quote" + s(0x201C), "\"quote\"", ""},
            {s(0xAB) + "quote" + s(0xBB), "\"quote\"", ""},
            {"İstanbul", "istanbul", ""},
            {"ISTANBUL", "istanbul", ""},
            {"ıstanbul", "istanbul", ""},
            {"DİYARBAKIR", "diyarbakır", ""},
            {"İ", "i", ""},
            {"STRASSE", "straße", ""},
            {"STRAẞE", "straße", ""},
            {"strasse", "STRAẞE", ""},
            {"ΟΔΟΣ", "οδος", ""},
            {"ΟΔΟΣ", "οδοσ", ""},
            {"ΟΔΟΣ", "οδος", "οδοσ"},
            {"Σ", "σ", ""},
            {"Σ", "ς", ""},
            {"ΣΑ", "σα", ""},
            {"Α Σ", "α ς", ""},
            {"ΑΣ.", "ας.", ""},
            {"ΑΣ" + s(0x301), "ας" + s(0x301), ""},
            {"ΑΣ" + s(0x301), "ασ" + s(0x301), ""},
            {"ὈΔΥΣΣΕΎΣ", "ὀδυσσεύς", ""},
            {"ΑΣ'Α", "ας'α", ""},
            {"ΑΣ'Α", "ασ'α", ""},
            {"Α'Σ", "α'ς", ""},
            {"Α'Σ", "α'σ", ""},
            {"ΑΣ" + s(0x301) + "Α", "ασ" + s(0x301) + "α", ""},
            {"ΑΣ'Α" + s(0x1F600), "ασ'α" + s(0x1F600), ""},
            {"ΐ", "ΐ", ""},
            {"ПРИВЕТ", "привет", ""},
            {s(0x1C90) + s(0x1C91), s(0x10D0) + s(0x10D1), ""},
            {s(0x13A0) + s(0x13A1), s(0xAB70) + s(0xAB71), ""},
            {s(0x1C89), s(0x1C8A), ""},
            {s(0xA7CB), s(0x264), ""},
            {s(0xA7CC), s(0xA7CD), ""},
            {s(0xA7DC), s(0x19B), ""},
            {s(0x10D50), s(0x10D70), ""},
            {s(0x212B) + "ngstrom", "ångström", ""},
            {s(0x212A) + "elvin", "kelvin", ""},
            {s(0x1C4), s(0x1C6), ""},
            {s(0x1C5), s(0x1C6), ""},
            {s(0x216B), s(0x217B), ""},
            {s(0x24B6), s(0x24D0), ""},
            {"ﬁne", "fine", ""},
            {"Œuvre", "œuvre", ""},
            {"ｱｲ", "アイ", ""},
            {"アイ", "あい", ""},
            {"ガ", "ガ", ""},
            {"ｶﾞ", "ガ", ""},
            {"👍" + s(0x1F3FD), "👍", ""},
            {s(0x1F468, 0x200D, 0x1F469), s(0x1F468) + " " + s(0x1F469), ""},
            {"❤️", "❤", ""},
            {s(0x1FAE9), s(0x1FAE9), ""},
            {s(0x1FAE9), "", ""},
            {"one" + s(0x1FAE9), "one", ""},
            {"one" + s(0x2EBF0), "one", ""},
            {"one" + s(0x1CC00), "one", ""},
            {"one" + s(0x10D41), "one1", ""},
            {"one" + s(0x1E5F2), "one1", ""},
            {s(0x1E951) + s(0x1E950), "10", ""},
            {s(0x1D7CF) + s(0x1D7CE), "10", ""},
            {s(0x0378) + "one", "one", ""},
            {s(0xE000) + "one", "one", ""},
            {"one" + s(0xFEFF), "one", ""},
            {"one" + s(0xAD) + "two", "onetwo", ""},
            {"one" + s(0xAD) + "two", "one two", ""},
    };

    @Test
    public void targetedCases() throws Exception {
        try (final GoldenWriter w = GoldenWriter.open("answers/unicode-android.json", "answers.unicode",
                "util/FuzzyMatching.cleanString (private, via reflection) and FuzzyMatching.matches on Android (ART + ICU "
                        + android.icu.util.VersionInfo.ICU_VERSION + ", Unicode " + android.icu.lang.UCharacter.getUnicodeVersion()
                        + ", API " + Build.VERSION.SDK_INT + ")")) {
            for (final Object[] p: PROBES) {
                final String label = (String) p[0];
                final String probe = (String) p[1];
                add(w, "probe-" + label + "-alone", probe, Collections.singletonList(probe), Collections.<String>emptyList());
                add(w, "probe-" + label + "-between", "one" + probe + "two", Collections.singletonList("one two"),
                        Collections.<String>emptyList());
                add(w, "probe-" + label + "-upper", probe.toUpperCase(Locale.ROOT) + "A", Collections.singletonList(probe + "a"),
                        Collections.<String>emptyList());
            }
            for (int i = 0; i < HAND.length; i++) {
                add(w, "hand-" + (i + 1), HAND[i][0], split(HAND[i][1]), split(HAND[i][2]));
            }
        }
    }

    private static void add(final GoldenWriter w, final String name, final String answer, final List<String> accepted,
                            final List<String> rejected) {
        final List<String> acceptedClean = new ArrayList<>();
        for (final String a: accepted) {
            acceptedClean.add(clean(a));
        }
        final List<String> rejectedClean = new ArrayList<>();
        for (final String r: rejected) {
            rejectedClean.add(clean(r));
        }
        w.add(name, obj("answer", answer, "accepted", accepted, "rejected", rejected),
                obj("cleanString", obj("answer", clean(answer), "accepted", acceptedClean, "rejected", rejectedClean),
                        "matches", fuzzy(answer, accepted, rejected)));
    }

    private static List<String> split(final String s) {
        return s.isEmpty() ? Collections.<String>emptyList() : Arrays.asList(s.split("\\|"));
    }

    // --- 3. per code point table --------------------------------------------------------------------------

    /** cleanString's treatment of a code point by its general category: space, replace (cleanReplace) or keep. */
    static String cleanClass(final int type) {
        if (type == 0 || type >= Character.SPACE_SEPARATOR && type <= Character.SURROGATE) {
            return "space";
        }
        if (type == Character.DECIMAL_DIGIT_NUMBER || type >= Character.DASH_PUNCTUATION) {
            return "replace";
        }
        return "keep";
    }

    @Test
    public void cleanStringTable() throws Exception {
        try (final GoldenWriter w = GoldenWriter.open("answers/unicode-android-table.json", "answers.unicodeTable",
                "Character.getType and String.toLowerCase(Locale.ENGLISH) as util/FuzzyMatching.cleanString uses them, on Android"
                        + " (ICU " + android.icu.util.VersionInfo.ICU_VERSION + ", Unicode " + android.icu.lang.UCharacter.getUnicodeVersion()
                        + ", API " + Build.VERSION.SDK_INT + ")")) {
            // Runs of code points with the same Character.getType (the class follows from the type).
            int start = 0;
            int type = Character.getType(0);
            for (int cp = 1; cp <= Character.MAX_CODE_POINT + 1; cp++) {
                final int t = cp <= Character.MAX_CODE_POINT ? Character.getType(cp) : -1;
                if (t != type) {
                    w.add(String.format(Locale.ROOT, "type-%04X-%04X", start, cp - 1),
                            obj("from", start, "to", cp - 1), obj("type", type, "class", cleanClass(type)));
                    start = cp;
                    type = t;
                }
            }
            // Code points that toLowerCase(Locale.ENGLISH) changes when they stand alone.
            for (int cp = 0; cp <= Character.MAX_CODE_POINT; cp++) {
                if (cp >= 0xD800 && cp <= 0xDFFF) {
                    continue;
                }
                final String one = s(cp);
                final String lower = one.toLowerCase(Locale.ENGLISH);
                if (!lower.equals(one)) {
                    w.add(String.format(Locale.ROOT, "lower-%04X", cp), obj("codePoint", cp, "string", one),
                            obj("lower", lower));
                }
            }
            // Context-dependent lower-casing (final sigma) and whole-string cleanString.
            final String[] context = {"Σ", "ΑΣ", "ΣΑ", "ΑΣΑ", "Α Σ", "ΑΣ.", "ΑΣ'Α", "ΑΣ" + s(0x301), "ΑΣ" + s(0x301) + "Α",
                    "ΑΣ" + s(0xAD), "ΑΣ" + s(0xAD) + "Α", "ΑΣ1", "ΑΣ" + s(0x1D7CF), "ΑΣΣ", "ὈΔΥΣΣΕΎΣ", "İ", "İstanbul", "Iİı",
                    "ẞ", "STRAẞE", "ǅ", s(0x10D50) + "Σ", s(0x1C89) + "Σ",
                    // Final sigma: neighbours only, case-ignorables between, and strings that contain a
                    // supplementary character or U+0130 (which may take a different lower-casing path).
                    "Α'Σ", "Α'Σ" + s(0x1F600), "ΑΣ'Α" + s(0x1F600), "ΑΣ'Αİ", "Α'Σİ", "ΑΣ" + s(0x301) + "Α" + s(0x1F600),
                    "Α" + s(0x301) + "Σ", "Α" + s(0x301) + "Σ" + s(0x1F600), "1Σ", "ǅΣ", "ΑΣǅ", "ΑΣ" + s(0x2B0),
                    "ΑΣ" + s(0x1D400), "ΑΣ" + s(0x10D70), s(0x1D400) + "Σ", "ΑΣ1Α", "ΑΣ Α", "ΑΣ-Α", "ΑΣ.Α", "ΑΣ:Α",
                    "ΑΣ" + s(0xB7) + "Α", "ΑΣ" + s(0x2019) + "Α", "ΑΣ" + s(0x200D) + "Α", "ΑΣ" + s(0x2BC) + "Α",
                    "ΑΣΣ'Α", "ΑΣ'" + s(0x1F600), "ΑΣ" + s(0x1F600) + "Α", "ὈΔΥΣΣΕΎΣ'Α"};
            for (int i = 0; i < context.length; i++) {
                w.add("context-" + (i + 1), obj("string", context[i]),
                        obj("lower", context[i].toLowerCase(Locale.ENGLISH), "cleanString", clean(context[i])));
            }
        }
    }
}
