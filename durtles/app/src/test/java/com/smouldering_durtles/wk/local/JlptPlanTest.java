package com.smouldering_durtles.wk.local;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class JlptPlanTest {
    private static JlptPlan.Row row(final long id, final String object, final int wkLevel, final int pos,
                                    final String chars, final long... components) {
        return new JlptPlan.Row(id, object, wkLevel, pos, components, false, chars);
    }

    @Test
    public void smallCurriculum() {
        final List<JlptPlan.Row> rows = Arrays.asList(
                row(1, "radical", 1, 1, "一"),
                row(2, "radical", 1, 2, "人"),
                row(3, "radical", 9, 1, "x"),            // used by no kanji
                row(10, "kanji", 1, 3, "一", 1),
                row(11, "kanji", 1, 4, "人", 2),
                row(12, "kanji", 11, 1, "誰", 1),        // on no JLPT list
                row(13, "kanji", 5, 1, "語", 2),
                row(20, "vocabulary", 2, 1, "一人", 10, 11),
                row(21, "vocabulary", 12, 1, "誰か", 12),
                row(30, "kana_vocabulary", 1, 9, "ああ"));
        final Map<String, Integer> jlpt = new HashMap<>();
        jlpt.put("一", 5);
        jlpt.put("人", 5);
        jlpt.put("語", 5);

        final JlptPlan plan = JlptPlan.build(rows, jlpt);

        assertEquals(Arrays.asList(5, 0), plan.blockOfLevel);
        assertArrayEquals(new int[] {1, 1}, plan.placement.get(1L));   // radicals first, in order of first use
        assertArrayEquals(new int[] {1, 2}, plan.placement.get(2L));
        assertArrayEquals(new int[] {1, 3}, plan.placement.get(3L));   // unused radical: by WaniKani level
        assertArrayEquals(new int[] {1, 4}, plan.placement.get(10L));  // kanji keep WaniKani order
        assertArrayEquals(new int[] {1, 5}, plan.placement.get(11L));
        assertArrayEquals(new int[] {1, 6}, plan.placement.get(13L));
        assertEquals(1, plan.placement.get(20L)[0]);                  // vocabulary follows its last kanji
        assertEquals(2, plan.placement.get(12L)[0]);                  // Obscure block
        assertEquals(2, plan.placement.get(21L)[0]);
        assertEquals(1, plan.placement.get(30L)[0]);                  // kana vocabulary: by WaniKani level
        assertEquals(rows.size(), plan.placement.size());
    }

    @Test
    public void blocksSplitEvenlyIntoLevels() {
        final List<JlptPlan.Row> rows = new ArrayList<>();
        final Map<String, Integer> jlpt = new HashMap<>();
        for (int i = 0; i < 100; i++) {
            rows.add(row(100 + i, "kanji", 1 + i / 10, i, "k" + i));
            jlpt.put("k" + i, 5);
        }
        final JlptPlan plan = JlptPlan.build(rows, jlpt);
        assertEquals(4, plan.blockOfLevel.size());
        final int[] perLevel = new int[4];
        int lastLevel = 1;
        for (int i = 0; i < 100; i++) {
            final int l = plan.placement.get(100L + i)[0];
            assertTrue("WaniKani order is kept", l >= lastLevel);
            lastLevel = l;
            perLevel[l - 1]++;
        }
        assertArrayEquals(new int[] {25, 25, 25, 25}, perLevel);
    }

    @Test
    public void neverMoreThanSixtyLevels() {
        final List<JlptPlan.Row> rows = new ArrayList<>();
        final Map<String, Integer> jlpt = new HashMap<>();
        for (int i = 0; i < 2500; i++) {
            rows.add(row(i + 1, "kanji", 1 + i / 50, i, "k" + i));
            jlpt.put("k" + i, 1 + i % 5);
        }
        final JlptPlan plan = JlptPlan.build(rows, jlpt);
        assertTrue(plan.blockOfLevel.size() <= JlptPlan.MAX_LEVELS);
        assertEquals(Arrays.asList(5, 4, 3, 2, 1), new ArrayList<>(new java.util.LinkedHashSet<>(plan.blockOfLevel)));
    }
}
