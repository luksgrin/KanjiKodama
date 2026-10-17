/*
 * KanjiKodama: the data-building parts of the two study-material UIs (StudyMaterialsActivity and
 * SubjectInfoView's "Add synonym" dialog), moved here unchanged so golden tests can run them on the JVM.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.util;

import static com.smouldering_durtles.wk.util.ObjectSupport.isEmpty;
import static com.smouldering_durtles.wk.util.ObjectSupport.orElse;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.smouldering_durtles.wk.db.Converters;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

import javax.annotation.Nullable;

/**
 * Pure helpers for the study-material screens; the job data they build goes to SaveStudyMaterialJob.
 */
public final class StudyMaterialsSupport {
    /** The number of synonym rows in StudyMaterialsActivity's form. */
    public static final int FORM_SYNONYM_ROWS = 10;

    private StudyMaterialsSupport() {
        //
    }

    /**
     * What the "Add synonym" dialog passes on: the field text, trimmed with String.trim.
     *
     * @param text the dialog's EditText contents
     * @return the trimmed text
     */
    public static String synonymInput(final CharSequence text) {
        return text.toString().trim();
    }

    /**
     * KanjiKodama: true when a synonym has no visible text: null, empty, or only whitespace and space characters,
     * including no-break and ideographic spaces (String.trim only strips up to U+0020).
     *
     * @param s the synonym
     * @return true if blank
     */
    public static boolean isBlank(final @Nullable CharSequence s) {
        if (s == null) {
            return true;
        }
        for (int i = 0; i < s.length(); i++) {
            final char c = s.charAt(i);
            if (!Character.isWhitespace(c) && !Character.isSpaceChar(c)) {
                return false;
            }
        }
        return true;
    }

    /**
     * KanjiKodama: the synonyms beyond the form's rows. The form shows only the first {@link #FORM_SYNONYM_ROWS}, and
     * saving it used to drop the rest; they are now appended to the saved list unchanged.
     *
     * @param synonyms the subject's current synonyms
     * @return the synonyms not shown in the form
     */
    public static List<String> formExtraSynonyms(final List<String> synonyms) {
        return synonyms.size() <= FORM_SYNONYM_ROWS
                ? new ArrayList<>() : new ArrayList<>(synonyms.subList(FORM_SYNONYM_ROWS, synonyms.size()));
    }

    /**
     * SubjectInfoView.addSynonym: the new synonym list, or null when nothing happens (empty value).
     * The value is appended unless the list already contains it (case-sensitive, exact).
     *
     * @param current the subject's current synonyms (Subject.getMeaningSynonyms)
     * @param value the trimmed dialog input
     * @return the new list, or null
     */
    public static @Nullable List<String> addSynonym(final List<String> current, final @Nullable String value) {
        if (isBlank(value)) {
            return null;
        }
        final List<String> list = new ArrayList<>(current);
        if (!list.contains(value)) {
            list.add(value);
        }
        return list;
    }

    /**
     * SubjectInfoView.addSynonym: the SaveStudyMaterialJob data for the new list.
     *
     * @param subjectId the subject id
     * @param meaningNote the subject's meaning note (null becomes "")
     * @param readingNote the subject's reading note (null becomes "")
     * @param synonyms the new synonym list
     * @return the job data
     * @throws JsonProcessingException never, realistically
     */
    public static String addSynonymJobData(final long subjectId, final @Nullable String meaningNote,
                                           final @Nullable String readingNote, final List<String> synonyms)
            throws JsonProcessingException {
        final List<String> list = new ArrayList<>(synonyms);
        list.add(0, Long.toString(subjectId));
        list.add(1, orElse(meaningNote, ""));
        list.add(2, orElse(readingNote, ""));
        return Converters.getObjectMapper().writeValueAsString(list);
    }

    /**
     * StudyMaterialsActivity.populateForm: the texts of the synonym rows. Synonyms beyond the 10th are not shown,
     * so saving the form drops them.
     *
     * @param synonyms the subject's synonyms (Subject.getMeaningSynonyms)
     * @return exactly FORM_SYNONYM_ROWS texts, "" for unused rows
     */
    public static List<String> formSynonymFields(final List<String> synonyms) {
        final List<String> padded = new ArrayList<>(synonyms);
        while (padded.size() < FORM_SYNONYM_ROWS) {
            padded.add("");
        }
        return new ArrayList<>(padded.subList(0, FORM_SYNONYM_ROWS));
    }

    /**
     * StudyMaterialsActivity.saveStudyMaterials: the SaveStudyMaterialJob data from the form's texts, as typed
     * (nothing is trimmed here).
     *
     * @param subjectId the subject id
     * @param meaningNote the meaning note field's text
     * @param readingNote the reading note field's text
     * @param synonymFields the synonym rows' texts, in row order
     * @return the job data
     * @throws JsonProcessingException never, realistically
     */
    public static String formJobData(final long subjectId, final String meaningNote, final String readingNote,
                                     final List<String> synonymFields) throws JsonProcessingException {
        final Collection<String> data = new ArrayList<>();
        data.add(Long.toString(subjectId));
        data.add(meaningNote);
        data.add(readingNote);
        data.addAll(synonymFields);
        return Converters.getObjectMapper().writeValueAsString(data);
    }
}
