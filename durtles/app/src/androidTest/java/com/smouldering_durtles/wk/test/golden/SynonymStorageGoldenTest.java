/*
 * KanjiKodama golden fixtures (Tier B): study materials (notes and meaning synonyms) through Room and the progress file.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.database.Cursor;

import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.Converters;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.jobs.SaveStudyMaterialJob;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.local.LocalContent;
import com.smouldering_durtles.wk.local.LocalMode;
import com.smouldering_durtles.wk.local.ProgressStore;
import com.smouldering_durtles.wk.model.AnswerVerdict;
import com.smouldering_durtles.wk.util.ObjectSupport;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/**
 * Writes {@code answers/synonyms-storage.json}: the learner's study materials stored through the real Room DB,
 * exported to and restored from a progress file, then used by {@code QuestionType.checkAnswer}. RESETS THE APP'S
 * PROGRESS (back up first, see web/test/golden/README.md).
 *
 * <p>Every case starts from {@link ScenarioRunner#baseReset} and applies {@code ops} in order:
 * {@code {"save": data}} runs {@code new SaveStudyMaterialJob(data).runLocal()} (local mode, so no API task);
 * {@code {"import": [study material envelopes]}} runs WaniKaniImporter.apply with only those study materials;
 * {@code {"restore": progress file}} runs ProgressStore.restore. Output: the subject's study-material columns
 * after the ops ({@code stored}), the subject's entry in ProgressStore.export ({@code exported}, null when the
 * subject is not exported), the columns after restoring that export ({@code restored}), whether a second
 * export is identical, and the verdicts of {@code answers} on the subject read back from the DB.</p>
 */
@LargeTest
public final class SynonymStorageGoldenTest {
    private static final String[] COLUMNS = {"meaningNote", "meaningSynonyms", "readingNote", "studyMaterialId", "studyMaterialPatched",
            "unlockedAt"};

    private static Context context;
    private static Context testContext;

    @BeforeClass
    public static void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        testContext = InstrumentationRegistry.getInstrumentation().getContext();
        assertTrue("The app must be in local mode", LocalMode.isEnabled());
        final AppDatabase db = WkApplication.getDatabase();
        final long deadline = System.currentTimeMillis() + 120_000;
        while (!LocalContent.hasContent(db)) {
            assertTrue("Bundled content was not imported (is wk-content.db in the APK?)", System.currentTimeMillis() < deadline);
            Thread.sleep(500);
        }
        Thread.sleep(3000);
        Locale.setDefault(Locale.US);
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        GoldenWriter.setBaseDir(new File(context.getExternalFilesDir(null), "golden"));
    }

    @AfterClass
    public static void tearDown() {
        Clock.reset();
        ObjectSupport.unseedRandom();
    }

    private static String json(final Object value) throws Exception {
        return Converters.getObjectMapper().writeValueAsString(value);
    }

    /** StudyMaterialsActivity's data: id, meaning note, reading note, the 10 synonym fields as typed. */
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

    private static ObjectNode material(final long id, final long subjectId, final String meaningNote, final String readingNote,
                                       final String... synonyms) {
        final ObjectNode e = ScenarioRunner.JSON.createObjectNode();
        e.put("id", id);
        e.put("object", "study_material");
        e.put("data_updated_at", "2026-01-01T00:00:00.000000Z");
        final ObjectNode d = e.putObject("data");
        d.put("subject_id", subjectId);
        if (meaningNote == null) {
            d.putNull("meaning_note");
        }
        else {
            d.put("meaning_note", meaningNote);
        }
        if (readingNote == null) {
            d.putNull("reading_note");
        }
        else {
            d.put("reading_note", readingNote);
        }
        if (synonyms == null) {
            d.putNull("meaning_synonyms");
        }
        else {
            final ArrayNode a = d.putArray("meaning_synonyms");
            for (final String s: synonyms) {
                a.add(s);
            }
        }
        return e;
    }

    private static Object save(final String data) {
        return obj("save", data);
    }

    private static Object importOp(final ObjectNode... materials) {
        return obj("import", Arrays.asList(materials));
    }

    /** A minimal progress file with one subject entry. */
    private static Object restoreOp(final Map<String, Object> subjectEntry) {
        return obj("restore", obj("format", "kanjikodama-progress", "version", 1, "exportedAt", ScenarioRunner.T0, "userLevel", 1,
                "levelProgression", new ArrayList<>(), "subjects", Arrays.asList(subjectEntry), "curriculum", "WANIKANI",
                "probation", new ArrayList<>(), "jumps", new ArrayList<>()));
    }

    @Test
    public void synonymStorage() throws Exception {
        final AppDatabase db = WkApplication.getDatabase();
        final SupportSQLiteDatabase sql = db.getOpenHelper().getWritableDatabase();
        final ScenarioRunner runner = new ScenarioRunner(context, testContext);
        final Method importWaniKani = ScenarioRunner.class.getDeclaredMethod("importWaniKani", JsonNode.class);
        importWaniKani.setAccessible(true);

        final List<Object[]> cases = new ArrayList<>();
        // {name, subjectId, ops, answers}
        cases.add(new Object[] {"save-activity-two", 512L, Arrays.asList(save(activity(512, "Dad is papa", "", "papa", "daddy"))),
                new String[] {"papa", "daddy", "PAPA", "father", "pap", "x"}});
        cases.add(new Object[] {"save-activity-gaps-and-spaces", 512L,
                Arrays.asList(save(activity(512, "", "", "", " papa ", "", "  ", "daddy", "\t"))),
                new String[] {"papa", "daddy", "x", "ab", "abc"}});
        cases.add(new Object[] {"save-activity-duplicates", 512L, Arrays.asList(save(activity(512, "", "", "papa", "papa", "Papa"))),
                new String[] {"papa"}});
        cases.add(new Object[] {"save-activity-all-ten", 440L,
                Arrays.asList(save(activity(440, "m", "r", "one", "single", "solo", "lone", "unit", "ace", "uno", "ein", "un", "first"))),
                new String[] {"first", "un", "lone", "frist"}});
        cases.add(new Object[] {"save-then-clear", 512L,
                Arrays.asList(save(activity(512, "note", "rnote", "papa")), save(activity(512, "", ""))),
                new String[] {"papa", "father"}});
        cases.add(new Object[] {"save-notes-only", 2467L, Arrays.asList(save(activity(2467, "", "いち like itch"))),
                new String[] {"one", "itch"}});
        cases.add(new Object[] {"save-special-characters", 440L,
                Arrays.asList(save(activity(440, "note with \"quotes\"\nand a newline </b> / \\", "読み",
                        "one, two", "say \"one\"", "back\\slash", "</b>", "a/b", "いち", "🍺", "café", "tab\there",
                        "line\nbreak"))),
                new String[] {"one, two", "say \"one\"", "back\\slash", "</b>", "a/b", "いち", "🍺", "cafe", "tab here",
                        "line break"}});
        cases.add(new Object[] {"save-add-synonym", 9177L, Arrays.asList(save(json(Arrays.asList("9177", "", "", "morning"))),
                save(json(Arrays.asList("9177", "", "", "morning", "ohayo")))), new String[] {"morning", "ohayo", "good morning"}});
        cases.add(new Object[] {"save-unlocked-radical-blacklist-synonym", 6L, Arrays.asList(save(activity(6, "", "", "hook", "Bark"))),
                new String[] {"hook", "bark", "barb"}});
        cases.add(new Object[] {"import-plain", 512L, Arrays.asList(importOp(material(7000000, 512, "Dad", null, "papa", "daddy"))),
                new String[] {"papa", "daddy", "father"}});
        cases.add(new Object[] {"import-null-synonyms", 512L, Arrays.asList(importOp(material(7000001, 512, null, "rn", (String[]) null))),
                new String[] {"papa"}});
        cases.add(new Object[] {"import-empty", 512L, Arrays.asList(importOp(material(7000002, 512, "", "", new String[0]))),
                new String[] {"papa"}});
        cases.add(new Object[] {"import-blank-and-duplicate", 512L,
                Arrays.asList(importOp(material(7000003, 512, null, null, "", " ", "papa", "papa", "Papa "))),
                new String[] {"papa", "x", "ab", "abc"}});
        final String[] many = new String[25];
        for (int i = 0; i < many.length; i++) {
            many[i] = "syn " + (i + 1);
        }
        cases.add(new Object[] {"import-twenty-five", 440L, Arrays.asList(importOp(material(7000004, 440, null, null, many))),
                new String[] {"syn 1", "syn 25", "syn 26"}});
        cases.add(new Object[] {"import-then-save", 512L,
                Arrays.asList(importOp(material(7000005, 512, "Dad", null, "papa")), save(activity(512, "Dad", "", "papa", "daddy"))),
                new String[] {"papa", "daddy"}});
        cases.add(new Object[] {"save-then-import", 512L,
                Arrays.asList(save(activity(512, "local", "", "local syn")), importOp(material(7000006, 512, "remote", null, "remote syn"))),
                new String[] {"local syn", "remote syn"}});
        final Map<String, Object> asText = new LinkedHashMap<>();
        asText.put("id", 512);
        asText.put("meaningSynonyms", "[\"papa\",\"daddy\"]");
        cases.add(new Object[] {"restore-text", 512L, Arrays.asList(restoreOp(asText)), new String[] {"papa", "daddy"}});
        final Map<String, Object> asArray = new LinkedHashMap<>();
        asArray.put("id", 512);
        asArray.put("meaningSynonyms", Arrays.asList("papa", "daddy"));
        cases.add(new Object[] {"restore-array-not-text", 512L, Arrays.asList(restoreOp(asArray)), new String[] {"papa", "daddy"}});
        final Map<String, Object> garbage = new LinkedHashMap<>();
        garbage.put("id", 512);
        garbage.put("meaningSynonyms", "papa, daddy");
        garbage.put("meaningNote", "");
        cases.add(new Object[] {"restore-garbage-text", 512L, Arrays.asList(restoreOp(garbage)), new String[] {"papa", "papa, daddy"}});
        final Map<String, Object> number = new LinkedHashMap<>();
        number.put("id", 512);
        number.put("meaningSynonyms", 5);
        cases.add(new Object[] {"restore-number", 512L, Arrays.asList(restoreOp(number)), new String[] {"5"}});
        final Map<String, Object> nullElement = new LinkedHashMap<>();
        nullElement.put("id", 512);
        nullElement.put("meaningSynonyms", "[\"papa\",null]");
        cases.add(new Object[] {"restore-null-element", 512L, Arrays.asList(restoreOp(nullElement)), new String[] {"papa"}});
        final Map<String, Object> emptyText = new LinkedHashMap<>();
        emptyText.put("id", 512);
        emptyText.put("meaningSynonyms", "");
        cases.add(new Object[] {"restore-empty-text", 512L, Arrays.asList(restoreOp(emptyText)), new String[] {"papa"}});

        try (final GoldenWriter w = GoldenWriter.open("answers/synonyms-storage.json", "answers.synonymsStorage",
                "jobs/SaveStudyMaterialJob.runLocal, db/dao/SubjectSyncDao.insertOrUpdateStudyMaterial, tasks/WaniKaniImporter.apply,"
                        + " local/ProgressStore.export/restore, enums/QuestionType.checkAnswer")) {
            for (final Object[] c: cases) {
                final String name = (String) c[0];
                final long id = (Long) c[1];
                @SuppressWarnings("unchecked") final List<Object> ops = (List<Object>) c[2];
                final String[] answers = (String[]) c[3];
                runner.baseReset(1);
                final List<Object> opResults = new ArrayList<>();
                for (final Object op: ops) {
                    @SuppressWarnings("unchecked") final Map<String, Object> m = (Map<String, Object>) op;
                    try {
                        if (m.containsKey("save")) {
                            new SaveStudyMaterialJob((String) m.get("save")).runLocal();
                            opResults.add(obj("ok", true));
                        }
                        else if (m.containsKey("import")) {
                            final ObjectNode api = ScenarioRunner.JSON.createObjectNode();
                            api.set("user", ScenarioRunner.JSON.readTree("{\"level\":1,\"username\":\"golden-user\","
                                    + "\"max_level_granted_by_subscription\":60}"));
                            api.set("study_materials", ScenarioRunner.JSON.valueToTree(m.get("import")));
                            opResults.add(obj("ok", true, "summary", importWaniKani.invoke(runner, api)));
                        }
                        else {
                            ProgressStore.restore(db, ScenarioRunner.JSON.writeValueAsString(m.get("restore")));
                            opResults.add(obj("ok", true));
                        }
                    } catch (final Exception e) {
                        final Throwable t = e instanceof java.lang.reflect.InvocationTargetException ? e.getCause() : e;
                        opResults.add(obj("ok", false, "error", t.getClass().getName()));
                    }
                }
                final Map<String, Object> stored = row(sql, id);
                final Object storedSynonyms = synonyms(db, id);
                final String export = ProgressStore.export(db);
                final JsonNode exported = entry(export, id);
                ProgressStore.restore(db, export);
                final Map<String, Object> restored = row(sql, id);
                final String again = ProgressStore.export(db);
                final Subject s = db.subjectDao().getById(id);
                final QuestionType q = meaningType(s);
                final Map<String, Object> checks = new LinkedHashMap<>();
                for (final String a: answers) {
                    checks.put(a, verdicts(q, s, a));
                }
                w.add(name, obj("subject", id, "ops", ops, "answers", Arrays.asList(answers)),
                        obj("ops", opResults, "stored", stored, "storedSynonyms", storedSynonyms, "exported", exported,
                                "restored", restored, "restoredSynonyms", synonyms(db, id), "exportIdentical", export.equals(again),
                                "questionType", q.name(), "checks", checks));
            }
        }
        runner.baseReset(1);
    }

    private static QuestionType meaningType(final Subject s) {
        switch (s.getType()) {
            case WANIKANI_RADICAL: return QuestionType.WANIKANI_RADICAL_NAME;
            case WANIKANI_KANJI: return QuestionType.WANIKANI_KANJI_MEANING;
            case WANIKANI_KANA_VOCAB: return QuestionType.WANIKANI_KANA_VOCAB_MEANING;
            default: return QuestionType.WANIKANI_VOCAB_MEANING;
        }
    }

    private static Object synonyms(final AppDatabase db, final long id) {
        try {
            return new ArrayList<>(db.subjectDao().getById(id).getMeaningSynonyms());
        } catch (final RuntimeException e) {
            return obj("error", e.getClass().getSimpleName());
        }
    }

    /** The study-material columns with their SQLite storage class (type) so TEXT "5" and INTEGER 5 differ. */
    private static Map<String, Object> row(final SupportSQLiteDatabase sql, final long id) {
        final Map<String, Object> out = new LinkedHashMap<>();
        final StringBuilder cols = new StringBuilder();
        for (final String c: COLUMNS) {
            cols.append(cols.length() == 0 ? "" : ", ").append('`').append(c).append("`, typeof(`").append(c).append("`)");
        }
        try (final Cursor c = sql.query("SELECT " + cols + " FROM subject WHERE id = ?", new Object[] {id})) {
            c.moveToFirst();
            for (int i = 0; i < COLUMNS.length; i++) {
                final String type = c.getString(2 * i + 1);
                final Object value;
                if (c.isNull(2 * i)) {
                    value = null;
                }
                else if ("integer".equals(type)) {
                    value = c.getLong(2 * i);
                }
                else {
                    value = c.getString(2 * i);
                }
                out.put(COLUMNS[i], obj("type", type, "value", value));
            }
        }
        return out;
    }

    private static JsonNode entry(final String export, final long id) throws Exception {
        for (final JsonNode s: ScenarioRunner.JSON.readTree(export).path("subjects")) {
            if (s.path("id").asLong() == id) {
                return s;
            }
        }
        return null;
    }

    private static Map<String, Object> verdicts(final QuestionType q, final Subject s, final String answer) {
        final Map<String, Object> out = new LinkedHashMap<>();
        for (final CloseEnoughAction action: CloseEnoughAction.values()) {
            Object v;
            try {
                final AnswerVerdict r = q.checkAnswer(s, null, answer, action, false);
                v = obj("ok", r.isOk(), "retry", r.isRetry(), "nearMatch", r.isNearMatch(), "givenAnswer", r.getGivenAnswer(),
                        "matchedAnswer", r.getMatchedAnswer());
            } catch (final RuntimeException e) {
                v = obj("error", e.getClass().getSimpleName());
            }
            out.put(action.name(), v);
        }
        return out;
    }
}
