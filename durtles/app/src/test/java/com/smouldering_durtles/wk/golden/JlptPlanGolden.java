package com.smouldering_durtles.wk.golden;

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static org.junit.Assert.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import com.smouldering_durtles.wk.local.JlptPlan;

import org.junit.Assume;
import org.junit.Test;

import java.io.BufferedReader;
import java.io.File;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * {@link JlptPlan#build}: the synthetic cases of JlptPlanTest plus more edge cases
 * ({@code curriculum/jlpt-plan-synthetic.json}), and the real WaniKani content
 * ({@code curriculum/jlpt-plan-content.json}, skipped when the git-ignored content DB is missing).
 *
 * <p>Input rows are written as tuples {@code [id, object, wkLevel, wkPosition, components, hidden,
 * characters]}, the jlpt map sorted by character; output is {@code blockOfLevel} and
 * {@code placement} as {@code [id, level, lessonPosition]} sorted by id.</p>
 */
public final class JlptPlanGolden {
    private static JlptPlan.Row row(final long id, final String object, final int wkLevel, final int pos,
                                    final String chars, final long... components) {
        return new JlptPlan.Row(id, object, wkLevel, pos, components, false, chars);
    }

    private static JlptPlan.Row hidden(final long id, final String object, final int wkLevel, final int pos,
                                       final String chars, final long... components) {
        return new JlptPlan.Row(id, object, wkLevel, pos, components, true, chars);
    }

    private static Object field(final JlptPlan.Row r, final String name) throws Exception {
        final java.lang.reflect.Field f = JlptPlan.Row.class.getDeclaredField(name);
        f.setAccessible(true);
        return f.get(r);
    }

    private static Map<String, Object> input(final List<JlptPlan.Row> rows, final Map<String, Integer> jlpt) throws Exception {
        final List<Object> rs = new ArrayList<>();
        for (final JlptPlan.Row r: rows) {
            rs.add(Arrays.asList(field(r, "id"), field(r, "object"), field(r, "wkLevel"), field(r, "wkPosition"),
                    field(r, "components"), field(r, "hidden"), field(r, "characters")));
        }
        return obj("rows", rs, "jlpt", new TreeMap<>(jlpt));
    }

    private static Map<String, Object> output(final JlptPlan plan) {
        final List<Object> placement = new ArrayList<>();
        for (final Map.Entry<Long, int[]> e: new TreeMap<>(plan.placement).entrySet()) {
            placement.add(Arrays.asList(e.getKey(), e.getValue()[0], e.getValue()[1]));
        }
        final List<String> names = new ArrayList<>();
        for (final int b: plan.blockOfLevel) {
            names.add(JlptPlan.blockName(b));
        }
        return obj("blockOfLevel", plan.blockOfLevel, "blockNames", names, "placement", placement);
    }

    private static void add(final GoldenWriter w, final String name, final List<JlptPlan.Row> rows,
                            final Map<String, Integer> jlpt) throws Exception {
        w.add(name, input(rows, jlpt), output(JlptPlan.build(rows, jlpt)));
    }

    @Test
    public void synthetic() throws Exception {
        try (final GoldenWriter w = GoldenWriter.open("curriculum/jlpt-plan-synthetic.json", "curriculum.jlptPlan",
                "local/JlptPlan.build, blockName")) {
            // --- the cases of JlptPlanTest ---
            final Map<String, Integer> small = new HashMap<>();
            small.put("一", 5);
            small.put("人", 5);
            small.put("語", 5);
            add(w, "test-small-curriculum", Arrays.asList(
                    row(1, "radical", 1, 1, "一"),
                    row(2, "radical", 1, 2, "人"),
                    row(3, "radical", 9, 1, "x"),
                    row(10, "kanji", 1, 3, "一", 1),
                    row(11, "kanji", 1, 4, "人", 2),
                    row(12, "kanji", 11, 1, "誰", 1),
                    row(13, "kanji", 5, 1, "語", 2),
                    row(20, "vocabulary", 2, 1, "一人", 10, 11),
                    row(21, "vocabulary", 12, 1, "誰か", 12),
                    row(30, "kana_vocabulary", 1, 9, "ああ")), small);

            final List<JlptPlan.Row> hundred = new ArrayList<>();
            final Map<String, Integer> hundredJlpt = new HashMap<>();
            for (int i = 0; i < 100; i++) {
                hundred.add(row(100 + i, "kanji", 1 + i / 10, i, "k" + i));
                hundredJlpt.put("k" + i, 5);
            }
            add(w, "test-blocks-split-evenly", hundred, hundredJlpt);

            final List<JlptPlan.Row> many = new ArrayList<>();
            final Map<String, Integer> manyJlpt = new HashMap<>();
            for (int i = 0; i < 2500; i++) {
                many.add(row(i + 1, "kanji", 1 + i / 50, i, "k" + i));
                manyJlpt.put("k" + i, 1 + i % 5);
            }
            add(w, "test-never-more-than-sixty-levels", many, manyJlpt);

            // --- more edge cases ---
            add(w, "edge-no-rows", new ArrayList<>(), new HashMap<>());
            add(w, "edge-only-radicals-and-kana", Arrays.asList(
                    row(1, "radical", 1, 1, "一"), row(2, "radical", 3, 1, null),
                    row(3, "kana_vocabulary", 2, 1, "ああ")), small);
            add(w, "edge-all-obscure", Arrays.asList(
                    row(10, "kanji", 1, 1, "一"), row(11, "kanji", 2, 1, "人"),
                    row(20, "vocabulary", 2, 2, "一人", 10, 11)), new HashMap<>());

            final Map<String, Integer> mixed = new HashMap<>();
            mixed.put("a", 5);
            mixed.put("b", 4);
            mixed.put("c", 1);
            mixed.put("h", 5);
            add(w, "edge-hidden-and-odd-levels", Arrays.asList(
                    row(1, "radical", 1, 2, "r1"),
                    row(2, "radical", 1, 1, "r2"),
                    hidden(3, "radical", 1, 3, "r3"),
                    row(10, "kanji", 3, 2, "a", 1, 2),
                    row(11, "kanji", 3, 1, "b", 2, 999),
                    row(12, "kanji", 0, 1, "c", 3),
                    hidden(13, "kanji", 2, 1, "h", 1),
                    row(14, "kanji", 70, 1, null),
                    row(15, "kanji", 3, 1, "z", 1),
                    row(20, "vocabulary", 1, 1, "ab", 10, 11),
                    row(21, "vocabulary", 5, 1, "hh", 13),
                    row(22, "vocabulary", 61, 1, "rr", 1, 2),
                    row(23, "vocabulary", -3, 1, "q"),
                    hidden(24, "vocabulary", 3, 2, "ac", 10, 12),
                    row(30, "kana_vocabulary", 3, 5, "ああ"),
                    row(31, "kana_vocabulary", 3, 4, "いい"),
                    row(40, "unknown_object", 3, 1, "?")), mixed);

            // ties in WaniKani order are broken by id; same level and position
            final List<JlptPlan.Row> ties = new ArrayList<>();
            final Map<String, Integer> tiesJlpt = new HashMap<>();
            for (int i = 0; i < 61; i++) {
                ties.add(row(500 - i, "kanji", 1, 1, "t" + i));
                tiesJlpt.put("t" + i, 5);
            }
            add(w, "edge-ties-broken-by-id", ties, tiesJlpt);

            // block sizes around the 30-per-level minimum and uneven splits
            for (final int n: new int[] {1, 29, 30, 31, 59, 60, 61, 89, 91, 1799, 1800, 1801, 1830, 1831}) {
                final List<JlptPlan.Row> rows = new ArrayList<>();
                final Map<String, Integer> jlpt = new HashMap<>();
                for (int i = 0; i < n; i++) {
                    rows.add(row(1000 + i, "kanji", 1 + i % 60, i / 60, "k" + i));
                    jlpt.put("k" + i, i % 7 == 0 ? 4 : 5);
                }
                rows.add(row(1, "vocabulary", 1, 1, "v", 1000, 1000 + n - 1));
                add(w, String.format(Locale.ROOT, "size-%04d", n), rows, jlpt);
            }

            // seeded random curricula
            final java.util.Random random = new java.util.Random(4242L);
            for (int c = 0; c < 20; c++) {
                final List<JlptPlan.Row> rows = new ArrayList<>();
                final Map<String, Integer> jlpt = new HashMap<>();
                final int radicals = random.nextInt(40);
                final int kanji = random.nextInt(400);
                final int vocab = random.nextInt(600);
                long id = 1;
                final List<Long> radicalIds = new ArrayList<>();
                final List<Long> kanjiIds = new ArrayList<>();
                for (int i = 0; i < radicals; i++) {
                    radicalIds.add(id);
                    rows.add(new JlptPlan.Row(id++, "radical", 1 + random.nextInt(60), random.nextInt(50),
                            new long[0], random.nextInt(30) == 0, "R" + i));
                }
                for (int i = 0; i < kanji; i++) {
                    final long[] comps = new long[radicals == 0 ? 0 : random.nextInt(4)];
                    for (int k = 0; k < comps.length; k++) {
                        comps[k] = radicalIds.get(random.nextInt(radicals));
                    }
                    kanjiIds.add(id);
                    rows.add(new JlptPlan.Row(id++, "kanji", 1 + random.nextInt(60), random.nextInt(50),
                            comps, random.nextInt(40) == 0, "K" + i));
                    final int r = random.nextInt(7);
                    if (r < 5) {
                        jlpt.put("K" + i, 1 + r);
                    }
                }
                for (int i = 0; i < vocab; i++) {
                    final boolean kana = random.nextInt(15) == 0;
                    final long[] comps = new long[kana || kanji == 0 ? 0 : 1 + random.nextInt(3)];
                    for (int k = 0; k < comps.length; k++) {
                        comps[k] = kanjiIds.get(random.nextInt(kanji));
                    }
                    rows.add(new JlptPlan.Row(id++, kana ? "kana_vocabulary" : "vocabulary", 1 + random.nextInt(60),
                            random.nextInt(50), comps, random.nextInt(40) == 0, "V" + i));
                }
                Collections.shuffle(rows, random);
                add(w, String.format(Locale.ROOT, "random-%02d", c), rows, jlpt);
            }
        }
    }

    /** Same parsing as Curriculum.loadJlptKanji, which needs an Android Context. */
    static Map<String, Integer> loadJlptKanji(final File file) throws Exception {
        final Map<String, Integer> out = new HashMap<>();
        try (final BufferedReader r = Files.newBufferedReader(file.toPath(), StandardCharsets.UTF_8)) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                final String[] parts = line.split("\t");
                if (parts.length == 2) {
                    out.put(parts[0], Integer.parseInt(parts[1].trim()));
                }
            }
        }
        return out;
    }

    /**
     * The rows Curriculum.layout builds from a freshly imported subject table (WaniKani order =
     * the subject's own level and lessonPosition), without the extra (non-WaniKani) kanji.
     */
    static List<JlptPlan.Row> contentRows() throws Exception {
        final Method parseIds = Class.forName("com.smouldering_durtles.wk.local.Curriculum")
                .getDeclaredMethod("parseIds", String.class);
        parseIds.setAccessible(true);
        final JsonNode rows = GoldenContent.query("SELECT id, object, characters, componentSubjectIds, hiddenAt, level, lessonPosition"
                + " FROM subject WHERE object IS NOT NULL ORDER BY id");
        final List<JlptPlan.Row> out = new ArrayList<>();
        for (final JsonNode r: rows) {
            final JsonNode comps = r.get("componentSubjectIds");
            final JsonNode chars = r.get("characters");
            final JsonNode hidden = r.get("hiddenAt");
            out.add(new JlptPlan.Row(r.get("id").asLong(), r.get("object").asText(), r.get("level").asInt(),
                    r.get("lessonPosition").asInt(),
                    (long[]) parseIds.invoke(null, comps == null || comps.isNull() ? "" : comps.asText()),
                    hidden != null && !hidden.isNull() && hidden.asLong() != 0,
                    chars == null || chars.isNull() ? null : chars.asText()));
        }
        return out;
    }

    @Test
    public void content() throws Exception {
        Assume.assumeTrue("content DB missing: " + GoldenContent.contentDb(), GoldenContent.available());
        final List<JlptPlan.Row> rows = contentRows();
        final Map<String, Integer> jlpt = loadJlptKanji(new File(GoldenContent.assetsDir(), "jlpt-kanji.tsv"));
        final JlptPlan plan = JlptPlan.build(rows, jlpt);
        assertEquals(rows.size(), plan.placement.size());
        try (final GoldenWriter w = GoldenWriter.open("curriculum/jlpt-plan-content.json", "curriculum.jlptPlan.content",
                "local/JlptPlan.build on wk-content.db (via Curriculum.layout rows) and jlpt-kanji.tsv")) {
            final Map<String, Object> in = new LinkedHashMap<>();
            in.put("source", "durtles/app/src/main/assets/wk-content.db: SELECT id, object, characters, componentSubjectIds,"
                    + " hiddenAt, level, lessonPosition FROM subject WHERE object IS NOT NULL; jlpt-kanji.tsv");
            in.putAll(input(rows, jlpt));
            w.add("wk-content", in, output(plan));
            final Map<String, Object> perLevel = new LinkedHashMap<>();
            final int[] kanjiPerLevel = new int[plan.blockOfLevel.size() + 1];
            final int[] subjectsPerLevel = new int[plan.blockOfLevel.size() + 1];
            final Map<Long, String> objectOf = new HashMap<>();
            for (final JlptPlan.Row r: rows) {
                objectOf.put((Long) field(r, "id"), (String) field(r, "object"));
            }
            for (final Map.Entry<Long, int[]> e: plan.placement.entrySet()) {
                subjectsPerLevel[e.getValue()[0]]++;
                if ("kanji".equals(objectOf.get(e.getKey()))) {
                    kanjiPerLevel[e.getValue()[0]]++;
                }
            }
            final List<Object> levels = new ArrayList<>();
            for (int l = 1; l <= plan.blockOfLevel.size(); l++) {
                levels.add(obj("level", l, "block", plan.blockOfLevel.get(l - 1), "kanji", kanjiPerLevel[l],
                        "subjects", subjectsPerLevel[l]));
            }
            perLevel.put("levels", levels);
            w.add("wk-content-summary", obj("source", "same as wk-content; summary of its output for quick checks"), perLevel);
        }
    }
}
