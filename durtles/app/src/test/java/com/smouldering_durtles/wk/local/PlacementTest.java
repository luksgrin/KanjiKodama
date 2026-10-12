package com.smouldering_durtles.wk.local;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class PlacementTest {
    @Test
    public void freshLearnerStartsAtLevelOne() {
        final Placement p = Placement.of(new int[] {10, 10, 10}, new int[] {0, 0, 0});
        assertEquals(1, p.level);
        assertEquals(0, p.backfill);
    }

    @Test
    public void landsOnFirstLevelBelowThresholdAndBackfillsBelowIt() {
        final Placement p = Placement.of(new int[] {10, 10, 10, 10}, new int[] {10, 7, 2, 9});
        assertEquals(3, p.level);
        assertEquals(3, p.backfill);
    }

    @Test
    public void exactlySixtyPercentCountsAsKnown() {
        assertEquals(2, Placement.of(new int[] {10, 10}, new int[] {6, 0}).level);
    }

    @Test
    public void everythingMasteredLandsOnLastLevel() {
        assertEquals(3, Placement.of(new int[] {5, 5, 5}, new int[] {5, 5, 5}).level);
    }

    @Test
    public void emptyLevelsAreSkipped() {
        assertEquals(3, Placement.of(new int[] {5, 0, 5}, new int[] {5, 0, 0}).level);
    }
}
