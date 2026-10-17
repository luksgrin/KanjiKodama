package com.smouldering_durtles.wk.golden;

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;

import com.smouldering_durtles.wk.local.LevelTest;

import org.junit.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

/**
 * The pure estimators of {@link LevelTest} on synthetic data: {@code boundaryBlock},
 * {@code sampledLevels}, {@code share} (private; reached through reflection, behavior unchanged) and
 * {@code Result.minutesPerDay}. Rounds and {@code result()} need Room and are Tier B scenarios.
 */
public final class LevelTestGolden {
    private static final Random RANDOM = new Random(31337L);

    private static Object call(final String name, final Class<?>[] types, final Object... args) throws Exception {
        final Method m = LevelTest.class.getDeclaredMethod(name, types);
        m.setAccessible(true);
        return m.invoke(null, args);
    }

    private static Class<?> nested(final Class<?> outer, final String simple) {
        for (final Class<?> c: outer.getDeclaredClasses()) {
            if (c.getSimpleName().equals(simple)) {
                return c;
            }
        }
        throw new IllegalStateException(simple);
    }

    private static Object blockScore(final int block, final int asked, final int known, final double share) throws Exception {
        final Constructor<?> c = LevelTest.BlockScore.class.getDeclaredConstructor(int.class, int.class, int.class, double.class);
        c.setAccessible(true);
        return c.newInstance(block, asked, known, share);
    }

    // --- boundaryBlock ------------------------------------------------------------------------

    private static void addBoundary(final GoldenWriter w, final String name, final int[] blocks, final double[] shares) throws Exception {
        final List<Object> scores = new ArrayList<>();
        final List<Object> in = new ArrayList<>();
        for (int i = 0; i < blocks.length; i++) {
            final int asked = 6;
            final int known = (int) Math.round(shares[i] * 6);
            scores.add(blockScore(blocks[i], asked, known, shares[i]));
            in.add(obj("block", blocks[i], "asked", asked, "known", known, "share", shares[i]));
        }
        final int out = (Integer) call("boundaryBlock", new Class<?>[] {List.class}, scores);
        w.add(name, obj("scores", in), out);
    }

    @Test
    public void estimators() throws Exception {
        try (final GoldenWriter w = GoldenWriter.open("levelTest/estimators.json", "levelTest.estimators",
                "local/LevelTest.boundaryBlock, sampledLevels, share, Result.minutesPerDay")) {
            final int[] all = {5, 4, 3, 2, 1};
            addBoundary(w, "boundary-first-below", all, new double[] {1.0, 0.85, 0.33, 0.5, 0.0});
            addBoundary(w, "boundary-all-known", new int[] {5, 1}, new double[] {1.0, 0.95});
            addBoundary(w, "boundary-empty-list", new int[0], new double[0]);
            addBoundary(w, "boundary-exactly-threshold", all, new double[] {0.6, 0.6, 0.6, 0.6, 0.6});
            addBoundary(w, "boundary-just-below-threshold", all, new double[] {0.6, 0.5999999999, 0.0, 0.0, 0.0});
            addBoundary(w, "boundary-n5-unknown", all, new double[] {0.0, 1.0, 1.0, 1.0, 1.0});
            addBoundary(w, "boundary-n1-only", all, new double[] {1.0, 1.0, 1.0, 1.0, 0.59});
            for (int i = 0; i < 100; i++) {
                final double[] shares = new double[5];
                for (int b = 0; b < 5; b++) {
                    shares[b] = Math.round(RANDOM.nextDouble() * 1000) / 1000.0;
                }
                addBoundary(w, String.format(Locale.ROOT, "boundary-random-%03d", i), all, shares);
            }

            // sampledLevels: contiguous ranges of every length 0..40 at a few offsets, plus gapped lists
            for (int n = 0; n <= 40; n++) {
                for (final int start: new int[] {1, 9, 30}) {
                    final List<Integer> levels = new ArrayList<>();
                    for (int i = 0; i < n; i++) {
                        levels.add(start + i);
                    }
                    addSampled(w, "sampled-range-start" + start + "-n" + n, levels);
                }
            }
            for (int i = 0; i < 30; i++) {
                final List<Integer> levels = new ArrayList<>();
                int l = 1 + RANDOM.nextInt(10);
                final int n = 1 + RANDOM.nextInt(15);
                for (int j = 0; j < n; j++) {
                    levels.add(l);
                    l += 1 + RANDOM.nextInt(3);
                }
                addSampled(w, String.format(Locale.ROOT, "sampled-gapped-%02d", i), levels);
            }

            addShareCases(w);

            for (final int probation: new int[] {0, 1, 4, 5, 6, 34, 35, 36, 100, 349, 350, 351, 1000, 2500, 9452}) {
                final Class<?> result = LevelTest.Result.class;
                final Constructor<?> c = result.getDeclaredConstructor(int.class, String.class, int.class, int.class);
                c.setAccessible(true);
                final LevelTest.Result r = (LevelTest.Result) c.newInstance(10, null, 0, probation);
                w.add("minutesPerDay-probation" + probation, obj("probation", probation), r.minutesPerDay);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static void addSampled(final GoldenWriter w, final String name, final List<Integer> levels) throws Exception {
        final List<Integer> out = (List<Integer>) call("sampledLevels", new Class<?>[] {List.class}, levels);
        w.add(name, obj("blockLevels", levels), out);
    }

    // --- share ----------------------------------------------------------------------------------

    /**
     * Builds a LevelTest.Levels with the given per-level counts. Open kanji of level l get ids
     * l*1000+1 .. l*1000+open; answers map id to -1 (asked, unanswered), 0 or 1.
     */
    @SuppressWarnings("unchecked")
    private static void addShare(final GoldenWriter w, final String name, final int[] total, final int[] mastered,
                                 final int[] open, final List<Integer> which, final Map<Long, Integer> answers) throws Exception {
        final int count = total.length;
        final Class<?> layoutClass = nested(Class.forName("com.smouldering_durtles.wk.local.Curriculum"), "Layout");
        final Constructor<?> lc = layoutClass.getDeclaredConstructor(Map.class, List.class);
        lc.setAccessible(true);
        final List<Integer> blocks = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            blocks.add(5);
        }
        final Object layout = lc.newInstance(new HashMap<Long, int[]>(), blocks);
        final Class<?> levelsClass = nested(LevelTest.class, "Levels");
        final Constructor<?> vc = levelsClass.getDeclaredConstructor(layoutClass, int.class);
        vc.setAccessible(true);
        final Object levels = vc.newInstance(layout, count);
        final Field fTotal = levelsClass.getDeclaredField("total");
        final Field fMastered = levelsClass.getDeclaredField("mastered");
        final Field fOpen = levelsClass.getDeclaredField("open");
        fTotal.setAccessible(true);
        fMastered.setAccessible(true);
        fOpen.setAccessible(true);
        final int[] t = (int[]) fTotal.get(levels);
        final int[] m = (int[]) fMastered.get(levels);
        final List<List<Long>> o = (List<List<Long>>) fOpen.get(levels);
        final List<Object> levelInput = new ArrayList<>();
        for (int l = 1; l <= count; l++) {
            t[l] = total[l - 1];
            m[l] = mastered[l - 1];
            final List<Long> ids = new ArrayList<>();
            for (int i = 1; i <= open[l - 1]; i++) {
                ids.add(l * 1000L + i);
            }
            o.get(l).addAll(ids);
            levelInput.add(obj("level", l, "total", total[l - 1], "mastered", mastered[l - 1], "open", ids));
        }
        final Method share = LevelTest.class.getDeclaredMethod("share", levelsClass, List.class, Map.class);
        share.setAccessible(true);
        final double out = (Double) share.invoke(null, levels, which, answers);
        final List<Object> answerList = new ArrayList<>();
        final List<Long> keys = new ArrayList<>(answers.keySet());
        Collections.sort(keys);
        for (final long k: keys) {
            answerList.add(Arrays.asList(k, answers.get(k)));
        }
        w.add(name, obj("levels", levelInput, "which", which, "answers", answerList), out);
    }

    private static void addShareCases(final GoldenWriter w) throws Exception {
        final Map<Long, Integer> none = new HashMap<>();
        addShare(w, "share-empty-which", new int[] {10}, new int[] {5}, new int[] {5}, new ArrayList<>(), none);
        addShare(w, "share-zero-total", new int[] {0, 10}, new int[] {0, 5}, new int[] {0, 5}, Collections.singletonList(1), none);
        addShare(w, "share-all-mastered", new int[] {10}, new int[] {10}, new int[] {0}, Collections.singletonList(1), none);
        addShare(w, "share-open-not-asked", new int[] {10}, new int[] {4}, new int[] {6}, Collections.singletonList(1), none);
        final Map<Long, Integer> half = new HashMap<>();
        half.put(1001L, 1);
        half.put(1002L, 0);
        half.put(1003L, -1);
        half.put(9999L, 1);
        addShare(w, "share-some-answers-and-unanswered", new int[] {10}, new int[] {4}, new int[] {6}, Collections.singletonList(1), half);
        final Map<Long, Integer> twoLevels = new HashMap<>();
        twoLevels.put(1001L, 1);
        twoLevels.put(2001L, 0);
        twoLevels.put(2002L, 0);
        addShare(w, "share-two-levels", new int[] {10, 20}, new int[] {8, 2}, new int[] {2, 18}, Arrays.asList(1, 2), twoLevels);
        // inconsistent counts as the app could see them (total includes hidden or open lists differ)
        addShare(w, "share-open-exceeds-total", new int[] {3}, new int[] {1}, new int[] {5}, Collections.singletonList(1), half);

        for (int i = 0; i < 60; i++) {
            final int count = 1 + RANDOM.nextInt(8);
            final int[] total = new int[count];
            final int[] mastered = new int[count];
            final int[] open = new int[count];
            final Map<Long, Integer> answers = new HashMap<>();
            for (int l = 0; l < count; l++) {
                total[l] = RANDOM.nextInt(5) == 0 ? 0 : 1 + RANDOM.nextInt(40);
                mastered[l] = total[l] == 0 ? 0 : RANDOM.nextInt(total[l] + 1);
                open[l] = total[l] - mastered[l];
                for (int k = 1; k <= open[l]; k++) {
                    final int r = RANDOM.nextInt(10);
                    if (r < 2) {
                        answers.put((l + 1) * 1000L + k, 1);
                    }
                    else if (r < 4) {
                        answers.put((l + 1) * 1000L + k, 0);
                    }
                    else if (r < 5) {
                        answers.put((l + 1) * 1000L + k, -1);
                    }
                }
            }
            final List<Integer> which = new ArrayList<>();
            for (int l = 1; l <= count; l++) {
                if (RANDOM.nextBoolean() || which.isEmpty() && l == count) {
                    which.add(l);
                }
            }
            addShare(w, String.format(Locale.ROOT, "share-random-%02d", i), total, mastered, open, which, answers);
        }
    }
}
