/*
 * KanjiKodama local mode: the JLPT curriculum order.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Lays the WaniKani subjects out in JLPT blocks (N5, N4, N3, N2, N1, then Obscure for kanji on no
 * JLPT list). Pure Java so it can be unit-tested.
 *
 * <ul>
 *     <li>Each block's kanji keep WaniKani's relative order and are split evenly into levels of
 *     at least {@link #MIN_KANJI_PER_LEVEL} kanji, so that all blocks fit in {@link #MAX_LEVELS}
 *     levels.</li>
 *     <li>A radical goes to the level of the first kanji that uses it.</li>
 *     <li>A vocabulary item goes to the level of its last component kanji, so it unlocks once
 *     all of them have passed, exactly like in WaniKani order.</li>
 *     <li>Everything else (kana-only vocabulary, unused radicals, hidden subjects) goes to the
 *     first level holding kanji from its WaniKani level.</li>
 * </ul>
 */
public final class JlptPlan {
    public static final int MAX_LEVELS = 60;
    static final int MIN_KANJI_PER_LEVEL = 30;
    /** Block codes in curriculum order: N5 .. N1, then 0 for Obscure. */
    static final int[] BLOCKS = {5, 4, 3, 2, 1, 0};

    /** One subject as the planner sees it. */
    public static final class Row {
        final long id;
        final String object;
        final int wkLevel;
        final int wkPosition;
        final long[] components;
        final boolean hidden;
        final String characters;

        public Row(final long id, final String object, final int wkLevel, final int wkPosition,
                   final long[] components, final boolean hidden, final String characters) {
            this.id = id;
            this.object = object;
            this.wkLevel = wkLevel;
            this.wkPosition = wkPosition;
            this.components = components;
            this.hidden = hidden;
            this.characters = characters;
        }
    }

    /** New level and lesson position per subject id, plus the block of every level. */
    public final Map<Long, int[]> placement = new HashMap<>();
    /** blockOfLevel.get(level - 1) is the block code (5 = N5 ... 1 = N1, 0 = Obscure). */
    public final List<Integer> blockOfLevel = new ArrayList<>();

    private JlptPlan() {
        //
    }

    public static String blockName(final int code) {
        return code == 0 ? "Obscure" : "N" + code;
    }

    /**
     * Build the plan.
     *
     * @param rows every subject
     * @param jlpt kanji character to JLPT level (5 = N5 ... 1 = N1); missing means Obscure
     */
    public static JlptPlan build(final List<Row> rows, final Map<String, Integer> jlpt) {
        final JlptPlan plan = new JlptPlan();
        final Comparator<Row> wkOrder = Comparator.<Row>comparingInt(r -> r.wkLevel)
                .thenComparingInt(r -> r.wkPosition).thenComparingLong(r -> r.id);

        final Map<Integer, List<Row>> kanjiByBlock = new HashMap<>();
        for (final int b: BLOCKS) {
            kanjiByBlock.put(b, new ArrayList<>());
        }
        final Map<Long, Row> byId = new HashMap<>();
        for (final Row r: rows) {
            byId.put(r.id, r);
            if (!r.hidden && "kanji".equals(r.object)) {
                final Integer b = r.characters == null ? null : jlpt.get(r.characters);
                kanjiByBlock.get(b == null ? 0 : b).add(r);
            }
        }

        int perLevel = MIN_KANJI_PER_LEVEL;
        while (levelsNeeded(kanjiByBlock, perLevel) > MAX_LEVELS) {
            perLevel++;
        }

        // Kanji: blocks in order, each split evenly into consecutive levels.
        final Map<Long, Integer> level = new HashMap<>();
        final List<List<Row>> kanjiOfLevel = new ArrayList<>();
        for (final int b: BLOCKS) {
            final List<Row> kanji = kanjiByBlock.get(b);
            if (kanji.isEmpty()) {
                continue;
            }
            kanji.sort(wkOrder);
            final int n = kanji.size();
            final int levels = (n + perLevel - 1) / perLevel;
            int start = 0;
            for (int i = 0; i < levels; i++) {
                final int end = start + (n - start) / (levels - i);
                final List<Row> chunk = new ArrayList<>(kanji.subList(start, end));
                kanjiOfLevel.add(chunk);
                plan.blockOfLevel.add(b);
                for (final Row r: chunk) {
                    level.put(r.id, kanjiOfLevel.size());
                }
                start = end;
            }
        }
        final int maxLevel = Math.max(1, kanjiOfLevel.size());

        // First new level holding kanji from each WaniKani level, for subjects without a better anchor.
        final int[] fromWk = new int[MAX_LEVELS + 2];
        for (int l = 0; l < fromWk.length; l++) {
            fromWk[l] = Integer.MAX_VALUE;
        }
        for (int i = 0; i < kanjiOfLevel.size(); i++) {
            for (final Row r: kanjiOfLevel.get(i)) {
                final int wl = Math.max(0, Math.min(fromWk.length - 1, r.wkLevel));
                fromWk[wl] = Math.min(fromWk[wl], i + 1);
            }
        }
        int last = 1;
        for (int l = 0; l < fromWk.length; l++) {
            if (fromWk[l] == Integer.MAX_VALUE) {
                fromWk[l] = last;
            }
            last = fromWk[l];
        }

        // Radicals: the level of the first kanji using them.
        final Map<Integer, List<Row>> radicalsOfLevel = new HashMap<>();
        for (int i = 0; i < kanjiOfLevel.size(); i++) {
            for (final Row k: kanjiOfLevel.get(i)) {
                for (final long c: k.components) {
                    final Row comp = byId.get(c);
                    if (comp != null && "radical".equals(comp.object) && !level.containsKey(c)) {
                        level.put(c, i + 1);
                        radicalsOfLevel.computeIfAbsent(i + 1, x -> new ArrayList<>()).add(comp);
                    }
                }
            }
        }

        // Everything else.
        final Map<Integer, List<Row>> restOfLevel = new HashMap<>();
        for (final Row r: rows) {
            if (level.containsKey(r.id)) {
                continue;
            }
            int l = 0;
            if ("vocabulary".equals(r.object)) {
                for (final long c: r.components) {
                    final Integer kl = level.get(c);
                    if (kl != null && byId.get(c) != null && "kanji".equals(byId.get(c).object)) {
                        l = Math.max(l, kl);
                    }
                }
            }
            if (l == 0) {
                l = fromWk[Math.max(0, Math.min(fromWk.length - 1, r.wkLevel))];
            }
            l = Math.max(1, Math.min(maxLevel, l));
            level.put(r.id, l);
            if ("radical".equals(r.object)) {
                radicalsOfLevel.computeIfAbsent(l, x -> new ArrayList<>()).add(r);
            }
            else {
                restOfLevel.computeIfAbsent(l, x -> new ArrayList<>()).add(r);
            }
        }

        // Lesson positions: radicals, then kanji, then vocabulary (in WaniKani order).
        for (int l = 1; l <= maxLevel; l++) {
            int pos = 0;
            for (final Row r: radicalsOfLevel.getOrDefault(l, new ArrayList<>())) {
                plan.placement.put(r.id, new int[] {l, ++pos});
            }
            if (l <= kanjiOfLevel.size()) {
                for (final Row r: kanjiOfLevel.get(l - 1)) {
                    plan.placement.put(r.id, new int[] {l, ++pos});
                }
            }
            final List<Row> rest = restOfLevel.getOrDefault(l, new ArrayList<>());
            rest.sort(Comparator.<Row>comparingInt(r -> "kana_vocabulary".equals(r.object) ? 1 : 0).thenComparing(wkOrder));
            for (final Row r: rest) {
                plan.placement.put(r.id, new int[] {l, ++pos});
            }
        }
        if (plan.blockOfLevel.isEmpty()) {
            plan.blockOfLevel.add(5);
        }
        return plan;
    }

    private static int levelsNeeded(final Map<Integer, List<Row>> kanjiByBlock, final int perLevel) {
        int total = 0;
        for (final List<Row> kanji: kanjiByBlock.values()) {
            total += (kanji.size() + perLevel - 1) / perLevel;
        }
        return total;
    }
}
