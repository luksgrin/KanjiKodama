package com.smouldering_durtles.wk.golden;

import android.text.Editable;

import com.fasterxml.jackson.databind.JsonNode;
import com.smouldering_durtles.wk.util.KanaUtil;
import com.smouldering_durtles.wk.util.PseudoIme;

import org.junit.Assume;
import org.junit.Test;

import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.attempt;
import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.romanize;
import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static org.junit.Assert.assertEquals;

/**
 * Golden cases for romaji to kana ({@link PseudoIme#simulateInput}, {@link PseudoIme#fixup}) and the
 * kana conversions ({@link PseudoIme#toKatakana}, {@link KanaUtil#convertKatakanaToHiragana}).
 *
 * <p>{@code fixup} sequences run against PseudoIme's own private {@code DummyEditable} (the class
 * {@code simulateInput} uses), created by reflection. They model the app's TextWatcher: after each
 * edit, {@code fixup(s, start, start + insertedLength)} runs once. The real EditText also calls the
 * watcher again for the replacements fixup itself makes; that re-entrancy is not modelled here.</p>
 */
public final class KanaGolden {
    private static final String[] HAND = {
            "n", "nn", "nnn", "nnnn", "n'", "n'a", "na", "nna", "nya", "nyn", "ny", "kan", "kana", "kanna", "kanji",
            "kannji", "kanzi", "shinbun", "shimbun", "sanpo", "onna", "onnna", "konnichiha", "konnnichiha", "kinou",
            "kin'you", "kinnyou", "kinyou", "hon", "honn", "hon ", "ho n", "n n", "xn", "xnn", "kn", "nk", "nka",
            "kitte", "itta", "kko", "cchi", "tchi", "matcha", "maccha", "xtsu", "xtu", "ltu", "ltsu", "ltsuka",
            "kka", "ssa", "tta", "ppa", "mma", "rra", "lla", "wwa", "vvu", "qqa", "hhi", "yya", "jjo", "zzi", "ffu",
            "ggu", "bba", "dda", "xxa", "aa", "ii", "-", "--", "ra-men", "RA-MEN", "ra-", "-ka", "kya-", "ー",
            "Kanji", "KaNji", "KANJI", "KYOU", "Kyou", "kYOU", "SHI", "sHI", "NN", "Nn", "nN", "N", "NA", "Na",
            "toukyou", "tokyo", "tookyoo", "oosaka", "ohayou", "arigatou", "ojiisan", "chotto", "shashin",
            "dhi", "thi", "fyu", "fa", "wi", "we", "wo", "whu", "ye", "yi", "wu", "la", "lyo", "lka", "xke", "xwa",
            "lwe", "vu", "va", "qa", "qwa", "kwa", "tsa", "dwu", "twu", "v", "q", "x", "l", "c", "k", "s",
            "o'", "a.b", "a,b", "1", "1ka", "ka1", "a b", "a  b", "  ka", "ka ", "\tka", "ka\t", "ka\nna", "ka　na",
            "!", "?", "ka!", "ka?", "😀", "ka😀", "", " ", "あ", "かa", "kあ", "kaあ", "カka", "KAか", "é", "kaé",
            "shya", "chya", "jya", "cya", "tya", "syo", "zyo", "dyu", "hyu", "byo", "pyo", "myu", "ryo", "gyo",
            "kyu", "qyu", "fyo", "vyo", "sha", "cha", "ja", "ju", "jo", "she", "che", "je", "xya", "xyu", "xyo",
            "nyaa", "nnya", "nnnya", "kannya", "kanya", "senpai", "sempai", "anna", "ann", "an", "nanana",
            "konnbanha", "konbanwa", "dekinai", "shinjuku", "shinnjuku", "tenpura", "tempura", "gakkou", "zasshi",
            "kekkon", "kekkonn", "hikkoshi", "ippun", "ippunn", "rokkaku", "sutoraiki", "SUTORAIKI", "suto-bu",
    };

    @Test
    public void table() throws Exception {
        assertEquals("きょうは", PseudoIme.simulateInput("kyouha"));
        try (final GoldenWriter w = GoldenWriter.open("kana/table.json", "kana.table",
                "util/PseudoIme.KANA_MAP via simulateInput")) {
            for (final Map.Entry<String, String> e: AnswerGoldenSupport.kanaMap().entrySet()) {
                final String key = e.getKey();
                w.add("key-" + key, obj("romaji", key),
                        obj("mapValue", e.getValue(), "simulateInput", attempt(() -> PseudoIme.simulateInput(key))));
            }
        }
    }

    @Test
    public void edge() throws Exception {
        final Set<String> inputs = new LinkedHashSet<>();
        for (final String s: HAND) {
            inputs.add(s);
        }
        for (char a = 'a'; a <= 'z'; a++) {
            for (char b = 'a'; b <= 'z'; b++) {
                inputs.add("" + a + b);
            }
        }
        final Random random = new Random(42L);
        final String letters = "aiueoaiueokstnhmyrwgzdbpnnfjcxlvq-' ";
        while (inputs.size() < HAND.length + 676 + 300) {
            final StringBuilder sb = new StringBuilder();
            final int len = 2 + random.nextInt(7);
            for (int i = 0; i < len; i++) {
                final char c = letters.charAt(random.nextInt(letters.length()));
                sb.append(random.nextInt(10) == 0 ? Character.toUpperCase(c) : c);
            }
            inputs.add(sb.toString());
        }
        try (final GoldenWriter w = GoldenWriter.open("kana/edge.json", "kana.edge", "util/PseudoIme.simulateInput")) {
            int i = 0;
            for (final String s: inputs) {
                i++;
                w.add("edge-" + i, obj("romaji", s), obj("simulateInput", attempt(() -> PseudoIme.simulateInput(s))));
            }
        }
    }

    @Test
    public void conversions() throws Exception {
        try (final GoldenWriter w = GoldenWriter.open("kana/convert.json", "kana.convert",
                "util/PseudoIme.toKatakana, util/KanaUtil.convertKatakanaToHiragana")) {
            final List<int[]> ranges = new ArrayList<>();
            ranges.add(new int[] {0x3000, 0x30FF});
            ranges.add(new int[] {0xFF00, 0xFFEF});
            ranges.add(new int[] {0x20, 0x7E});
            for (final int[] r: ranges) {
                for (int c = r[0]; c <= r[1]; c++) {
                    final String s = String.valueOf((char) c);
                    w.add(String.format(Locale.ROOT, "U+%04X", c), obj("text", s), obj(
                            "toKatakana", PseudoIme.toKatakana(s),
                            "convertKatakanaToHiragana", KanaUtil.convertKatakanaToHiragana(s)));
                }
            }
            final String[] strings = {"", "ひらがな", "カタカナ", "ﾊﾝｶｸ", "ｶﾞ", "まぜカナ", "ヴ", "ゔ", "ヵヶ", "ゕゖ", "ー", "〜です", "一つ", "abc"};
            for (int i = 0; i < strings.length; i++) {
                final String s = strings[i];
                w.add("string-" + (i + 1), obj("text", s), obj(
                        "toKatakana", PseudoIme.toKatakana(s),
                        "convertKatakanaToHiragana", KanaUtil.convertKatakanaToHiragana(s)));
            }
        }
    }

    @Test
    public void readings() throws Exception {
        Assume.assumeTrue("content DB missing", GoldenContent.available());
        final JsonNode rows = GoldenContent.query("SELECT DISTINCT json_extract(value, '$.reading') AS reading"
                + " FROM subject, json_each(subject.readings) ORDER BY reading");
        final JsonNode kanaVocab = GoldenContent.query("SELECT DISTINCT characters AS reading FROM subject"
                + " WHERE object = 'kana_vocabulary' ORDER BY reading");
        final Set<String> readings = new LinkedHashSet<>();
        for (final JsonNode row: rows) {
            readings.add(row.get("reading").asText());
        }
        for (final JsonNode row: kanaVocab) {
            readings.add(row.get("reading").asText());
        }
        try (final GoldenWriter w = GoldenWriter.openJsonl("kana/readings.jsonl", "kana.readings",
                "util/PseudoIme.simulateInput, toKatakana; util/KanaUtil.convertKatakanaToHiragana")) {
            int i = 0;
            for (final String reading: readings) {
                i++;
                final String romaji = romanize(reading);
                final String katakana = PseudoIme.toKatakana(reading);
                final String romajiUpper = romanize(katakana);
                w.add("reading-" + i, obj("reading", reading, "romaji", romaji, "romajiKatakana", romajiUpper), obj(
                        "simulateInput", attempt(() -> PseudoIme.simulateInput(romaji)),
                        "simulateInputKatakana", attempt(() -> PseudoIme.simulateInput(romajiUpper)),
                        "toKatakana", katakana,
                        "convertKatakanaToHiragana", KanaUtil.convertKatakanaToHiragana(katakana)));
            }
        }
    }

    @Test
    public void fixupSequences() throws Exception {
        final List<String> words = new ArrayList<>();
        if (GoldenContent.available()) {
            final JsonNode rows = GoldenContent.query("SELECT DISTINCT json_extract(value, '$.reading') AS reading"
                    + " FROM subject, json_each(subject.readings) ORDER BY reading");
            for (final JsonNode row: rows) {
                words.add(row.get("reading").asText());
            }
        }
        final Random random = new Random(7L);
        try (final GoldenWriter w = GoldenWriter.open("kana/fixup-sequences.json", "kana.fixup",
                "util/PseudoIme.fixup (DummyEditable, one call per edit)")) {
            for (int n = 0; n < 200; n++) {
                final String typed;
                if (n < HAND.length && n < 80) {
                    typed = HAND[n];
                }
                else if (!words.isEmpty() && n % 2 == 0) {
                    typed = romanize(words.get(random.nextInt(words.size())));
                }
                else {
                    typed = HAND[random.nextInt(HAND.length)] + HAND[random.nextInt(HAND.length)];
                }
                final List<Map<String, Object>> edits = edits(typed, n, random);
                final Editable s = dummyEditable("");
                final List<Object> steps = new ArrayList<>();
                for (final Map<String, Object> edit: edits) {
                    steps.add(apply(s, edit));
                }
                w.add("seq-" + (n + 1), obj("edits", edits), obj("after", steps));
            }
        }
    }

    /**
     * The edits for one sequence: mostly one key at a time at the end; every 5th sequence pastes a
     * chunk, every 7th backspaces once in the middle, every 11th inserts in the middle.
     */
    private static List<Map<String, Object>> edits(final String typed, final int n, final Random random) {
        final List<Map<String, Object>> edits = new ArrayList<>();
        int i = 0;
        int length = 0;
        while (i < typed.length()) {
            final int chunk = n % 5 == 4 ? Math.min(typed.length() - i, 1 + random.nextInt(4)) : 1;
            edits.add(obj("insert", typed.substring(i, i + chunk), "at", -1));
            i += chunk;
            length += chunk;
            if (n % 7 == 6 && i == typed.length() / 2 && length > 0) {
                edits.add(obj("backspace", true));
            }
        }
        if (n % 11 == 10) {
            edits.add(obj("insert", "n", "at", 0));
            edits.add(obj("insert", "a", "at", 1));
        }
        return edits;
    }

    /** Apply an edit like the TextWatcher would see it, then run fixup on the inserted range; returns the text. */
    private static Object apply(final Editable s, final Map<String, Object> edit) {
        return attempt(() -> {
            if (edit.containsKey("backspace")) {
                if (s.length() > 0) {
                    s.delete(s.length() - 1, s.length());
                    PseudoIme.fixup(s, s.length(), s.length());
                }
                return s.toString();
            }
            final String text = (String) edit.get("insert");
            final int at = (Integer) edit.get("at") < 0 ? s.length() : Math.min((Integer) edit.get("at"), s.length());
            s.insert(at, text);
            PseudoIme.fixup(s, at, at + text.length());
            return s.toString();
        });
    }

    private static Editable dummyEditable(final String value) throws Exception {
        final Class<?> c = Class.forName("com.smouldering_durtles.wk.util.PseudoIme$DummyEditable");
        final Constructor<?> ctor = c.getDeclaredConstructor(String.class);
        ctor.setAccessible(true);
        return (Editable) ctor.newInstance(value);
    }
}
