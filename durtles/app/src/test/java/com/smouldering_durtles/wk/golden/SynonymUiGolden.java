package com.smouldering_durtles.wk.golden;

import com.smouldering_durtles.wk.db.dao.SubjectSyncDao;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.SubjectType;
import com.smouldering_durtles.wk.jobs.SaveStudyMaterialJob;
import com.smouldering_durtles.wk.util.StudyMaterialsSupport;

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

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;

/**
 * Golden cases for the study-material screens' own logic, {@code answers/synonyms-ui.json}, through
 * {@link StudyMaterialsSupport} (extracted unchanged from SubjectInfoView and StudyMaterialsActivity).
 *
 * <p>Case groups (by name prefix):</p>
 * <ul>
 *   <li>{@code input/...}: the "Add synonym" dialog text → {@code StudyMaterialsSupport.synonymInput} (String.trim,
 *   which strips only chars &lt;= U+0020). Output {@code {value, ignored}}, {@code ignored} when the value is empty
 *   (addSynonym then does nothing).</li>
 *   <li>{@code add/...}: SubjectInfoView.addSynonym, one or more dialog inputs in a row on a subject whose
 *   {@code meaningSynonyms} column, meaning note and reading note are given. Per step: the synonyms the view
 *   started from (Subject.getMeaningSynonyms, in memory), the trimmed value, the new list ({@code null} = nothing
 *   happens, no job), the job data, and what SaveStudyMaterialJob makes of it (stored column, notes, read back).</li>
 *   <li>{@code form/...}: StudyMaterialsActivity: the 10 synonym rows populated from the column
 *   ({@code fields}), then {@code edits} (row index → new text) and the note fields as given, the save job data
 *   and the SaveStudyMaterialJob result. Synonyms beyond the 10th are not shown and are dropped by any save
 *   ({@code notShown}). Notes are passed through untrimmed; the device file {@code synonyms-ui-device.json} shows
 *   what the real note fields do (null becomes "", maxLength 500).</li>
 * </ul>
 */
public final class SynonymUiGolden {
    private static final long SUBJECT = 512;

    private GoldenWriter w;

    @Test
    public void synonymUi() throws Exception {
        try (final GoldenWriter writer = GoldenWriter.open("answers/synonyms-ui.json", "answers.synonymsUi",
                "util/StudyMaterialsSupport (views/SubjectInfoView.addSynonym, activities/StudyMaterialsActivity),"
                        + " jobs/SaveStudyMaterialJob, db/model/Subject.getMeaningSynonyms")) {
            w = writer;
            input();
            add();
            form();
        }
    }

    // --- input -------------------------------------------------------------------------------------

    private void input() {
        final String[][] c = {
                {"plain", "papa"}, {"leading-trailing-spaces", "  papa  "}, {"inner-spaces-kept", " big  dad "},
                {"tabs-newlines", "\tpapa\n"}, {"crlf", "papa\r\n"}, {"empty", ""}, {"spaces-only", "   "},
                {"tab-only", "\t"}, {"newline-only", "\n"}, {"control-chars", "\u0001papa\u001f"},
                {"nbsp-kept", " papa "}, {"nbsp-only", " "}, {"ideographic-space-kept", "　パパ　"},
                {"ideographic-space-only", "　"}, {"em-space-only", " "}, {"zero-width-space", "​"},
                {"nel", "\u0085papa"}, {"del-kept", "papa\u007f"}, {"japanese", " 一番 "}, {"emoji", " 🍺 "},
        };
        for (final String[] e: c) {
            final String v = StudyMaterialsSupport.synonymInput(e[1]);
            w.add("input/" + e[0], obj("text", e[1]), obj("value", v, "ignored", StudyMaterialsSupport.addSynonym(new ArrayList<>(), v) == null));
        }
    }

    // --- add -----------------------------------------------------------------------------------------

    private void add() throws Exception {
        addCase("first", null, null, null, "papa");
        addCase("second", "[\"papa\"]", "Dad", "", "daddy");
        addCase("trimmed", "[\"papa\"]", null, null, "  daddy\t");
        addCase("duplicate-exact", "[\"papa\",\"daddy\"]", null, null, "papa");
        addCase("duplicate-after-trim", "[\"papa\"]", null, null, " papa ");
        addCase("case-variant-added", "[\"papa\"]", null, null, "Papa");
        addCase("upper-variant-added", "[\"papa\"]", null, null, "PAPA");
        addCase("stored-with-spaces-not-duplicate", "[\" papa \"]", null, null, "papa");
        addCase("empty-ignored", "[\"papa\"]", "note", "rnote", "");
        addCase("spaces-ignored", "[\"papa\"]", null, null, "   ");
        addCase("nbsp-only-added-and-saved", "[\"papa\"]", null, null, " ");
        addCase("ideographic-space-only-added-and-saved", "[\"papa\"]", null, null, "　");
        addCase("blank-and-null-entries-dropped", "[\"\",\" \",null,\"papa\"]", null, null, "daddy");
        addCase("garbage-column", "not json", null, null, "papa");
        addCase("notes-kept", "[]", "meaning note\nline 2", "  reading note  ", "papa");
        addCase("null-notes-become-empty", "[]", null, null, "papa");
        final StringBuilder twelve = new StringBuilder("[");
        for (int i = 1; i <= 12; i++) {
            twelve.append(i == 1 ? "" : ",").append("\"syn ").append(i).append('"');
        }
        twelve.append(']');
        addCase("beyond-ten-kept", twelve.toString(), null, null, "syn 13");
        addCase("beyond-ten-duplicate", twelve.toString(), null, null, "syn 12");
        addCase("special-characters", "[]", null, null, "say \"one\", <b>two</b> & back\\slash");
        addCase("sequence", "[\"papa\"]", "n", null, "daddy", " daddy", "Daddy", "", "pop", "papa");
    }

    private void addCase(final String label, final @Nullable String column, final @Nullable String meaningNote,
                         final @Nullable String readingNote, final String... typed) throws Exception {
        final Subject s = subject(column, meaningNote, readingNote);
        final List<Object> steps = new ArrayList<>();
        for (final String t: typed) {
            final List<String> current = new ArrayList<>(s.getMeaningSynonyms());
            final String value = StudyMaterialsSupport.synonymInput(t);
            final List<String> list = StudyMaterialsSupport.addSynonym(s.getMeaningSynonyms(), value);
            if (list == null) {
                steps.add(obj("typed", t, "current", current, "value", value, "list", null, "jobData", null, "job", null));
                continue;
            }
            s.setMeaningSynonyms(list);
            final String data = StudyMaterialsSupport.addSynonymJobData(s.getId(), s.getMeaningNote(), s.getReadingNote(), list);
            steps.add(obj("typed", t, "current", current, "value", value, "list", new ArrayList<>(list), "jobData", data, "job", job(data)));
        }
        w.add("add/" + label, obj("subject", SUBJECT, "meaningSynonymsColumn", column, "meaningNote", meaningNote,
                "readingNote", readingNote, "typed", Arrays.asList(typed)), obj("steps", steps));
    }

    // --- form ----------------------------------------------------------------------------------------

    private void form() throws Exception {
        formCase("empty", null, "", "", edits());
        formCase("two-unchanged", "[\"papa\",\"daddy\"]", "Dad", "", edits());
        formCase("ten-unchanged", columnOf(10), "", "", edits());
        formCase("eleven-drops-one", columnOf(11), "", "", edits());
        formCase("twenty-five-drops-fifteen", columnOf(25), "m", "r", edits());
        formCase("twelve-edit-row", columnOf(12), "", "", edits(3, "edited"));
        formCase("twelve-clear-all", columnOf(12), "", "", edits(0, "", 1, "", 2, "", 3, "", 4, "", 5, "", 6, "", 7, "", 8, "", 9, ""));
        formCase("blank-entries-skipped-on-load", "[\"\",\"papa\",\" \",null,\"daddy\"]", "", "", edits());
        formCase("garbage-column", "papa, daddy", "", "", edits(0, "papa"));
        formCase("add-in-gap", "[\"papa\"]", "", "", edits(5, "daddy"));
        formCase("typed-spaces-saved-untrimmed", "[]", "", "", edits(0, " papa ", 1, "  ", 2, "\t", 3, " "));
        formCase("duplicates-kept", "[]", "", "", edits(0, "papa", 1, "papa", 2, "Papa"));
        formCase("notes-untrimmed", "[]", "  meaning note \n", "\treading note ", edits());
        formCase("notes-whitespace-only", "[]", "   ", "\n", edits());
        formCase("special-characters", "[]", "note \"q\" </b> & \\", "読み",
                edits(0, "one, two", 1, "say \"one\"", 2, "🍺", 3, "café"));
    }

    private static Map<Integer, String> edits(final Object... indexAndText) {
        final Map<Integer, String> m = new LinkedHashMap<>();
        for (int i = 0; i < indexAndText.length; i += 2) {
            m.put((Integer) indexAndText[i], (String) indexAndText[i + 1]);
        }
        return m;
    }

    private void formCase(final String label, final @Nullable String column, final String meaningNoteField,
                          final String readingNoteField, final Map<Integer, String> edits) throws Exception {
        final Subject s = subject(column, null, null);
        final List<String> synonyms = new ArrayList<>(s.getMeaningSynonyms());
        final List<String> fields = StudyMaterialsSupport.formSynonymFields(s.getMeaningSynonyms());
        final List<String> edited = new ArrayList<>(fields);
        for (final Map.Entry<Integer, String> e: edits.entrySet()) {
            edited.set(e.getKey(), e.getValue());
        }
        final String data = StudyMaterialsSupport.formJobData(SUBJECT, meaningNoteField, readingNoteField, edited);
        final List<Object> editList = new ArrayList<>();
        for (final Map.Entry<Integer, String> e: edits.entrySet()) {
            editList.add(obj("row", e.getKey(), "text", e.getValue()));
        }
        w.add("form/" + label, obj("subject", SUBJECT, "meaningSynonymsColumn", column, "edits", editList,
                        "meaningNoteField", meaningNoteField, "readingNoteField", readingNoteField),
                obj("synonyms", synonyms, "fields", fields,
                        "notShown", synonyms.size() > fields.size() ? new ArrayList<>(synonyms.subList(fields.size(), synonyms.size()))
                                : new ArrayList<>(),
                        "edited", edited, "jobData", data, "job", job(data)));
    }

    private static String columnOf(final int n) throws Exception {
        final List<String> l = new ArrayList<>();
        for (int i = 1; i <= n; i++) {
            l.add("syn " + i);
        }
        return serialize(l);
    }

    // --- helpers -------------------------------------------------------------------------------------

    /** SaveStudyMaterialJob on the data: its fields, the column runLocal stores and the list read back from it. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> job(final String data) throws Exception {
        try {
            final SaveStudyMaterialJob job = new SaveStudyMaterialJob(data);
            final List<String> values = (List<String>) field(job, "values");
            final String col = serialize(values);
            final SubjectEntity e = new SubjectEntity();
            e.meaningSynonyms = col;
            return obj("ok", true, "subjectId", field(job, "subjectId"), "meaningNote", field(job, "meaningNote"),
                    "readingNote", field(job, "readingNote"), "meaningSynonyms", new ArrayList<>(values), "column", col,
                    "readBack", new ArrayList<>(new Subject(e).getMeaningSynonyms()));
        } catch (final Exception ex) {
            return obj("ok", false, "error", ex.getClass().getSimpleName());
        }
    }

    private static Subject subject(final @Nullable String column, final @Nullable String meaningNote, final @Nullable String readingNote) {
        final SubjectEntity e = new SubjectEntity();
        e.id = SUBJECT;
        e.type = SubjectType.WANIKANI_KANJI;
        e.characters = "父";
        e.meaningSynonyms = column;
        e.meaningNote = meaningNote;
        e.readingNote = readingNote;
        return new Subject(e);
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
