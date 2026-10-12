/*
 * MojiMori local mode: where a learner lands after switching curriculum order.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

/**
 * The learner is placed on the first level where they have mastered (passed, Guru or above) less
 * than {@link #THRESHOLD} of the kanji. Every kanji below that level that is not mastered yet is
 * "backfill": it unlocks right away as a lesson instead of holding the learner back.
 *
 * <p>A single unknown kanji low down therefore does not pin the learner to that level, which
 * matters because every WaniKani level mixes kanji from several JLPT levels.</p>
 */
public final class Placement {
    public static final double THRESHOLD = 0.6;

    public final int level;
    public final int backfill;

    private Placement(final int level, final int backfill) {
        this.level = level;
        this.backfill = backfill;
    }

    /**
     * Compute the placement.
     *
     * @param kanjiTotal number of (non-hidden) kanji per level, index 0 = level 1
     * @param kanjiPassed number of those that are mastered, same indexing
     * @return the placement; level is at least 1 and at most the number of levels
     */
    public static Placement of(final int[] kanjiTotal, final int[] kanjiPassed) {
        final int levels = Math.max(1, kanjiTotal.length);
        int level = levels;
        for (int i = 0; i < kanjiTotal.length; i++) {
            if (kanjiTotal[i] > 0 && kanjiPassed[i] < THRESHOLD * kanjiTotal[i]) {
                level = i + 1;
                break;
            }
        }
        int backfill = 0;
        for (int i = 0; i < level - 1; i++) {
            backfill += kanjiTotal[i] - kanjiPassed[i];
        }
        return new Placement(level, backfill);
    }
}
