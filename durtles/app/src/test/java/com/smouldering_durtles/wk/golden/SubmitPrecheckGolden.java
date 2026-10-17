package com.smouldering_durtles.wk.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.enums.SubjectType;
import com.smouldering_durtles.wk.model.AnswerVerdict;
import com.smouldering_durtles.wk.model.SubmitPrecheck;
import com.smouldering_durtles.wk.util.PseudoIme;

import org.junit.Assume;
import org.junit.Test;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.annotation.Nullable;

import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.MAPPER;
import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.verdict;
import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static com.smouldering_durtles.wk.util.ObjectSupport.isEmpty;
import static org.junit.Assert.assertTrue;

/**
 * Golden cases for what {@code Session.submit} does to a typed answer up to and including the answer
 * checker: {@link SubmitPrecheck#check} (empty check, trailing 'n' to 'ん', kana-only check,
 * expected-kana regex), then the trim, {@code Question.checkAnswer}'s empty check on the trimmed
 * answer and {@link QuestionType#checkAnswer}.
 *
 * <p>Input {@code {subject, questionType, answer, matchingKanji}}: the raw answer as the EditText gave
 * it. Output {@code {answer, trailingNFixed, rejectedBy, checkedAnswer, verdicts}}: {@code answer} is
 * the answer after the n fix (what Session stores back into FloatingUiState and what the
 * alternatives toast and the submit event see), {@code rejectedBy} is {@code "empty"},
 * {@code "non-kana"}, {@code "missing-kana"}, {@code "blank"} (trimmed answer empty, rejected by
 * Question.checkAnswer) or null, {@code checkedAnswer} is the trimmed answer checkAnswer received
 * (null if rejected before), {@code verdicts} is keyed like {@code answers/check-*} (CloseEnoughAction
 * names for meaning types, {@code requireOnInKatakana=false|true} for reading types); a rejection
 * gives the same verdict under every key. The synthetic file has every key; the content files only the
 * app defaults ({@code SILENTLY_ACCEPT}, {@code requireOnInKatakana=false}) to stay small, since
 * {@code answers/check-*} already covers the other variants.</p>
 *
 * <p>Not covered (state, not answer processing): submit returns NOK_WITHOUT_RETRY when there is no
 * current question or subject, and {@code (correct, retry=false)} when the question was already
 * answered.</p>
 */
public final class SubmitPrecheckGolden {
    private static final String SOURCE = "model/Session.submitHelper + model/SubmitPrecheck.check + model/Question.checkAnswer";

    private static final class Row {
        final long id;
        final String object;
        final @Nullable String characters;
        final String meanings;
        final String auxiliaryMeanings;
        final @Nullable String readings;

        Row(final long id, final String object, final @Nullable String characters, final String meanings,
            final String auxiliaryMeanings, final @Nullable String readings) {
            this.id = id;
            this.object = object;
            this.characters = characters;
            this.meanings = meanings;
            this.auxiliaryMeanings = auxiliaryMeanings;
            this.readings = readings;
        }

        Subject subject() {
            final SubjectEntity e = new SubjectEntity();
            e.id = id;
            e.type = SubjectType.from(object);
            e.characters = characters;
            e.meanings = meanings;
            e.auxiliaryMeanings = auxiliaryMeanings;
            e.readings = readings;
            return new Subject(e);
        }

        Object ref() throws Exception {
            if (id > 0) {
                return id;
            }
            return obj("id", id, "object", object, "characters", characters, "hiddenAt", 0L,
                    "meanings", tree(meanings), "auxiliaryMeanings", tree(auxiliaryMeanings), "readings", tree(readings));
        }

        private static @Nullable Object tree(final @Nullable String s) throws Exception {
            return s == null || s.isEmpty() ? null : MAPPER.readTree(s);
        }
    }

    private static Map<String, Object> run(final Row row, final @Nullable Row kanji, final QuestionType q, final String raw,
                                           final boolean allVariants) {
        final Subject s = row.subject();
        final @Nullable Subject mk = kanji == null ? null : kanji.subject();
        final Map<String, Object> out = new LinkedHashMap<>();
        final SubmitPrecheck p;
        try {
            p = SubmitPrecheck.check(q, s.getCharacters(), raw);
        } catch (final RuntimeException e) {
            out.put("error", e.getClass().getSimpleName());
            return out;
        }
        out.put("answer", p.getAnswer());
        out.put("trailingNFixed", p.isTrailingNFixed());
        final String trimmed = p.getAnswer().trim();
        final @Nullable AnswerVerdict rejection = p.getRejection() != null ? p.getRejection()
                : isEmpty(trimmed) ? AnswerVerdict.NOK_WITH_RETRY : null;
        out.put("rejectedBy", p.getRejection() != null ? p.getReason() : rejection != null ? "blank" : null);
        out.put("checkedAnswer", rejection == null ? trimmed : null);
        final Map<String, Object> verdicts = new LinkedHashMap<>();
        if (q.isMeaning()) {
            for (final CloseEnoughAction action: allVariants ? CloseEnoughAction.values()
                    : new CloseEnoughAction[] {CloseEnoughAction.SILENTLY_ACCEPT}) {
                verdicts.put(action.name(), rejection != null ? verdict(rejection)
                        : safe(() -> q.checkAnswer(s, mk, trimmed, action, false)));
            }
        }
        else {
            for (final boolean kata: allVariants ? new boolean[] {false, true} : new boolean[] {false}) {
                verdicts.put("requireOnInKatakana=" + kata, rejection != null ? verdict(rejection)
                        : safe(() -> q.checkAnswer(s, mk, trimmed, CloseEnoughAction.SILENTLY_ACCEPT, kata)));
            }
        }
        out.put("verdicts", verdicts);
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

    private interface Sink {
        void add(String name, Object input, Object output) throws Exception;
    }

    private static void emit(final Sink w, final String name, final Row row, final @Nullable Row kanji,
                             final QuestionType q, final String raw, final boolean allVariants) throws Exception {
        w.add(name, obj("subject", row.ref(), "questionType", q.name(), "answer", raw,
                "matchingKanji", kanji == null ? null : kanji.ref()), run(row, kanji, q, raw, allVariants));
    }

    private static String r(final String reading, final boolean accepted, final String type) {
        return "{\"reading\":\"" + reading + "\",\"primary\":" + accepted + ",\"accepted_answer\":" + accepted
                + (type == null ? "" : ",\"type\":\"" + type + "\"") + "}";
    }

    private static String m(final String meaning) {
        return "[{\"meaning\":\"" + meaning + "\",\"primary\":true,\"accepted_answer\":true}]";
    }

    @Test
    public void synthetic() throws Exception {
        final Row[] rows = {
                new Row(-1, "radical", "一", m("Ground"), "[]", null),
                new Row(-2, "radical", null, m("Gun"), "[]", null),
                new Row(-3, "kanji", "今", m("Now"), "[]", "[" + r("こん", true, "onyomi") + "," + r("いま", true, "kunyomi") + "]"),
                new Row(-4, "kanji", "一", m("One"), "[{\"meaning\":\"1\",\"type\":\"whitelist\"}]",
                        "[" + r("いち", true, "onyomi") + "," + r("ひと", false, "kunyomi") + "]"),
                new Row(-5, "vocabulary", "食べる", m("To Eat"), "[]", "[" + r("たべる", true, null) + "]"),
                new Row(-6, "vocabulary", "ビール", m("Beer"), "[]", "[" + r("びーる", true, null) + "]"),
                new Row(-7, "vocabulary", "〜目", m("Number"), "[]", "[" + r("め", true, null) + "]"),
                new Row(-8, "vocabulary", "一ヶ月", m("One Month"), "[]", "[" + r("いっかげつ", true, null) + "]"),
                new Row(-9, "vocabulary", "人々", m("People"), "[]", "[" + r("ひとびと", true, null) + "]"),
                new Row(-10, "vocabulary", "１日", m("First Day"), "[]", "[" + r("ついたち", true, null) + "]"),
                new Row(-11, "vocabulary", "お金", m("Money"), "[]", "[" + r("おかね", true, null) + "]"),
                new Row(-12, "vocabulary", "日本", m("Japan"), "[]", "[" + r("にほん", true, null) + "," + r("にっぽん", true, null) + "]"),
                new Row(-13, "kana_vocabulary", "ありがとう", m("Thank You"), "[]", null),
                new Row(-14, "vocabulary", "一", m("One"), "[]", "[" + r("いち", true, null) + "]"),
                new Row(-15, "vocabulary", "カ.ド", m("Regex Dot"), "[]", "[" + r("かあど", true, null) + "]"),
                new Row(-16, "vocabulary", null, m("No Characters"), "[]", "[" + r("なし", true, null) + "]"),
        };
        final Map<Long, String[]> extra = new HashMap<>();
        extra.put(-3L, new String[] {"こn", "kon", "con", "こんn", "コン", "こN", "n", "nn", "ん", "ko n", "いま", "いまn",
                "こん ", " こん", "こん　", "\tこん", "今", "こ・ん", "こーん", "ゝ", "゠", "぀", "ヿ", "〿", "㄀",
                "ｺﾝ", "ぁ"});
        extra.put(-4L, new String[] {"いち", "いちn", "ichi", "イチ", "ひと", "1"});
        extra.put(-5L, new String[] {"たべる", "タベル", "たべ", "べる", "たべるる", "たたべる", "たべるn", "たべれ", "食べる", "たべる "});
        extra.put(-6L, new String[] {"びーる", "ビール", "ビ-ル", "びいる", "ビールn", "ーる"});
        extra.put(-7L, new String[] {"め", "〜め", "ばんめ", "め "});
        extra.put(-8L, new String[] {"いっかげつ", "いっけげつ", "いっヶげつ", "かげつ", "いっかげつn", "イッカゲツ"});
        extra.put(-9L, new String[] {"ひとびと", "ひと", "々", "ひとびとn"});
        extra.put(-10L, new String[] {"ついたち", "いちにち", "日", "ついたちn"});
        extra.put(-11L, new String[] {"おかね", "かね", "オカネ", "おかねn", "おn"});
        extra.put(-12L, new String[] {"にほn", "にっぽn", "にほん", "にほ", "ニホン", "にほんn"});
        extra.put(-13L, new String[] {"ありがとう", "thank you", "thanks", "arigatou"});
        extra.put(-14L, new String[] {"いち", "ひと", "いちn"});
        extra.put(-15L, new String[] {"かあど", "かーど", "かど", "かxど", "カード"});
        extra.put(-16L, new String[] {"なし", "x"});
        final String[] meaningAnswers = {"", " ", "\t", "  ", "　", "one", " One ", "ONE", "onen", "on", "いち", "n"};
        final String[] common = {"", " ", "n", "N"};

        final Row kanjiOne = rows[3];
        try (final GoldenWriter w = GoldenWriter.open("answers/submit-precheck.json", "answers.submitPrecheck",
                SOURCE + " (synthetic subjects, every question type)")) {
            final Sink sink = w::add;
            for (final Row row: rows) {
                final @Nullable Row kanji = row.id == -14 ? kanjiOne : null;
                final Set<String> answers = new LinkedHashSet<>();
                for (final String a: common) {
                    answers.add(a);
                }
                for (final String a: extra.getOrDefault(row.id, new String[0])) {
                    answers.add(a);
                }
                for (final QuestionType q: QuestionType.values()) {
                    final Set<String> forType = new LinkedHashSet<>(answers);
                    if (q.isMeaning()) {
                        for (final String a: meaningAnswers) {
                            forType.add(a);
                        }
                        forType.add(row.subject().getMeanings().get(0).getMeaning());
                        forType.add(" " + row.subject().getMeanings().get(0).getMeaning() + "n ");
                    }
                    int n = 0;
                    for (final String a: forType) {
                        n++;
                        emit(sink, "syn" + (-row.id) + "-" + q.name() + "-" + n, row, kanji, q, a, true);
                    }
                }
            }
        }
    }

    private static @Nullable String text(final JsonNode row, final String column) {
        final JsonNode v = row.get(column);
        return v == null || v.isNull() ? null : v.asText();
    }

    @Test
    public void content() throws Exception {
        Assume.assumeTrue("content DB missing", GoldenContent.available());
        final JsonNode rows = GoldenContent.query("SELECT id, object, characters, hiddenAt, meanings, auxiliaryMeanings,"
                + " readings FROM subject ORDER BY id");
        final List<Row> subjects = new ArrayList<>();
        final Map<String, Row> kanjiByCharacters = new HashMap<>();
        for (final JsonNode j: rows) {
            final Row row = new Row(j.get("id").asLong(), text(j, "object"), text(j, "characters"),
                    text(j, "meanings"), text(j, "auxiliaryMeanings"), text(j, "readings"));
            subjects.add(row);
            // SubjectDao.getKanjiByCharacters: object = 'kanji' AND hiddenAt = 0 AND characters = ? LIMIT 1
            if ("kanji".equals(row.object) && j.get("hiddenAt").asLong() == 0 && row.characters != null
                    && !kanjiByCharacters.containsKey(row.characters)) {
                kanjiByCharacters.put(row.characters, row);
            }
        }
        int total = 0;
        try (final AnswerGoldenSupport.ShardedWriter w = new AnswerGoldenSupport.ShardedWriter("answers/submit-precheck-content",
                "answers.submitPrecheck", SOURCE + " (every subject, the question types it is asked)", 25_000)) {
            final Sink sink = w::add;
            for (final Row row: subjects) {
                final SubjectType type = SubjectType.from(row.object);
                final Set<QuestionType> types = EnumSet.noneOf(QuestionType.class);
                types.addAll(type.getPossibleQuestionTypes(false));
                types.addAll(type.getPossibleQuestionTypes(true));
                // The pre-checks only look at isKana() and the characters, so for kanji the on'yomi and
                // kun'yomi types would repeat the reading type's cases; check-* covers their verdicts.
                types.remove(QuestionType.WANIKANI_KANJI_ONYOMI);
                types.remove(QuestionType.WANIKANI_KANJI_KUNYOMI);
                final @Nullable Row kanji = "vocabulary".equals(row.object) && row.characters != null
                        && row.characters.length() == 1 ? kanjiByCharacters.get(row.characters) : null;
                final Subject s = row.subject();
                for (final QuestionType q: types) {
                    final Set<String> answers = q.isMeaning() ? meaningAnswers(s) : readingAnswers(s);
                    int n = 0;
                    for (final String a: answers) {
                        n++;
                        emit(sink, "s" + row.id + "-" + q.name() + "-" + n, row, kanji, q, a, false);
                    }
                }
            }
            total = w.total();
        }
        assertTrue(total > 20_000);
    }

    /** Meaning answers: only the empty check and the trim apply, so one per subject. */
    private static Set<String> meaningAnswers(final Subject s) {
        final Set<String> result = new LinkedHashSet<>();
        if (!s.getMeanings().isEmpty()) {
            final String primary = s.getMeanings().get(0).getMeaning();
            result.add(" " + primary + " ");
        }
        return result;
    }

    /**
     * Reading answers: each reading as typed, with a final ん typed as "n"; for the first two readings
     * also katakana and with an extra "n"; for the first reading also without the subject's trailing
     * kana and without its first character; for vocabulary also the subject's own characters.
     */
    private static Set<String> readingAnswers(final Subject s) {
        final Set<String> result = new LinkedHashSet<>();
        final String characters = s.getCharacters();
        final String okurigana = characters == null ? "" : trailingKana(characters);
        int i = 0;
        for (final com.smouldering_durtles.wk.api.model.Reading r: s.getReadings()) {
            final String reading = r.getReading();
            if (reading == null || reading.isEmpty()) {
                continue;
            }
            i++;
            result.add(reading);
            if (reading.endsWith("ん")) {
                result.add(reading.substring(0, reading.length() - 1) + "n");
            }
            if (i > 2) {
                continue;
            }
            result.add(PseudoIme.toKatakana(reading));
            result.add(reading + "n");
            if (i == 1) {
                if (!okurigana.isEmpty() && reading.endsWith(okurigana) && reading.length() > okurigana.length()) {
                    result.add(reading.substring(0, reading.length() - okurigana.length()));
                }
                if (reading.length() > 1) {
                    result.add(reading.substring(1));
                }
            }
        }
        if (characters != null && s.getType().isVocabulary()) {
            result.add(characters);
        }
        return result;
    }

    /** The kana (U+3040..U+30FF) at the end of the subject's characters. */
    private static String trailingKana(final String characters) {
        int i = characters.length();
        while (i > 0 && characters.charAt(i - 1) >= 0x3040 && characters.charAt(i - 1) <= 0x30FF) {
            i--;
        }
        return characters.substring(i);
    }
}
