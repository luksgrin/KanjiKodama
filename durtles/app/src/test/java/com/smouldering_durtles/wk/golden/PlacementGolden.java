package com.smouldering_durtles.wk.golden;

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;

import com.smouldering_durtles.wk.local.Placement;

import org.junit.Test;

import java.util.Random;

/**
 * {@link Placement#of(int[], int[])}: hand-written edge cases, every total 1..100 at and around the
 * 60 % threshold (floating point), and 1,000 seeded random arrays. The inputs are recorded, so the
 * TS port never needs Java's RNG.
 */
public final class PlacementGolden {
    private static void add(final GoldenWriter w, final String name, final int[] total, final int[] passed) {
        final Placement p = Placement.of(total, passed);
        w.add(name, obj("kanjiTotal", total, "kanjiPassed", passed), obj("level", p.level, "backfill", p.backfill));
    }

    @Test
    public void placement() throws Exception {
        try (final GoldenWriter w = GoldenWriter.open("curriculum/placement.json", "curriculum.placement",
                "local/Placement.of")) {
            add(w, "edge-no-levels", new int[0], new int[0]);
            add(w, "edge-one-empty-level", new int[] {0}, new int[] {0});
            add(w, "edge-all-levels-empty", new int[] {0, 0, 0}, new int[] {0, 0, 0});
            add(w, "edge-fresh-learner", new int[] {10, 10, 10}, new int[] {0, 0, 0});
            add(w, "edge-all-mastered", new int[] {5, 5, 5}, new int[] {5, 5, 5});
            add(w, "edge-all-mastered-with-empty-last", new int[] {5, 5, 0}, new int[] {5, 5, 0});
            add(w, "edge-empty-level-skipped", new int[] {5, 0, 5}, new int[] {5, 0, 0});
            add(w, "edge-empty-levels-leading", new int[] {0, 0, 5, 5}, new int[] {0, 0, 1, 0});
            add(w, "edge-first-below-threshold", new int[] {10, 10, 10, 10}, new int[] {10, 7, 2, 9});
            add(w, "edge-exactly-sixty-percent", new int[] {10, 10}, new int[] {6, 0});
            add(w, "edge-just-below-sixty-percent", new int[] {10, 10}, new int[] {5, 0});
            add(w, "edge-later-gap-ignored", new int[] {10, 10, 10, 10}, new int[] {10, 10, 0, 10});
            add(w, "edge-passed-exceeds-total", new int[] {5, 5, 5}, new int[] {9, 5, 0});
            add(w, "edge-single-level-known", new int[] {30}, new int[] {30});
            add(w, "edge-single-level-unknown", new int[] {30}, new int[] {17});
            add(w, "edge-sixty-levels-fresh", new int[60], new int[60]);
            final int[] sixty = new int[60];
            final int[] sixtyPassed = new int[60];
            for (int i = 0; i < 60; i++) {
                sixty[i] = 30 + i % 7;
                sixtyPassed[i] = i < 42 ? sixty[i] - i % 3 : 0;
            }
            add(w, "edge-sixty-levels-partial", sixty, sixtyPassed);

            for (int t = 1; t <= 100; t++) {
                final int boundary = (int) Math.ceil(Placement.THRESHOLD * t);
                for (int d = -1; d <= 1; d++) {
                    final int passed = boundary + d;
                    if (passed < 0 || passed > t) {
                        continue;
                    }
                    add(w, "threshold-total" + t + "-passed" + passed, new int[] {t, t}, new int[] {passed, 0});
                }
            }

            final Random random = new Random(20261017L);
            for (int i = 0; i < 1000; i++) {
                final int levels = random.nextInt(61);
                final int[] total = new int[levels];
                final int[] passed = new int[levels];
                final int style = random.nextInt(3);
                final int knownUpTo = levels == 0 ? 0 : random.nextInt(levels + 1);
                for (int l = 0; l < levels; l++) {
                    total[l] = random.nextInt(8) == 0 ? 0 : random.nextInt(60);
                    if (style == 0) {
                        passed[l] = total[l] == 0 ? 0 : random.nextInt(total[l] + 1);
                    }
                    else {
                        // mostly known up to a point, then mostly unknown: realistic learners
                        final double share = l < knownUpTo ? 0.5 + 0.5 * random.nextDouble() : 0.7 * random.nextDouble();
                        passed[l] = (int) Math.round(share * total[l]);
                    }
                }
                add(w, String.format(java.util.Locale.ROOT, "random-%04d", i), total, passed);
            }
        }
    }
}
