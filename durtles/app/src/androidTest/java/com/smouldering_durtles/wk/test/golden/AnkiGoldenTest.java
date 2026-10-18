/*
 * KanjiKodama golden fixtures (Tier B): Anki mode's settings and revealed answer text, over the real content.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.test.golden;

import static com.smouldering_durtles.wk.test.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Typeface;
import android.preference.PreferenceManager;
import android.text.Spanned;
import android.text.style.StyleSpan;

import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.smouldering_durtles.wk.GlobalSettings;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.db.AppDatabase;
import com.smouldering_durtles.wk.db.Converters;
import com.smouldering_durtles.wk.db.model.SessionItem;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.enums.SessionType;
import com.smouldering_durtles.wk.jobs.SaveStudyMaterialJob;
import com.smouldering_durtles.wk.local.Clock;
import com.smouldering_durtles.wk.local.LocalContent;
import com.smouldering_durtles.wk.local.LocalMode;
import com.smouldering_durtles.wk.model.Question;
import com.smouldering_durtles.wk.util.InflectionUtil;
import com.smouldering_durtles.wk.util.ObjectSupport;

import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;

import java.io.File;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.TreeSet;

/**
 * Writes the Anki mode fixtures (the session flow is in the {@code anki-*} scenarios). CHANGES THE APP'S PREFERENCES
 * (put back at the end) AND RESETS ITS PROGRESS (back up first, see web/test/golden/README.md).
 *
 * <ul>
 *   <li>{@code anki/mode-settings.json}: {@code GlobalSettings.getAnkiMode(sessionType, questionType)}, which
 *   SessionActivity uses to show AnkiSessionFragment instead of the typing screen, for every combination of
 *   enable_advanced and the six anki_mode_{lesson,review,self_study}_{meaning,reading} preferences. Output: per
 *   session type the question types that get Anki mode.</li>
 *   <li>{@code anki/answer-text.jsonl}: the answer AnkiSessionFragment reveals ("Show answer"), for every visible
 *   subject and each question type it can get, in a review session without randomized inflections. Per question
 *   type: {@code text}, what the screen shows ({@code Question.getAnkiAnswerRichText(...).toString()});
 *   {@code bold}, the bold ranges [start, end) of that same CharSequence (the primary meaning or reading when there
 *   are several); {@code shownStyled}, whether it has any style span. Kanji reading and on'yomi questions also have
 *   {@code katakana}: the same with show_onyomi_in_katakana on. Case {@code synonyms/<id>} is
 *   {@code Subject.getMeaningSynonymsRichText} (shown under a revealed meaning when the subject has user synonyms),
 *   after saving those synonyms. Cases {@code escape/<id>} reveal a real subject whose meanings and readings were
 *   replaced in memory with values containing {@code <}, {@code &} and {@code >}, which must show as typed.</li>
 *   <li>{@code anki/answer-inflection.json}: with review_randomize_inflections on, a verb or adjective question asks
 *   for an inflected form; the revealed text gets " (form)" appended. For two subjects of each part of speech that
 *   inflects and every form InflectionUtil can pick (Question's random pick is replaced by each form in turn):
 *   the question's characters and the revealed text for its meaning and reading questions.</li>
 * </ul>
 */
@LargeTest
public final class AnkiGoldenTest {
    private static final String[] MODE_KEYS = {"anki_mode_lesson_meaning", "anki_mode_lesson_reading",
            "anki_mode_review_meaning", "anki_mode_review_reading", "anki_mode_self_study_meaning",
            "anki_mode_self_study_reading"};
    private static final String[] TOUCHED = {"enable_advanced", "anki_mode_lesson_meaning", "anki_mode_lesson_reading",
            "anki_mode_review_meaning", "anki_mode_review_reading", "anki_mode_self_study_meaning",
            "anki_mode_self_study_reading", "show_onyomi_in_katakana", "review_randomize_inflections"};
    private static final String[] INFLECTING = {"godan verb", "ichidan verb", "する verb", "い adjective", "な adjective"};

    private static Context context;
    private static Context testContext;
    private static final Map<String, Object> original = new LinkedHashMap<>();

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
        final Map<String, ?> all = prefs().getAll();
        for (final String k: TOUCHED) {
            original.put(k, all.get(k));
        }
    }

    @AfterClass
    public static void tearDown() {
        final SharedPreferences.Editor e = prefs().edit();
        for (final Map.Entry<String, Object> p: original.entrySet()) {
            if (p.getValue() == null) {
                e.remove(p.getKey());
            }
            else {
                e.putBoolean(p.getKey(), (Boolean) p.getValue());
            }
        }
        e.commit();
        Clock.reset();
        ObjectSupport.unseedRandom();
    }

    private static SharedPreferences prefs() {
        return PreferenceManager.getDefaultSharedPreferences(context);
    }

    private static void set(final String key, final boolean value) {
        prefs().edit().putBoolean(key, value).commit();
    }

    @Test
    public void modeSettings() throws Exception {
        final SessionType[] sessionTypes = {SessionType.LESSON, SessionType.REVIEW, SessionType.SELF_STUDY, SessionType.NONE};
        try (final GoldenWriter w = GoldenWriter.open("anki/mode-settings.json", "anki.modeSettings",
                "GlobalSettings.getAnkiMode(sessionType, questionType)")) {
            for (int mask = 0; mask < 128; mask++) {
                final Map<String, Object> input = new LinkedHashMap<>();
                final boolean advanced = (mask & 64) != 0;
                set("enable_advanced", advanced);
                input.put("enable_advanced", advanced);
                for (int i = 0; i < MODE_KEYS.length; i++) {
                    final boolean v = (mask & (1 << i)) != 0;
                    set(MODE_KEYS[i], v);
                    input.put(MODE_KEYS[i], v);
                }
                final Map<String, Object> output = new LinkedHashMap<>();
                for (final SessionType st: sessionTypes) {
                    final List<String> on = new ArrayList<>();
                    for (final QuestionType qt: QuestionType.values()) {
                        if (GlobalSettings.getAnkiMode(st, qt)) {
                            on.add(qt.name());
                        }
                    }
                    output.put(st.name(), on);
                }
                w.add(String.format(Locale.ROOT, "%03d", mask), input, output);
            }
        }
    }

    private static List<Subject> visibleSubjects(final AppDatabase db) {
        final List<Long> ids = new ArrayList<>();
        try (Cursor c = db.getOpenHelper().getWritableDatabase().query(
                "SELECT id FROM subject WHERE hiddenAt = 0 AND object IS NOT NULL ORDER BY id")) {
            while (c.moveToNext()) {
                ids.add(c.getLong(0));
            }
        }
        final Map<Long, Subject> byId = new LinkedHashMap<>();
        for (int i = 0; i < ids.size(); i += 400) {
            for (final Subject s: db.subjectCollectionsDao().getByIds(ids.subList(i, Math.min(ids.size(), i + 400)))) {
                byId.put(s.getId(), s);
            }
        }
        final List<Subject> out = new ArrayList<>();
        for (final long id: ids) {
            out.add(byId.get(id));
        }
        return out;
    }

    private static Question question(final Subject subject, final QuestionType type) {
        final SessionItem item = new SessionItem();
        item.setId(subject.getId());
        item.setSubject(subject);
        return new Question(item, type);
    }

    private static List<Object> bold(final CharSequence cs) {
        final List<Object> out = new ArrayList<>();
        if (cs instanceof Spanned) {
            final Spanned sp = (Spanned) cs;
            for (final StyleSpan span: sp.getSpans(0, sp.length(), StyleSpan.class)) {
                if (span.getStyle() == Typeface.BOLD) {
                    out.add(Arrays.asList(sp.getSpanStart(span), sp.getSpanEnd(span)));
                }
            }
        }
        return out;
    }

    private static boolean styled(final CharSequence cs) {
        return cs instanceof Spanned && ((Spanned) cs).getSpans(0, cs.length(), Object.class).length > 0;
    }

    private static Map<String, Object> reveal(final Subject subject, final QuestionType type) {
        final CharSequence shown = question(subject, type).getAnkiAnswerRichText(subject, SessionType.REVIEW);
        return obj("text", shown.toString(), "bold", bold(shown), "shownStyled", styled(shown));
    }

    @Test
    public void answerText() throws Exception {
        new ScenarioRunner(context, testContext).baseReset(1);
        set("enable_advanced", false);
        set("review_randomize_inflections", false);
        final AppDatabase db = WkApplication.getDatabase();
        final List<Subject> subjects = visibleSubjects(db);
        try (final GoldenWriter w = GoldenWriter.openJsonl("anki/answer-text.jsonl", "anki.answerText",
                "model/Question.getAnkiAnswerRichText, enums/QuestionType.getAnkiAnswerRichText, "
                        + "db/model/Subject.getMeaningRichText / getRegularReadingRichText / getAcceptedOnYomiRichText / "
                        + "getAcceptedKunYomiRichText / getMeaningSynonymsRichText")) {
            for (final Subject s: subjects) {
                final TreeSet<QuestionType> types = new TreeSet<>(s.getType().getPossibleQuestionTypes(false));
                types.addAll(s.getType().getPossibleQuestionTypes(true));
                final Map<String, Object> output = new LinkedHashMap<>();
                for (final QuestionType t: types) {
                    set("show_onyomi_in_katakana", false);
                    final Map<String, Object> r = reveal(s, t);
                    if (t == QuestionType.WANIKANI_KANJI_READING || t == QuestionType.WANIKANI_KANJI_ONYOMI) {
                        set("show_onyomi_in_katakana", true);
                        r.put("katakana", reveal(s, t));
                    }
                    output.put(t.name(), r);
                }
                w.add(Long.toString(s.getId()), obj("id", s.getId(), "object", s.getType().name(), "characters",
                        s.getCharacters()), output);
            }
            set("show_onyomi_in_katakana", false);
            final Object[][] materials = {
                    {440L, new String[] {"uno", "single one"}},
                    {2467L, new String[] {"<b>tag</b> & co", "a, b"}},
            };
            for (final Object[] m: materials) {
                final long id = (Long) m[0];
                final List<String> data = new ArrayList<>(Arrays.asList(Long.toString(id), "", ""));
                data.addAll(Arrays.asList((String[]) m[1]));
                new SaveStudyMaterialJob(Converters.getObjectMapper().writeValueAsString(data)).runLocal();
                final Subject s = db.subjectDao().getById(id);
                final CharSequence cs = s.getMeaningSynonymsRichText();
                w.add("synonyms/" + id, obj("id", id, "synonyms", Arrays.asList((String[]) m[1])),
                        obj("hasMeaningSynonyms", s.hasMeaningSynonyms(), "text", cs.toString(), "bold", bold(cs)));
            }
            final String[][] escapes = {
                    {"[{\"meaning\":\"R&B <one>\",\"primary\":true,\"accepted_answer\":true},"
                            + "{\"meaning\":\"a < b & c > d\",\"primary\":false,\"accepted_answer\":true},"
                            + "{\"meaning\":\"&amp; &lt;b&gt;\",\"primary\":false,\"accepted_answer\":true}]",
                            "[{\"reading\":\"いち<b>\",\"primary\":true,\"accepted_answer\":true,\"type\":\"onyomi\"},"
                            + "{\"reading\":\"いつ&amp;\",\"primary\":false,\"accepted_answer\":true,\"type\":\"onyomi\"},"
                            + "{\"reading\":\"ひと<>\",\"primary\":false,\"accepted_answer\":true,\"type\":\"kunyomi\"}]"},
            };
            final Field entityField = Subject.class.getDeclaredField("entity");
            entityField.setAccessible(true);
            for (final String[] e: escapes) {
                final Subject s = db.subjectDao().getById(440);
                final SubjectEntity entity = (SubjectEntity) entityField.get(s);
                entity.meanings = e[0];
                entity.readings = e[1];
                entity.parsedMeanings = null;
                entity.parsedReadings = null;
                final Map<String, Object> output = new LinkedHashMap<>();
                final TreeSet<QuestionType> types = new TreeSet<>(s.getType().getPossibleQuestionTypes(false));
                types.addAll(s.getType().getPossibleQuestionTypes(true));
                for (final QuestionType t: types) {
                    output.put(t.name(), reveal(s, t));
                }
                w.add("escape/" + s.getId(), obj("id", s.getId(), "meanings", e[0], "readings", e[1]), output);
            }
        }
        new ScenarioRunner(context, testContext).baseReset(1);
    }

    @SuppressWarnings("unchecked")
    private static List<String> forms(final String mapName) throws Exception {
        final Field f = InflectionUtil.class.getDeclaredField(mapName);
        f.setAccessible(true);
        return new ArrayList<>(new TreeSet<>(((Map<String, ?>) f.get(null)).keySet()));
    }

    @Test
    public void answerInflection() throws Exception {
        set("enable_advanced", true);
        set("review_randomize_inflections", true);
        set("show_onyomi_in_katakana", false);
        final List<String> verbForms = forms("verbEndings");
        final List<String> adjectiveForms = forms("adjectiveEndings");
        final Field inflection = Question.class.getDeclaredField("inflection");
        inflection.setAccessible(true);
        final AppDatabase db = WkApplication.getDatabase();
        final List<Subject> subjects = visibleSubjects(db);
        try (final GoldenWriter w = GoldenWriter.open("anki/answer-inflection.json", "anki.answerInflection",
                "model/Question.getAnkiAnswerRichText and getCharacters with review_randomize_inflections")) {
            for (final String pos: INFLECTING) {
                int found = 0;
                for (final Subject s: subjects) {
                    if (found == 2) {
                        break;
                    }
                    if (!s.getPartsOfSpeech().contains(pos) || s.getType().getPossibleQuestionTypes(false).size() < 2) {
                        continue;
                    }
                    found++;
                    final List<String> forms = pos.endsWith("verb") ? verbForms : adjectiveForms;
                    for (final String form: forms) {
                        final Map<String, Object> output = new LinkedHashMap<>();
                        for (final QuestionType t: s.getType().getPossibleQuestionTypes(false)) {
                            final Question q = question(s, t);
                            inflection.set(q, form);
                            output.put(t.name(), obj("characters", q.getCharacters(s, SessionType.REVIEW),
                                    "text", q.getAnkiAnswerRichText(s, SessionType.REVIEW).toString()));
                        }
                        w.add(pos + "/" + s.getId() + "/" + form, obj("id", s.getId(), "characters", s.getCharacters(),
                                "partsOfSpeech", s.getPartsOfSpeech(), "form", form), output);
                    }
                }
            }
        }
    }
}
