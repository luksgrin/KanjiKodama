package com.smouldering_durtles.wk.golden;

import com.smouldering_durtles.wk.util.InflectionUtil;

import org.junit.After;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.function.DoubleSupplier;

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static org.junit.Assert.assertEquals;

/**
 * Golden cases for the random picks behind "randomize inflections" ({@link InflectionUtil#getRandomVerbConjugation},
 * {@link InflectionUtil#getRandomAdjectiveDeclension}): {@code (int) (d * map.size())} indexes the endings map's
 * {@code HashMap} key order, with {@code d} from the {@code setRandomSourceForTesting} seam (Math.random() in the app).
 *
 * <p>{@code doubles/*}: input {kind, doubles}, the doubles fed in order; {@code doubles/<kind>-key-order} feeds
 * {@code (k + 0.5) / size} for every k, so its picks are the whole key order. {@code seed/*}: input {seed, kinds}, one
 * {@code new Random(seed)} shared by all picks (like Math.random's single generator). Every output lists per pick
 * {@code name} and the forms of some sample words ({@code getConjugatedVerb} / {@code getDeclinedAdjective}).</p>
 */
public final class InflectionGolden {
    private static final String[][] VERBS = {{"飲む", "GODAN"}, {"食べる", "ICHIDAN"}, {"勉強する", "SURU"}};
    private static final String[][] ADJECTIVES = {{"大きい", "I"}, {"静か", "NA_PLAIN"}, {"静か", "NA_POLITE"}};

    @After
    public void restore() {
        InflectionUtil.setRandomSourceForTesting(null);
    }

    private static Map<String, Object> pick(final String kind) {
        if ("verb".equals(kind)) {
            final String name = InflectionUtil.getRandomVerbConjugation();
            final List<Object> forms = new ArrayList<>();
            for (final String[] v: VERBS) {
                forms.add(InflectionUtil.getConjugatedVerb(v[0], InflectionUtil.VerbType.valueOf(v[1]), name));
            }
            return obj("name", name, "forms", forms);
        }
        final String name = InflectionUtil.getRandomAdjectiveDeclension();
        final List<Object> forms = new ArrayList<>();
        for (final String[] a: ADJECTIVES) {
            forms.add(InflectionUtil.getDeclinedAdjective(a[0], InflectionUtil.AdjectiveType.valueOf(a[1]), name));
        }
        return obj("name", name, "forms", forms);
    }

    private static void doubles(final GoldenWriter w, final String name, final String kind, final double[] ds) {
        final int[] next = {0};
        final DoubleSupplier source = () -> ds[next[0]++];
        InflectionUtil.setRandomSourceForTesting(source);
        final List<Object> picks = new ArrayList<>();
        final List<Object> in = new ArrayList<>();
        for (final double d: ds) {
            in.add(d);
            picks.add(pick(kind));
        }
        w.add("doubles/" + name, obj("kind", kind, "doubles", in), obj("picks", picks));
    }

    private static double[] keyOrder(final int size) {
        final double[] ds = new double[size];
        for (int k = 0; k < size; k++) {
            ds[k] = (k + 0.5) / size;
        }
        return ds;
    }

    @Test
    public void generate() throws Exception {
        try (final GoldenWriter w = GoldenWriter.open("anki/inflection-random.json", "anki.inflectionRandom",
                "util/InflectionUtil.getRandomVerbConjugation, getRandomAdjectiveDeclension (setRandomSourceForTesting)")) {
            doubles(w, "verb-key-order", "verb", keyOrder(44));
            doubles(w, "adjective-key-order", "adjective", keyOrder(7));
            final double below1 = Math.nextDown(1.0);
            final double[] edges = {0.0, Double.MIN_VALUE, below1, 0.5, 1.0 / 44, Math.nextDown(1.0 / 44), 43.0 / 44,
                    Math.nextDown(43.0 / 44), 0.25, 0.75};
            doubles(w, "verb-edges", "verb", edges);
            final double[] adjEdges = {0.0, Double.MIN_VALUE, below1, 0.5, 1.0 / 7, Math.nextDown(1.0 / 7), 3.0 / 7,
                    Math.nextDown(3.0 / 7), 6.0 / 7, Math.nextDown(6.0 / 7)};
            doubles(w, "adjective-edges", "adjective", adjEdges);

            final long[] seeds = {1, 2, 42, 0, -7, 12345, 1767604620000L};
            for (final long seed: seeds) {
                final Random rnd = new Random(seed);
                InflectionUtil.setRandomSourceForTesting(rnd::nextDouble);
                final List<Object> kinds = new ArrayList<>();
                final List<Object> picks = new ArrayList<>();
                final Random kindRnd = new Random(seed ^ 0x5DEECE66DL);
                for (int i = 0; i < 30; i++) {
                    final String kind = kindRnd.nextInt(3) == 0 ? "adjective" : "verb";
                    kinds.add(kind);
                    picks.add(pick(kind));
                }
                w.add("seed/" + seed, obj("seed", seed, "kinds", kinds), obj("picks", picks));
            }
        }
        // Production source: Math.random() is back after the null reset, and still picks a valid name.
        InflectionUtil.setRandomSourceForTesting(null);
        final String any = InflectionUtil.getRandomAdjectiveDeclension();
        assertEquals(true, Arrays.asList("past", "conjunctive", "negative (spoken)", "negative (written)",
                "negative past (spoken)", "negative past (written)", "negative conjunctive").contains(any));
    }
}
