package com.smouldering_durtles.wk.local;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public final class LevelTestTest {
    private static List<Integer> range(final int from, final int to) {
        final List<Integer> out = new ArrayList<>();
        for (int i = from; i <= to; i++) {
            out.add(i);
        }
        return out;
    }

    @Test
    public void sampledLevelsAreEvenlySpacedWithBothEnds() {
        assertEquals(Arrays.asList(9, 11, 13, 15, 17, 19), LevelTest.sampledLevels(range(9, 19)));
        assertEquals(Arrays.asList(1, 2, 3), LevelTest.sampledLevels(range(1, 3)));
        assertEquals(Arrays.asList(30, 35, 40, 46, 51, 56), LevelTest.sampledLevels(range(30, 56)));
    }

    @Test
    public void boundaryIsTheFirstBlockBelowThreshold() {
        final List<LevelTest.BlockScore> scores = Arrays.asList(
                new LevelTest.BlockScore(5, 6, 6, 1.0),
                new LevelTest.BlockScore(4, 6, 5, 0.85),
                new LevelTest.BlockScore(3, 6, 2, 0.33),
                new LevelTest.BlockScore(2, 6, 3, 0.5),
                new LevelTest.BlockScore(1, 6, 0, 0.0));
        assertEquals(3, LevelTest.boundaryBlock(scores));
    }

    @Test
    public void knowingEverythingPointsPastN1() {
        final List<LevelTest.BlockScore> scores = Arrays.asList(
                new LevelTest.BlockScore(5, 6, 6, 1.0), new LevelTest.BlockScore(1, 6, 6, 0.95));
        assertEquals(0, LevelTest.boundaryBlock(scores));
    }
}
