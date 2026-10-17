package com.smouldering_durtles.wk.golden;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smouldering_durtles.wk.api.model.ApiStudyMaterial;
import com.smouldering_durtles.wk.db.Converters;
import com.smouldering_durtles.wk.db.dao.SubjectSyncDao;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.enums.SubjectType;
import com.smouldering_durtles.wk.jobs.SaveStudyMaterialJob;
import com.smouldering_durtles.wk.model.AnswerVerdict;

import org.junit.Assume;
import org.junit.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.Nullable;

import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.verdict;
import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

/**
 * Golden cases for the learner's own meaning synonyms (study materials), {@code answers/synonyms.json}.
 *
 * <p>Storage: the subject table's {@code meaningSynonyms} column holds the list as a JSON array text
 * (Jackson), there is no separator character. {@code SubjectSyncDao.serializeToJsonString} writes an empty
 * or null list as {@code "[]"}; {@code Subject.getMeaningSynonyms} parses the column with Jackson and gives an
 * empty list for NULL, "" or anything that does not parse. {@code QuestionType.checkAnswer} adds the synonyms
 * to the accepted answers of the four meaning question types (a HashSet, so exact duplicates of a meaning
 * collapse) and ignores them for reading types.</p>
 *
 * <p>Case groups (by name prefix):</p>
 * <ul>
 *   <li>{@code subject-<id>}: the content-DB rows the other cases use, as in check-subjects.jsonl.</li>
 *   <li>{@code check/...}: input {@code {subject (id), questionType, meaningSynonymsColumn, answer}}; output
 *   {@code {synonyms: Subject.getMeaningSynonyms(), verdicts}}, verdicts keyed by CloseEnoughAction for meaning
 *   types, by {@code requireOnInKatakana=false|true} for reading types; {@code {"error": ...}} if checkAnswer throws.</li>
 *   <li>{@code save/...}: {@code new SaveStudyMaterialJob(data)} as the two UIs build {@code data}
 *   (StudyMaterialsActivity: id, meaning note, reading note, the 10 synonym fields untrimmed;
 *   SubjectInfoView.addSynonym: id, notes, existing synonyms plus the trimmed new one). Output: the parsed job
 *   fields, the column runLocal would store, the list read back from that column and the verdicts of
 *   {@code answers} on {@code subject}.</li>
 *   <li>{@code import/...}: a WaniKani API study material envelope parsed like ApiTask.parseEntity and stored
 *   like SubjectSyncDao.insertOrUpdateStudyMaterial(m, false) (the column values), plus checks.</li>
 * </ul>
 *
 * <p>When two accepted answers tie for the best score, {@code matchedAnswer} is the first in Java HashSet
 * iteration order (String.hashCode buckets); those cases are named {@code ...-tie}.</p>
 */
public final class SynonymGolden {
    private static final ObjectMapper MAPPER = AnswerGoldenSupport.MAPPER;

    /** Subjects from the content DB: radicals Ground/Barb, kanji 一 万 父, vocab 一 二人, kana vocab おはよう. */
    private static final long[] SUBJECT_IDS = {1, 6, 440, 495, 512, 2467, 2476, 9177};

    private final Map<Long, JsonNode> rows = new LinkedHashMap<>();
    private GoldenWriter w;

    @Test
    public void synonyms() throws Exception {
        Assume.assumeTrue("content DB missing", GoldenContent.available());
        final StringBuilder ids = new StringBuilder();
        for (final long id: SUBJECT_IDS) {
            ids.append(ids.length() == 0 ? "" : ",").append(id);
        }
        for (final JsonNode r: GoldenContent.query("SELECT id, object, characters, hiddenAt, meanings, auxiliaryMeanings,"
                + " readings FROM subject WHERE id IN (" + ids + ") ORDER BY id")) {
            rows.put(r.get("id").asLong(), r);
        }
        assertTrue(rows.size() == SUBJECT_IDS.length);

        try (final GoldenWriter writer = GoldenWriter.open("answers/synonyms.json", "answers.synonyms",
                "enums/QuestionType.checkAnswer with db/model/Subject.getMeaningSynonyms, jobs/SaveStudyMaterialJob,"
                        + " db/dao/SubjectSyncDao.serializeToJsonString, api/model/ApiStudyMaterial")) {
            w = writer;
            for (final long id: SUBJECT_IDS) {
                w.add("subject-" + id, subjectJson(id), obj("questionTypes", names(meaningTypeOf(id))));
            }
            exact();
            typoGrid();
            normalization();
            meaningOverlap();
            emptyAndDuplicate();
            many();
            nonAscii();
            separatorLike();
            readingOverlap();
            columnParsing();
            save();
            importStudyMaterials();
        }
    }

    // --- groups ------------------------------------------------------------------------------------

    /** Realistic synonyms per subject: exact, case variants, the WK meaning still accepted, a wrong answer. */
    private void exact() throws Exception {
        final Object[][] sets = {
                {1L, list("floor", "earth")},
                {6L, list("hook", "fish hook")},
                {440L, list("single", "first")},
                {495L, list("myriad", "10k")},
                {512L, list("papa", "daddy")},
                {2467L, list("uno", "single")},
                {2476L, list("duo", "twosome")},
                {9177L, list("morning", "ohayo")},
        };
        for (final Object[] s: sets) {
            final long id = (Long) s[0];
            @SuppressWarnings("unchecked") final List<String> syn = (List<String>) s[1];
            final String col = column(syn);
            final java.util.Set<String> answers = new java.util.LinkedHashSet<>();
            for (final String x: syn) {
                answers.add(x);
                answers.add(x.toUpperCase(java.util.Locale.ROOT));
                answers.add(Character.toUpperCase(x.charAt(0)) + x.substring(1));
            }
            answers.add(firstMeaning(id));
            answers.add("zzzz");
            for (final String a: answers) {
                check("check/exact/" + id + "/[" + a + "]", id, col, a);
            }
            // Same answers with no synonyms, to show what the synonyms change.
            check("check/exact/" + id + "/none/[" + syn.get(0) + "]", id, null, syn.get(0));
        }
    }

    /** One synonym per length class of the typo threshold (0 for 1-3 chars, 1 for 4-5, 2 for 6-7, n/7+2 above). */
    private void typoGrid() throws Exception {
        final String[] synonyms = {"uno", "solo", "unity", "single", "singlet", "lonesome", "a single thing", "one and only one thing"};
        for (final String s: synonyms) {
            final String col = column(list(s));
            final Map<String, String> edits = new LinkedHashMap<>();
            edits.put("sub1", sub(s, 1, 1));
            edits.put("sub2", sub(s, 2, 1));
            edits.put("sub3", sub(s, 3, 1));
            edits.put("sub4", sub(s, 4, 1));
            edits.put("transpose", s.substring(0, 1) + s.charAt(2) + s.charAt(1) + s.substring(3));
            edits.put("delete", s.substring(0, s.length() - 1));
            edits.put("insert", s + "s");
            edits.put("insert2", "x" + s + "s");
            for (final Map.Entry<String, String> e: edits.entrySet()) {
                check("check/typo/" + s.length() + "/" + e.getKey() + "/[" + e.getValue() + "]", 2467, col, e.getValue());
            }
        }
    }

    /** Substitute {@code count} letters, every {@code step}-th from index 1, by the next letter of a-z. */
    private static String sub(final String s, final int count, final int step) {
        final char[] c = s.toCharArray();
        int done = 0;
        for (int i = 1; i < c.length && done < count; i += step) {
            if (Character.isLetter(c[i])) {
                c[i] = c[i] == 'z' ? 'a' : (char) (c[i] + 1);
                done++;
            }
        }
        return new String(c);
    }

    /** Case, whitespace and punctuation differences between answer and stored synonym (FuzzyMatching.cleanString). */
    private void normalization() throws Exception {
        final String hook = column(list("fish hook"));
        for (final String a: new String[] {"fish hook", "FISH HOOK", "Fish  Hook", "  fish hook  ", "\tfish hook\n", "fish\u00a0hook",
                "fish\u3000hook", "fish-hook", "fishhook", "fish hook.", "fish, hook", "fish_hook", "fish  hook!"}) {
            check("check/norm/fish-hook/[" + a + "]", 6, hook, a);
        }
        final String spaced = column(list("  big   dad "));
        for (final String a: new String[] {"big dad", "big   dad", "bigdad"}) {
            check("check/norm/stored-spaces/[" + a + "]", 512, spaced, a);
        }
        final String clock = column(list("o'clock"));
        for (final String a: new String[] {"o'clock", "o\u2019clock", "o`clock", "oclock", "O'CLOCK"}) {
            check("check/norm/apostrophe/[" + a + "]", 440, clock, a);
        }
        final String curly = column(list("o\u2019clock"));
        check("check/norm/stored-curly/[o'clock]", 440, curly, "o'clock");
        final String tenK = column(list("10k"));
        for (final String a: new String[] {"10k", "\uff11\uff10k", "\u0661\u0660k", "10K", "10 k"}) {
            check("check/norm/digits/[" + a + "]", 495, tenK, a);
        }
        final String self = column(list("self-control"));
        for (final String a: new String[] {"self-control", "self control", "selfcontrol", "self\u2013control", "self\u2014control"}) {
            check("check/norm/dash/[" + a + "]", 2476, self, a);
        }
        final String fullwidth = column(list("\uff50\uff41\uff50\uff41"));
        check("check/norm/stored-fullwidth/[papa]", 512, fullwidth, "papa");
        check("check/norm/stored-fullwidth/[\uff50\uff41\uff50\uff41]", 512, fullwidth, "\uff50\uff41\uff50\uff41");
    }

    /** Synonyms equal to, or close to, a WK meaning, auxiliary whitelist or blacklist entry. */
    private void meaningOverlap() throws Exception {
        check("check/overlap/equal-meaning/[one]", 2467, column(list("One")), "one");
        check("check/overlap/equal-meaning-lowercase-tie/[one]", 2467, column(list("one")), "one");
        check("check/overlap/equal-meaning-lowercase-tie/[ONE]", 2467, column(list("one")), "ONE");
        check("check/overlap/equal-whitelist/[1]", 2467, column(list("1")), "1");
        check("check/overlap/equal-blacklist/[bark]", 6, column(list("Bark")), "bark");
        check("check/overlap/equal-blacklist/[barb]", 6, column(list("Bark")), "barb");
        check("check/overlap/equal-blacklist/[mother]", 512, column(list("mother")), "mother");
        check("check/overlap/equal-blacklist/[thousand]", 495, column(list("Thousand")), "thousand");
        check("check/overlap/equal-blacklist/[1,000]", 495, column(list("1,000")), "1,000");
        check("check/overlap/equal-blacklist/[1000]", 495, column(list("1,000")), "1000");
        check("check/overlap/near-blacklist/[bark]", 6, column(list("barks")), "bark");
        check("check/overlap/near-blacklist/[barks]", 6, column(list("barks")), "barks");
        check("check/overlap/near-blacklist/[barkss]", 6, column(list("barks")), "barkss");
        check("check/overlap/blacklist-without-synonym/[bark]", 6, null, "bark");
        check("check/overlap/near-two-tie/[papas]", 512, column(list("papa", "pap\u0101", "papaa")), "papas");
        check("check/overlap/closer-synonym/[fathers]", 512, column(list("fathers")), "fathers");
        check("check/overlap/closer-synonym/[fatherz]", 512, column(list("fathers")), "fatherz");
    }

    /** Empty and whitespace-only synonyms (an empty reference has typo threshold 2) and duplicates. */
    private void emptyAndDuplicate() throws Exception {
        final String[] answers = {"", " ", "x", "ab", "abc", "papa", "pap", "father"};
        final String[][] cols = {{"[\"\"]", "empty"}, {"[\" \"]", "space"}, {"[\"\\t\"]", "tab"}, {"[\"\",\"papa\"]", "empty-and-papa"},
                {"[\"\\u3000\"]", "ideographic-space"}};
        for (final String[] c: cols) {
            for (final String a: answers) {
                check("check/empty/" + c[1] + "/[" + a + "]", 512, c[0], a);
            }
        }
        for (final String a: new String[] {"", " ", "ab"}) {
            check("check/empty/none/[" + a + "]", 512, null, a);
        }
        final String dup = column(list("papa", "papa", "Papa", " papa", "papa "));
        for (final String a: new String[] {"papa", "PAPA", "pap", "papaa"}) {
            check("check/duplicate/[" + a + "]", 512, dup, a);
        }
    }

    /** 10 synonyms (what StudyMaterialsActivity can hold) and 30 (the API has no such limit). */
    private void many() throws Exception {
        final List<String> ten = list("one", "single", "solo", "lone", "unit", "ace", "uno", "ein", "un", "first");
        final List<String> thirty = new ArrayList<>(ten);
        for (int i = 11; i <= 30; i++) {
            thirty.add("synonym number " + i);
        }
        for (final String a: new String[] {"one", "first", "uno", "ein", "un", "lone", "lones", "frist", "synonym number 3", "nothing"}) {
            check("check/many/10/[" + a + "]", 440, column(ten), a);
        }
        for (final String a: new String[] {"synonym number 11", "synonym number 30", "synonym number 31", "synonym numbr 22",
                "synonym number", "first"}) {
            check("check/many/30/[" + a + "]", 440, column(thirty), a);
        }
    }

    /** Non-ASCII synonyms: accents, ß, dotted İ, Greek, Japanese, emoji (UTF-16 length counts for the threshold). */
    private void nonAscii() throws Exception {
        final Object[][] c = {
                {"caf\u00e9", new String[] {"caf\u00e9", "cafe", "CAF\u00c9", "cafe\u0301"}},
                {"na\u00efve", new String[] {"na\u00efve", "naive", "NA\u00cfVE"}},
                {"stra\u00dfe", new String[] {"stra\u00dfe", "strasse", "STRASSE", "STRA\u1e9eE"}},
                {"\u0130stanbul", new String[] {"istanbul", "\u0130stanbul", "ISTANBUL", "i\u0307stanbul"}},
                {"\u03a3\u039f\u03a6\u039f\u03a3", new String[] {"\u03c3\u03bf\u03c6\u03bf\u03c3", "\u03c3\u03bf\u03c6\u03bf\u03c2", "\u03a3\u039f\u03a6\u039f\u03a3"}},
                {"\u3044\u3061", new String[] {"\u3044\u3061", "\u30a4\u30c1", "ichi", "\u3044\u3061\u3070\u3093"}},
                {"\u4e00\u756a", new String[] {"\u4e00\u756a", "\u4e00", "\u4e00\u756a\u76ee"}},
                {"\ud83c\udf7a", new String[] {"\ud83c\udf7a", "\ud83c\udf7b", "\ud83c\udf7a\ud83c\udf7a", "beer"}},
                {"one \ud83c\udf7a beer", new String[] {"one \ud83c\udf7a beer", "one beer", "one \ud83c\udf7b beer", "one  beer"}},
        };
        for (final Object[] e: c) {
            final String s = (String) e[0];
            for (final String a: (String[]) e[1]) {
                check("check/nonascii/[" + s + "]/[" + a + "]", 440, column(list(s)), a);
            }
        }
    }

    /** Characters that would be a separator in a delimited format; the column is a JSON array, so none is. */
    private void separatorLike() throws Exception {
        final String[] synonyms = {"one, two", "one;two", "one|two", "say \"one\"", "back\\slash", "[one]", "one/two", "</b>one",
                "line\nbreak", "tab\there", "{\"a\":1}", "null", "[]", "\"", ","};
        for (final String s: synonyms) {
            final String col = column(list(s, "plain"));
            check("check/separator/[" + s + "]/same", 440, col, s);
            check("check/separator/[" + s + "]/plain", 440, col, "plain");
        }
        check("check/separator/split-parts/[one]", 440, column(list("one, two")), "one");
        check("check/separator/split-parts/[two]", 440, column(list("one, two")), "two");
    }

    /** A synonym that is the reading: accepted before the reading-retry fallback; reading questions ignore synonyms. */
    private void readingOverlap() throws Exception {
        check("check/reading/romaji-synonym/[ichi]", 440, column(list("ichi")), "ichi");
        check("check/reading/romaji-no-synonym/[ichi]", 440, null, "ichi");
        check("check/reading/kana-synonym/[\u3044\u3061]", 440, column(list("\u3044\u3061")), "\u3044\u3061");
        check("check/reading/kana-no-synonym/[\u3044\u3061]", 440, null, "\u3044\u3061");
        check("check/reading/romaji-synonym-typo/[ichii]", 2467, column(list("ichi")), "ichii");
        check("check/reading/kana-vocab/[ohayou]", 9177, column(list("ohayou")), "ohayou");
        check("check/reading/radical/[ichi]", 1, column(list("ichi")), "ichi");
        for (final QuestionType q: new QuestionType[] {QuestionType.WANIKANI_KANJI_READING, QuestionType.WANIKANI_KANJI_ONYOMI}) {
            check("check/reading-question/" + q.name() + "/[single]", 440, column(list("single", "\u3072\u3068")), "single", q);
            check("check/reading-question/" + q.name() + "/[\u3072\u3068]", 440, column(list("single", "\u3072\u3068")), "\u3072\u3068", q);
            check("check/reading-question/" + q.name() + "/[\u3044\u3061]", 440, column(list("single", "\u3072\u3068")), "\u3044\u3061", q);
        }
        check("check/reading-question/WANIKANI_VOCAB_READING/[uno]", 2467, column(list("uno")), "uno", QuestionType.WANIKANI_VOCAB_READING);
    }

    /** What Subject.getMeaningSynonyms makes of column texts other than a clean JSON string array. */
    private void columnParsing() throws Exception {
        final String[][] cols = {
                {null, "null-column"}, {"", "empty-text"}, {"[]", "empty-array"}, {"null", "json-null"}, {"not json", "garbage"},
                {"papa", "bare-word"}, {"{\"a\":\"papa\"}", "object"}, {"\"papa\"", "json-string"}, {"[1, 2.5, true]", "scalars"},
                {"[\"papa\", null]", "null-element"}, {"[[\"papa\"]]", "nested"}, {"[\"papa\",]", "trailing-comma"},
                {" [\"papa\"] ", "padded"}, {"[\"papa\"] trailing", "trailing-text"}, {"[\"papa\"][\"x\"]", "two-arrays"},
                {"[\"\\u0070apa\"]", "unicode-escape"}, {"['papa']", "single-quotes"}, {"[\"papa\"", "unterminated"},
                {"[\"pa\\/pa\"]", "escaped-slash"}, {"[\"papa\",\"daddy\"]", "plain-compact"}, {"[ \"papa\" , \"daddy\" ]", "plain-spaced"},
                {"[\"papa\"]\n", "trailing-newline"}, {"\ufeff[\"papa\"]", "bom"},
        };
        for (final String[] c: cols) {
            for (final String a: new String[] {"papa", "1"}) {
                check("check/column/" + c[1] + "/[" + a + "]", 512, c[0], a);
            }
        }
    }

    // --- save and import ---------------------------------------------------------------------------

    private void save() throws Exception {
        // StudyMaterialsActivity: always 3 + 10 entries, synonym fields as typed (not trimmed), blanks for unused rows.
        saveCase("save/activity/two-synonyms", 512, activity(512, "Dad is papa", "", "papa", "daddy"), "papa", "daddy", "Papa", "father", "pap");
        saveCase("save/activity/gaps-and-spaces", 512, activity(512, "", "", "", " papa ", "", "  ", "daddy", "\t"),
                "papa", "daddy", "x", "ab", "abc");
        saveCase("save/activity/duplicates", 512, activity(512, "", "", "papa", "papa", "Papa"), "papa");
        saveCase("save/activity/all-ten", 440, activity(440, "m", "r", "one", "single", "solo", "lone", "unit", "ace", "uno", "ein", "un", "first"),
                "first", "un", "lone");
        saveCase("save/activity/cleared", 512, activity(512, "", ""), "papa", "father");
        saveCase("save/activity/special", 440, activity(440, "note with \"quotes\"\nand a newline", "\u8aad\u307f",
                "one, two", "say \"one\"", "back\\slash", "</b>", "\u3044\u3061", "\ud83c\udf7a", "caf\u00e9"),
                "one, two", "say \"one\"", "back\\slash", "</b>", "\u3044\u3061", "\ud83c\udf7a", "cafe");
        // SubjectInfoView.addSynonym: id, meaning note (or ""), reading note (or ""), existing synonyms, the new one trimmed,
        // not added when the list already contains it (case-sensitive).
        saveCase("save/add/first", 512, json(list("512", "", "", "papa")), "papa");
        saveCase("save/add/second", 512, json(list("512", "note", "", "papa", "daddy")), "papa", "daddy");
        saveCase("save/add/case-variant", 512, json(list("512", "", "", "papa", "Papa")), "papa", "PAPA");
        // Malformed data (no UI produces these).
        saveCase("save/bad/null-notes", 512, "[\"512\",null,null,\"papa\"]", "papa");
        saveCase("save/bad/null-synonym", 512, "[\"512\",\"\",\"\",null,\"papa\"]", "papa");
        saveCase("save/bad/too-short", 512, "[\"512\",\"\"]", "papa");
        saveCase("save/bad/id-not-number", 512, "[\"x\",\"\",\"\",\"papa\"]", "papa");
        saveCase("save/bad/numeric-entries", 512, "[512,1,2,3]", "3");
        saveCase("save/bad/not-json", 512, "papa", "papa");
    }

    private static String activity(final long id, final String meaningNote, final String readingNote, final String... synonyms)
            throws Exception {
        final List<String> data = new ArrayList<>();
        data.add(Long.toString(id));
        data.add(meaningNote);
        data.add(readingNote);
        for (int i = 0; i < 10; i++) {
            data.add(i < synonyms.length ? synonyms[i] : "");
        }
        return json(data);
    }

    @SuppressWarnings("unchecked")
    private void saveCase(final String name, final long subjectId, final String data, final String... answers) throws Exception {
        Map<String, Object> out;
        try {
            final SaveStudyMaterialJob job = new SaveStudyMaterialJob(data);
            final List<String> values = (List<String>) field(job, "values");
            final String col = serialize(values);
            out = obj("ok", true, "subjectId", field(job, "subjectId"), "meaningNote", field(job, "meaningNote"),
                    "readingNote", field(job, "readingNote"), "meaningSynonyms", new ArrayList<>(values),
                    "column", col, "checks", checks(subjectId, col, answers));
        } catch (final Exception e) {
            out = obj("ok", false, "error", e.getClass().getSimpleName());
        }
        w.add(name, obj("data", data, "subject", subjectId, "answers", Arrays.asList(answers)), out);
    }

    private void importStudyMaterials() throws Exception {
        importCase("import/plain", "{\"id\":7000000,\"object\":\"study_material\",\"data_updated_at\":\"2026-01-01T00:00:00.000000Z\","
                + "\"data\":{\"subject_id\":512,\"subject_type\":\"kanji\",\"meaning_note\":\"Dad\",\"reading_note\":null,"
                + "\"meaning_synonyms\":[\"papa\",\"daddy\"],\"hidden\":false}}", "papa", "daddy", "father");
        importCase("import/null-synonyms", "{\"id\":7000001,\"object\":\"study_material\",\"data\":{\"subject_id\":512,"
                + "\"meaning_note\":null,\"reading_note\":\"rn\",\"meaning_synonyms\":null}}", "papa");
        importCase("import/missing-synonyms", "{\"id\":7000002,\"object\":\"study_material\",\"data\":{\"subject_id\":512}}", "papa");
        importCase("import/empty-synonyms", "{\"id\":7000003,\"object\":\"study_material\",\"data\":{\"subject_id\":512,"
                + "\"meaning_note\":\"\",\"reading_note\":\"\",\"meaning_synonyms\":[]}}", "papa");
        importCase("import/blank-and-duplicate", "{\"id\":7000004,\"object\":\"study_material\",\"data\":{\"subject_id\":512,"
                + "\"meaning_synonyms\":[\"\",\" \",\"papa\",\"papa\",\"Papa \"]}}", "papa", "ab", "x");
        final StringBuilder many = new StringBuilder();
        for (int i = 1; i <= 25; i++) {
            many.append(i == 1 ? "" : ",").append("\"syn ").append(i).append('"');
        }
        importCase("import/twenty-five", "{\"id\":7000005,\"object\":\"study_material\",\"data\":{\"subject_id\":440,"
                + "\"meaning_synonyms\":[" + many + "]}}", "syn 1", "syn 25", "syn 26");
        importCase("import/non-ascii-and-specials", "{\"id\":7000006,\"object\":\"study_material\",\"data\":{\"subject_id\":440,"
                + "\"meaning_note\":\"\\u4e00\",\"meaning_synonyms\":[\"caf\\u00e9\",\"one, two\",\"say \\\"one\\\"\",\"\\ud83c\\udf7a\",\"a/b\"]}}",
                "cafe", "one, two", "say \"one\"", "\ud83c\udf7a", "a/b");
        importCase("import/scalar-synonyms", "{\"id\":7000007,\"object\":\"study_material\",\"data\":{\"subject_id\":440,"
                + "\"meaning_synonyms\":[1,true]}}", "1", "true");
        importCase("import/string-not-array", "{\"id\":7000008,\"object\":\"study_material\",\"data\":{\"subject_id\":440,"
                + "\"meaning_synonyms\":\"one\"}}", "one");
        importCase("import/unknown-fields", "{\"id\":7000009,\"object\":\"study_material\",\"data\":{\"subject_id\":440,"
                + "\"created_at\":\"2020-01-01T00:00:00.000000Z\",\"meaning_synonyms\":[\"single\"],\"extra\":{\"x\":1}}}", "single");
    }

    private void importCase(final String name, final String envelope, final String... answers) throws Exception {
        Map<String, Object> out;
        final JsonNode body = MAPPER.readTree(envelope);
        final long subjectId = body.path("data").path("subject_id").asLong();
        try {
            // ApiTask.parseEntity: Converters' mapper on the data object, then id and object from the envelope.
            final ObjectMapper mapper = Converters.getObjectMapper();
            final JsonParser parser = mapper.treeAsTokens(body.get("data"));
            final ApiStudyMaterial m = mapper.readValue(parser, ApiStudyMaterial.class);
            m.setId(body.get("id").asInt());
            final String col = serialize(m.getMeaningSynonyms());
            out = obj("ok", true, "subjectId", m.getSubjectId(), "studyMaterialId", m.getId(), "meaningNote", m.getMeaningNote(),
                    "readingNote", m.getReadingNote(),
                    "meaningSynonyms", m.getMeaningSynonyms() == null ? null : new ArrayList<>(m.getMeaningSynonyms()),
                    "column", col, "checks", rows.containsKey(subjectId) ? checks(subjectId, col, answers) : null);
        } catch (final Exception e) {
            out = obj("ok", false, "error", e.getClass().getSimpleName());
        }
        w.add(name, obj("envelope", body, "answers", Arrays.asList(answers)), out);
    }

    /** answer -> verdicts on the subject's meaning question type with that column. */
    private Map<String, Object> checks(final long subjectId, final @Nullable String col, final String... answers) throws Exception {
        final Map<String, Object> out = new LinkedHashMap<>();
        for (final String a: answers) {
            out.put(a, verdicts(meaningTypeOf(subjectId), subject(subjectId, col), a));
        }
        return out;
    }

    // --- helpers -----------------------------------------------------------------------------------

    private void check(final String name, final long subjectId, final @Nullable String col, final String answer) throws Exception {
        check(name, subjectId, col, answer, meaningTypeOf(subjectId));
    }

    private void check(final String name, final long subjectId, final @Nullable String col, final String answer, final QuestionType q)
            throws Exception {
        final Subject s = subject(subjectId, col);
        Object synonyms;
        try {
            synonyms = new ArrayList<>(s.getMeaningSynonyms());
        } catch (final RuntimeException e) {
            synonyms = obj("error", e.getClass().getSimpleName());
        }
        w.add(name, obj("subject", subjectId, "questionType", q.name(), "meaningSynonymsColumn", col, "answer", answer),
                obj("synonyms", synonyms, "verdicts", verdicts(q, s, answer)));
    }

    private static Map<String, Object> verdicts(final QuestionType q, final Subject s, final String answer) {
        final Map<String, Object> out = new LinkedHashMap<>();
        if (q.isMeaning()) {
            for (final CloseEnoughAction action: CloseEnoughAction.values()) {
                out.put(action.name(), safe(() -> q.checkAnswer(s, null, answer, action, false)));
            }
        }
        else {
            for (final boolean kata: new boolean[] {false, true}) {
                out.put("requireOnInKatakana=" + kata, safe(() -> q.checkAnswer(s, null, answer, CloseEnoughAction.SILENTLY_ACCEPT, kata)));
            }
        }
        return out;
    }

    private interface VerdictCall {
        AnswerVerdict run();
    }

    private static Object safe(final VerdictCall call) {
        try {
            return verdict(call.run());
        } catch (final RuntimeException e) {
            return obj("error", e.getClass().getSimpleName());
        }
    }

    /** A fresh Subject for the content row with the given meaningSynonyms column text (null = NULL). */
    private Subject subject(final long id, final @Nullable String col) {
        final JsonNode r = rows.get(id);
        final SubjectEntity e = new SubjectEntity();
        e.id = id;
        e.type = SubjectType.from(text(r, "object"));
        e.characters = text(r, "characters");
        e.hiddenAt = r.get("hiddenAt").asLong();
        e.meanings = text(r, "meanings");
        e.auxiliaryMeanings = text(r, "auxiliaryMeanings");
        e.readings = text(r, "readings");
        e.meaningSynonyms = col;
        return new Subject(e);
    }

    private Object subjectJson(final long id) throws Exception {
        final JsonNode r = rows.get(id);
        return obj("id", id, "object", text(r, "object"), "characters", text(r, "characters"), "hiddenAt", r.get("hiddenAt").asLong(),
                "meanings", tree(text(r, "meanings")), "auxiliaryMeanings", tree(text(r, "auxiliaryMeanings")),
                "readings", tree(text(r, "readings")));
    }

    private String firstMeaning(final long id) throws Exception {
        return MAPPER.readTree(text(rows.get(id), "meanings")).get(0).get("meaning").asText();
    }

    private QuestionType meaningTypeOf(final long id) {
        switch (text(rows.get(id), "object")) {
            case "radical": return QuestionType.WANIKANI_RADICAL_NAME;
            case "kanji": return QuestionType.WANIKANI_KANJI_MEANING;
            case "kana_vocabulary": return QuestionType.WANIKANI_KANA_VOCAB_MEANING;
            default: return QuestionType.WANIKANI_VOCAB_MEANING;
        }
    }

    private static List<String> names(final QuestionType q) {
        return list(q.name());
    }

    private static @Nullable String text(final JsonNode row, final String column) {
        final JsonNode v = row.get(column);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static @Nullable Object tree(final @Nullable String s) throws Exception {
        return s == null || s.isEmpty() ? null : MAPPER.readTree(s);
    }

    private static List<String> list(final String... values) {
        return new ArrayList<>(Arrays.asList(values));
    }

    private static String json(final Object value) throws Exception {
        return Converters.getObjectMapper().writeValueAsString(value);
    }

    /** The column text exactly as SubjectSyncDao stores a study material's synonyms. */
    private static String column(final List<String> synonyms) throws Exception {
        return serialize(synonyms);
    }

    private static String serialize(final @Nullable Collection<?> value) throws Exception {
        final Method m = SubjectSyncDao.class.getDeclaredMethod("serializeToJsonString", Collection.class);
        m.setAccessible(true);
        return (String) m.invoke(null, value);
    }

    private static Object field(final Object o, final String name) throws Exception {
        final Field f = o.getClass().getDeclaredField(name);
        f.setAccessible(true);
        return f.get(o);
    }
}
