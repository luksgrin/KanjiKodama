package com.smouldering_durtles.wk.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.util.FuzzyMatching;

import org.junit.Assume;
import org.junit.Test;

import java.io.File;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.verdict;
import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;

/**
 * Not a generator: compares the device-made Unicode fixtures ({@code answers/unicode-android.json},
 * {@code answers/unicode-android-table.json}, written by the Tier B {@code UnicodeGoldenTest}) with what the JVM
 * running this test computes for the same inputs, and writes the differences to
 * {@code build/golden-unicode/jvm-vs-android.json}. It never fails on a difference: the device is authoritative,
 * this only shows where a JVM (or a port that follows the JVM's Unicode tables) would go wrong.
 */
public final class UnicodeAndroidCompare {
    private static final ObjectMapper JSON = new ObjectMapper();

    private static File fixture(final String name) {
        return new File("../../web/test/golden/answers/" + name);
    }

    private static String clean(final String s) throws Exception {
        final Method m = FuzzyMatching.class.getDeclaredMethod("cleanString", String.class);
        m.setAccessible(true);
        return (String) m.invoke(null, s);
    }

    private static List<String> strings(final JsonNode array) {
        final List<String> result = new ArrayList<>();
        for (final JsonNode n: array) {
            result.add(n.asText());
        }
        return result;
    }

    @Test
    public void compare() throws Exception {
        final File cases = fixture("unicode-android.json");
        final File table = fixture("unicode-android-table.json");
        Assume.assumeTrue("device fixtures missing", cases.isFile() && table.isFile());
        final Map<String, Object> report = new LinkedHashMap<>();
        report.put("jvm", obj("java.version", System.getProperty("java.version"),
                "unicode", "see Character javadoc of this JDK"));

        // Targeted cases.
        final List<Object> caseDiffs = new ArrayList<>();
        int caseCount = 0;
        for (final JsonNode c: JSON.readTree(cases).get("cases")) {
            caseCount++;
            final JsonNode in = c.get("input");
            final String answer = in.get("answer").asText();
            final List<String> accepted = strings(in.get("accepted"));
            final List<String> rejected = strings(in.get("rejected"));
            final List<String> ac = new ArrayList<>();
            for (final String a: accepted) {
                ac.add(clean(a));
            }
            final List<String> rc = new ArrayList<>();
            for (final String r: rejected) {
                rc.add(clean(r));
            }
            final Map<String, Object> matches = new LinkedHashMap<>();
            for (final CloseEnoughAction action: CloseEnoughAction.values()) {
                matches.put(action.name(), verdict(FuzzyMatching.matches(answer, accepted, rejected, action)));
            }
            final JsonNode jvm = JSON.valueToTree(obj("cleanString", obj("answer", clean(answer), "accepted", ac, "rejected", rc),
                    "matches", matches));
            if (!jvm.equals(c.get("output"))) {
                caseDiffs.add(obj("name", c.get("name").asText(), "input", in, "android", c.get("output"), "jvm", jvm,
                        "verdictsDiffer", !jvm.get("matches").equals(c.get("output").get("matches"))));
            }
        }
        int verdictDiffs = 0;
        for (final Object d: caseDiffs) {
            if ((Boolean) ((Map<?, ?>) d).get("verdictsDiffer")) {
                verdictDiffs++;
            }
        }
        report.put("targeted", obj("cases", caseCount, "differ", caseDiffs.size(), "verdictsDiffer", verdictDiffs,
                "diffs", caseDiffs));

        // Per code point table.
        final int[] androidType = new int[Character.MAX_CODE_POINT + 1];
        final Map<Integer, String> androidLower = new LinkedHashMap<>();
        final List<Object> contextDiffs = new ArrayList<>();
        for (final JsonNode c: JSON.readTree(table).get("cases")) {
            final String name = c.get("name").asText();
            final JsonNode in = c.get("input");
            final JsonNode out = c.get("output");
            if (name.startsWith("type-")) {
                for (int cp = in.get("from").asInt(); cp <= in.get("to").asInt(); cp++) {
                    androidType[cp] = out.get("type").asInt();
                }
            }
            else if (name.startsWith("lower-")) {
                androidLower.put(in.get("codePoint").asInt(), out.get("lower").asText());
            }
            else {
                final String s = in.get("string").asText();
                final JsonNode jvm = JSON.valueToTree(obj("lower", s.toLowerCase(Locale.ENGLISH), "cleanString", clean(s)));
                if (!jvm.equals(out)) {
                    contextDiffs.add(obj("name", name, "string", s, "android", out, "jvm", jvm));
                }
            }
        }
        final List<Object> typeDiffs = new ArrayList<>();
        int typeDiffCount = 0;
        int classDiffCount = 0;
        final List<Object> lowerDiffs = new ArrayList<>();
        for (int cp = 0; cp <= Character.MAX_CODE_POINT; cp++) {
            final int jt = Character.getType(cp);
            if (jt != androidType[cp]) {
                typeDiffCount++;
                final String ja = cleanClass(jt);
                final String aa = cleanClass(androidType[cp]);
                if (!ja.equals(aa)) {
                    classDiffCount++;
                }
                typeDiffs.add(obj("codePoint", String.format(Locale.ROOT, "U+%04X", cp), "jvmType", jt,
                        "androidType", androidType[cp], "jvmClass", ja, "androidClass", aa));
            }
            if (cp >= 0xD800 && cp <= 0xDFFF) {
                continue;
            }
            final String one = new String(Character.toChars(cp));
            final String jl = one.toLowerCase(Locale.ENGLISH);
            final String al = androidLower.getOrDefault(cp, one);
            if (!jl.equals(al)) {
                lowerDiffs.add(obj("codePoint", String.format(Locale.ROOT, "U+%04X", cp), "jvm", jl, "android", al));
            }
        }
        report.put("table", obj("typeDiffers", typeDiffCount, "cleanClassDiffers", classDiffCount,
                "lowerDiffers", lowerDiffs.size(), "contextDiffers", contextDiffs.size(),
                "lowerDiffs", lowerDiffs, "contextDiffs", contextDiffs, "typeDiffs", typeDiffs));

        final File out = new File("build/golden-unicode/jvm-vs-android.json");
        //noinspection ResultOfMethodCallIgnored
        out.getParentFile().mkdirs();
        JSON.writerWithDefaultPrettyPrinter().writeValue(out, report);
        System.out.println("UnicodeAndroidCompare: targeted " + caseDiffs.size() + "/" + caseCount + " differ ("
                + verdictDiffs + " in verdicts); code points: type " + typeDiffCount + ", cleanString class " + classDiffCount
                + ", lower " + lowerDiffs.size() + ", context " + contextDiffs.size() + " -> " + out.getAbsolutePath());
    }

    private static String cleanClass(final int type) {
        if (type == 0 || type >= Character.SPACE_SEPARATOR && type <= Character.SURROGATE) {
            return "space";
        }
        if (type == Character.DECIMAL_DIGIT_NUMBER || type >= Character.DASH_PUNCTUATION) {
            return "replace";
        }
        return "keep";
    }
}
