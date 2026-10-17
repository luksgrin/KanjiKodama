package com.smouldering_durtles.wk.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.enums.SubjectType;
import com.smouldering_durtles.wk.util.PseudoIme;

import org.junit.Assume;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import javax.annotation.Nullable;

import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.MAPPER;
import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.romanize;
import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.typo;
import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.verdict;
import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static org.junit.Assert.assertTrue;

/**
 * Golden cases for {@link QuestionType#checkAnswer} on every subject of the content DB and on a set of
 * synthetic subjects, which also covers {@code Reading.matches} / {@code matchesForDigraph} and the
 * fuzzy meaning match as the question types use them.
 *
 * <p>Each case is one (subject, question type, answer, matching kanji, meaning synonyms). The output
 * maps a variant to the verdict: for meaning question types the key is the {@link CloseEnoughAction}
 * (with requireOnInKatakana=false, which meaning types ignore); for reading question types the key is
 * {@code requireOnInKatakana=false|true} (with SILENTLY_ACCEPT, which reading types ignore).</p>
 *
 * <p>The answer is what checkAnswer receives, i.e. after Session.submit's trailing-n fix, kana
 * check and trim. Those steps live in Session and are not covered here.</p>
 */
public final class AnswerCheckGolden {
    private static final int SHARD = 25_000;

    /** Companion tie file of the current test (see {@link AnswerTies}), keyed by the same case names. */
    private static @Nullable GoldenWriter ties = null;

    /** One subject as checkAnswer sees it: the DB row's JSON columns plus optional synonyms. */
    private static final class Row {
        final long id;
        final String object;
        final String characters;
        final long hiddenAt;
        final String meanings;
        final String auxiliaryMeanings;
        final String readings;

        Row(final long id, final String object, final String characters, final long hiddenAt,
            final String meanings, final String auxiliaryMeanings, final String readings) {
            this.id = id;
            this.object = object;
            this.characters = characters;
            this.hiddenAt = hiddenAt;
            this.meanings = meanings;
            this.auxiliaryMeanings = auxiliaryMeanings;
            this.readings = readings;
        }

        Subject subject(final List<String> synonyms) throws Exception {
            final SubjectEntity e = new SubjectEntity();
            e.id = id;
            e.type = SubjectType.from(object);
            e.characters = characters;
            e.hiddenAt = hiddenAt;
            e.meanings = meanings;
            e.auxiliaryMeanings = auxiliaryMeanings;
            e.readings = readings;
            e.meaningSynonyms = synonyms.isEmpty() ? null : MAPPER.writeValueAsString(synonyms);
            return new Subject(e);
        }

        Object json() throws Exception {
            return obj("id", id, "object", object, "characters", characters, "hiddenAt", hiddenAt,
                    "meanings", tree(meanings), "auxiliaryMeanings", tree(auxiliaryMeanings), "readings", tree(readings));
        }

        private static Object tree(final String s) throws Exception {
            return s == null || s.isEmpty() ? null : MAPPER.readTree(s);
        }
    }

    /** An answer to check, with a short label saying how it was made. */
    private static final class Answer {
        final String kind;
        final String text;
        final List<String> synonyms;
        final boolean withMatchingKanji;

        Answer(final String kind, final String text, final List<String> synonyms, final boolean withMatchingKanji) {
            this.kind = kind;
            this.text = text;
            this.synonyms = synonyms;
            this.withMatchingKanji = withMatchingKanji;
        }
    }

    private static String text(final JsonNode row, final String column) {
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
        for (final JsonNode r: rows) {
            final Row row = new Row(r.get("id").asLong(), text(r, "object"), text(r, "characters"), r.get("hiddenAt").asLong(),
                    text(r, "meanings"), text(r, "auxiliaryMeanings"), text(r, "readings"));
            subjects.add(row);
            // SubjectDao.getKanjiByCharacters: object = 'kanji' AND hiddenAt = 0 AND characters = ? LIMIT 1
            if ("kanji".equals(row.object) && row.hiddenAt == 0 && row.characters != null
                    && !kanjiByCharacters.containsKey(row.characters)) {
                kanjiByCharacters.put(row.characters, row);
            }
        }

        try (final GoldenWriter w = GoldenWriter.openJsonl("answers/check-subjects.jsonl", "answers.checkSubjects",
                "db/model/Subject parsing + enums/SubjectType.getPossibleQuestionTypes")) {
            for (final Row row: subjects) {
                final SubjectType type = SubjectType.from(row.object);
                w.add("subject-" + row.id, row.json(), obj(
                        "questionTypes", names(type.getPossibleQuestionTypes(false)),
                        "questionTypesOnKun", names(type.getPossibleQuestionTypes(true))));
            }
        }

        final Map<QuestionType, AnswerGoldenSupport.ShardedWriter> writers = new EnumMap<>(QuestionType.class);
        ties = GoldenWriter.openJsonl("answers/check-ties.jsonl", "answers.checkTies",
                "enums/QuestionType meaning checkAnswer: tied accepted answers of answers/check-<meaning type>-N.jsonl");
        try {
            for (final QuestionType q: QuestionType.values()) {
                writers.put(q, new AnswerGoldenSupport.ShardedWriter("answers/check-" + shortName(q),
                        "answers.check", "enums/QuestionType." + q.name() + ".checkAnswer", SHARD));
            }
            for (int i = 0; i < subjects.size(); i++) {
                final Row row = subjects.get(i);
                final Row other = subjects.get((i + 1) % subjects.size());
                final @Nullable Row kanji = "vocabulary".equals(row.object) && row.characters != null
                        && row.characters.length() == 1 ? kanjiByCharacters.get(row.characters) : null;
                for (final QuestionType q: questionTypes(row)) {
                    check(writers.get(q), "s" + row.id, row, kanji, other, q);
                }
            }
        } finally {
            for (final AnswerGoldenSupport.ShardedWriter w: writers.values()) {
                w.close();
            }
            ties.close();
            ties = null;
        }
        int total = 0;
        for (final AnswerGoldenSupport.ShardedWriter w: writers.values()) {
            total += w.total();
        }
        assertTrue(total > 50_000);
    }

    @Test
    public void synthetic() throws Exception {
        final String one = "[{\"meaning\":\"One\",\"primary\":true,\"accepted_answer\":true}]";
        final Row[] rows = {
                new Row(-1, "radical", "一", 0, "[{\"meaning\":\"Ground\",\"primary\":true,\"accepted_answer\":true}]", "[]", null),
                new Row(-2, "radical", null, 0, "[{\"meaning\":\"Gun\",\"primary\":true,\"accepted_answer\":true},"
                        + "{\"meaning\":\"Lance\",\"primary\":false,\"accepted_answer\":false}]",
                        "[{\"meaning\":\"Spear\",\"type\":\"whitelist\"},{\"meaning\":\"Gum\",\"type\":\"blacklist\"}]", null),
                new Row(-3, "radical", "丨", 0, "[]", "[]", null),
                new Row(-4, "kanji", "一", 0, one, "[{\"meaning\":\"1\",\"type\":\"whitelist\"}]",
                        "[{\"reading\":\"いち\",\"primary\":true,\"accepted_answer\":true,\"type\":\"onyomi\"},"
                        + "{\"reading\":\"いつ\",\"primary\":false,\"accepted_answer\":true,\"type\":\"onyomi\"},"
                        + "{\"reading\":\"ひと\",\"primary\":false,\"accepted_answer\":false,\"type\":\"kunyomi\"},"
                        + "{\"reading\":\"かず\",\"primary\":false,\"accepted_answer\":false,\"type\":\"nanori\"}]"),
                new Row(-5, "kanji", "下", 0, "[{\"meaning\":\"Below\",\"primary\":true,\"accepted_answer\":true},"
                        + "{\"meaning\":\"Down\",\"primary\":false,\"accepted_answer\":true}]",
                        "[{\"meaning\":\"Under\",\"type\":\"whitelist\"},{\"meaning\":\"Bellow\",\"type\":\"blacklist\"}]",
                        "[{\"reading\":\"か\",\"primary\":true,\"accepted_answer\":true,\"type\":\"onyomi\"},"
                        + "{\"reading\":\"げ\",\"primary\":false,\"accepted_answer\":true,\"type\":\"onyomi\"},"
                        + "{\"reading\":\"した\",\"primary\":false,\"accepted_answer\":false,\"type\":\"kunyomi\"},"
                        + "{\"reading\":\"さ\",\"primary\":false,\"accepted_answer\":false,\"type\":\"kunyomi\"}]"),
                new Row(-6, "kanji", "込", 0, "[{\"meaning\":\"Crowded\",\"primary\":true,\"accepted_answer\":true}]", "[]",
                        "[{\"reading\":\"こ\",\"primary\":true,\"accepted_answer\":true,\"type\":\"kunyomi\"}]"),
                new Row(-7, "kanji", "今", 0, "[{\"meaning\":\"Now\",\"primary\":true,\"accepted_answer\":true}]", "[]",
                        "[{\"reading\":\"こん\",\"primary\":true,\"accepted_answer\":true,\"type\":\"onyomi\"},"
                        + "{\"reading\":\"きん\",\"primary\":false,\"accepted_answer\":false,\"type\":\"onyomi\"},"
                        + "{\"reading\":\"いま\",\"primary\":false,\"accepted_answer\":true,\"type\":\"kunyomi\"}]"),
                new Row(-8, "kanji", "中", 0, "[{\"meaning\":\"Middle\",\"primary\":true,\"accepted_answer\":true}]", "[]",
                        "[{\"reading\":\"ちゅう\",\"primary\":true,\"accepted_answer\":true,\"type\":\"onyomi\"},"
                        + "{\"reading\":\"じゅう\",\"primary\":false,\"accepted_answer\":false,\"type\":\"onyomi\"},"
                        + "{\"reading\":\"なか\",\"primary\":false,\"accepted_answer\":false,\"type\":\"kunyomi\"}]"),
                new Row(-9, "kanji", "曜", 0, "[{\"meaning\":\"Weekday\",\"primary\":true,\"accepted_answer\":true}]", "[]",
                        "[{\"reading\":\"よう\",\"primary\":true,\"accepted_answer\":false,\"type\":\"onyomi\"}]"),
                new Row(-10, "vocabulary", "一", 0, one, "[{\"meaning\":\"1\",\"type\":\"whitelist\"}]",
                        "[{\"reading\":\"いち\",\"primary\":true,\"accepted_answer\":true}]"),
                new Row(-11, "vocabulary", "今日", 0, "[{\"meaning\":\"Today\",\"primary\":true,\"accepted_answer\":true}]", "[]",
                        "[{\"reading\":\"きょう\",\"primary\":true,\"accepted_answer\":true},"
                        + "{\"reading\":\"こんにち\",\"primary\":false,\"accepted_answer\":false}]"),
                new Row(-12, "vocabulary", "学校", 0, "[{\"meaning\":\"School\",\"primary\":true,\"accepted_answer\":true}]", "[]",
                        "[{\"reading\":\"がっこう\",\"primary\":true,\"accepted_answer\":true}]"),
                new Row(-13, "vocabulary", "ビール", 0, "[{\"meaning\":\"Beer\",\"primary\":true,\"accepted_answer\":true}]", "[]",
                        "[{\"reading\":\"ビール\",\"primary\":true,\"accepted_answer\":true}]"),
                new Row(-14, "kana_vocabulary", "ありがとう", 0,
                        "[{\"meaning\":\"Thank You\",\"primary\":true,\"accepted_answer\":true},"
                        + "{\"meaning\":\"Thanks\",\"primary\":false,\"accepted_answer\":true}]", "[]", null),
                new Row(-15, "vocabulary", "百", 0, "[{\"meaning\":\"Hundred\",\"primary\":true,\"accepted_answer\":true}]", "[]",
                        "[{\"reading\":\"ひゃく\",\"primary\":true,\"accepted_answer\":true}]"),
        };
        final Row kanjiOne = rows[3];
        try (final GoldenWriter w = GoldenWriter.open("answers/check-synthetic.json", "answers.check",
                "enums/QuestionType.checkAnswer (synthetic subjects, every question type)")) {
            // No ties writer here: no synthetic case has a tie (tie-focused cases are in AnswerTiesGolden).
            final Sink sink = (name, input, output) -> w.add(name, input, output);
            for (int i = 0; i < rows.length; i++) {
                final Row row = rows[i];
                final Row other = rows[(i + 1) % rows.length];
                final @Nullable Row kanji = row.id == -10 ? kanjiOne : null;
                // Every question type, also those the subject type never asks, to pin the Java code itself.
                for (final QuestionType q: QuestionType.values()) {
                    check(sink, "syn" + (-row.id), row, kanji, other, q);
                }
            }
            final Subject s = kanjiOne.subject(Collections.<String>emptyList());
            final String[] odd = {"", " ", "いち ", " いち", "イチ", "ｲﾁ", "いちいち", "ichi", "一"};
            for (final String a: odd) {
                for (final QuestionType q: EnumSet.of(QuestionType.WANIKANI_KANJI_MEANING, QuestionType.WANIKANI_KANJI_READING,
                        QuestionType.WANIKANI_KANJI_ONYOMI)) {
                    w.add("odd-" + q.name() + "-[" + a + "]",
                            obj("subject", kanjiOne.json(), "questionType", q.name(), "answer", a, "matchingKanji", null,
                                    "meaningSynonyms", Collections.emptyList()),
                            outputs(q, s, null, a));
                }
            }
        }
    }

    /** Add the case's tie record to {@link #ties} (if open) when there is a tie. */
    private static void tie(final String name, final QuestionType q, final Subject s, final String answer) {
        final @Nullable Map<String, Object> t = AnswerTies.ties(q, s, answer);
        if (t != null && ties != null) {
            ties.add(name, obj("questionType", q.name(), "answer", answer), t);
        }
    }

    private interface Sink {
        void add(String name, Object input, Object output) throws Exception;
    }

    private static void check(final AnswerGoldenSupport.ShardedWriter w, final String prefix, final Row row,
                              final @Nullable Row kanji, final Row other, final QuestionType q) throws Exception {
        check((name, input, output) -> w.add(name, input, output), prefix, row, kanji, other, q);
    }

    /** Write all answers for one subject and question type. Content cases reference the subject by id. */
    private static void check(final Sink w, final String prefix, final Row row, final @Nullable Row kanji,
                              final Row other, final QuestionType q) throws Exception {
        final Subject plain = row.subject(Collections.<String>emptyList());
        final @Nullable Subject kanjiSubject = kanji == null ? null : kanji.subject(Collections.<String>emptyList());
        final Random random = new Random(row.id * 31 + q.ordinal());
        final List<Answer> answers = q.isMeaning()
                ? meaningAnswers(plain, other.subject(Collections.<String>emptyList()), random)
                : readingAnswers(plain, kanjiSubject, random);
        final Object subjectRef = row.id > 0 ? row.id : row.json();
        int n = 0;
        for (final Answer a: answers) {
            n++;
            final Subject s = a.synonyms.isEmpty() ? plain : row.subject(a.synonyms);
            final @Nullable Subject mk = a.withMatchingKanji ? kanjiSubject : null;
            w.add(prefix + "-" + q.name() + "-" + n + "-" + a.kind,
                    obj("subject", subjectRef, "questionType", q.name(), "answer", a.text,
                            "matchingKanji", mk == null ? null : (kanji.id > 0 ? (Object) kanji.id : kanji.json()),
                            "meaningSynonyms", a.synonyms),
                    outputs(q, s, mk, a.text));
            tie(prefix + "-" + q.name() + "-" + n + "-" + a.kind, q, s, a.text);
        }
    }

    private static Map<String, Object> outputs(final QuestionType q, final Subject s, final @Nullable Subject mk, final String answer) {
        final Map<String, Object> out = new LinkedHashMap<>();
        if (q.isMeaning()) {
            for (final CloseEnoughAction action: CloseEnoughAction.values()) {
                out.put(action.name(), safeVerdict(() -> q.checkAnswer(s, mk, answer, action, false)));
            }
        }
        else {
            for (final boolean kata: new boolean[] {false, true}) {
                out.put("requireOnInKatakana=" + kata, safeVerdict(() -> q.checkAnswer(s, mk, answer, CloseEnoughAction.SILENTLY_ACCEPT, kata)));
            }
        }
        return out;
    }

    private interface VerdictCall {
        com.smouldering_durtles.wk.model.AnswerVerdict run();
    }

    /** The verdict, or {@code {"error": "SimpleClassName"}} when checkAnswer throws (e.g. simulateInput on ""). */
    private static Object safeVerdict(final VerdictCall call) {
        try {
            return verdict(call.run());
        } catch (final RuntimeException e) {
            return obj("error", e.getClass().getSimpleName());
        }
    }

    private static List<Answer> meaningAnswers(final Subject s, final Subject other, final Random random) {
        final List<Answer> result = new ArrayList<>();
        final List<String> accepted = new ArrayList<>();
        final List<String> rejected = new ArrayList<>();
        s.getMeanings().forEach(m -> (m.isAcceptedAnswer() ? accepted : rejected).add(m.getMeaning()));
        s.getAuxiliaryMeanings().forEach(m -> {
            if (m.isWhiteList()) {
                accepted.add(m.getMeaning());
            }
            else if (m.isBlackList()) {
                rejected.add(m.getMeaning());
            }
        });
        final List<String> none = Collections.emptyList();
        final String primary = accepted.isEmpty() ? "nothing" : accepted.get(0);
        add(result, "correct", primary, none);
        add(result, "case-space", " " + primary.toUpperCase(Locale.ROOT).replace(" ", "  ") + " ", none);
        add(result, "typo1", typo(primary, 1, random), none);
        add(result, "typo2", typo(primary, 2, random), none);
        for (int i = 1; i < accepted.size() && i <= 2; i++) {
            add(result, "other-accepted", accepted.get(i).toLowerCase(Locale.ROOT), none);
        }
        for (int i = 0; i < rejected.size() && i < 2; i++) {
            add(result, "rejected", rejected.get(i), none);
            add(result, "rejected-typo1", typo(rejected.get(i), 1, random), none);
        }
        if (!s.getReadings().isEmpty()) {
            final String reading = s.getReadings().get(0).getReading();
            if (reading != null) {
                add(result, "reading-romaji", romanize(reading), none);
                add(result, "reading-kana", reading, none);
            }
        }
        if (!other.getMeanings().isEmpty()) {
            add(result, "wrong", other.getMeanings().get(0).getMeaning(), none);
        }
        if (Math.abs(s.getId()) % 10 == 0 || s.getId() < 0) {
            final List<String> synonyms = Collections.singletonList("my " + primary.toLowerCase(Locale.ROOT));
            add(result, "synonym", "my " + primary, synonyms);
            add(result, "synonym-typo1", typo("my " + primary, 1, random), synonyms);
        }
        return result;
    }

    private static final String SMALL = "ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ";
    private static final String REGULAR = "あいうえおつやゆよわかけアイウエオツヤユヨワカケ";

    private static List<Answer> readingAnswers(final Subject s, final @Nullable Subject kanji, final Random random) {
        final List<Answer> result = new ArrayList<>();
        final List<String> none = Collections.emptyList();
        int i = 0;
        for (final com.smouldering_durtles.wk.api.model.Reading r: s.getReadings()) {
            final String reading = r.getReading();
            if (reading == null) {
                continue;
            }
            i++;
            final String kind = (r.isAcceptedAnswer() ? "accepted-" : "unaccepted-") + (r.getType() == null ? "reading" : r.getType());
            add(result, kind, reading, none);
            final String katakana = PseudoIme.toKatakana(reading);
            if (!katakana.equals(reading)) {
                add(result, kind + "-katakana", katakana, none);
            }
            if (i <= 2) {
                final String slip = digraphSlip(reading);
                if (slip != null) {
                    add(result, kind + "-digraph", slip, none);
                    if (r.isOnYomi()) {
                        add(result, kind + "-digraph-katakana", PseudoIme.toKatakana(slip), none);
                    }
                }
                final String reverse = reverseDigraphSlip(reading);
                if (reverse != null) {
                    add(result, kind + "-small", reverse, none);
                }
            }
            if (i == 1) {
                add(result, kind + "-typo1", typo(reading, 1, random), none);
                add(result, kind + "-trailing", reading + "ん", none);
            }
        }
        if (!s.getMeanings().isEmpty()) {
            add(result, "meaning", s.getMeanings().get(0).getMeaning(), none);
        }
        if (kanji != null) {
            for (final com.smouldering_durtles.wk.api.model.Reading r: kanji.getReadings()) {
                if (r.getReading() != null) {
                    result.add(new Answer("kanji-" + r.getType(), r.getReading(), none, true));
                    result.add(new Answer("kanji-" + r.getType() + "-unset", r.getReading(), none, false));
                }
            }
        }
        return result;
    }

    /** First small kana typed as the regular one (しょ to しよ), or null. */
    private static @Nullable String digraphSlip(final String reading) {
        for (int i = 0; i < reading.length(); i++) {
            final int p = SMALL.indexOf(reading.charAt(i));
            if (p >= 0) {
                return reading.substring(0, i) + REGULAR.charAt(p) + reading.substring(i + 1);
            }
        }
        return null;
    }

    /** First や/ゆ/よ/つ after another kana typed small (しよう to しょう), or null. */
    private static @Nullable String reverseDigraphSlip(final String reading) {
        for (int i = 1; i < reading.length(); i++) {
            final int p = "やゆよつヤユヨツ".indexOf(reading.charAt(i));
            if (p >= 0) {
                return reading.substring(0, i) + "ゃゅょっャュョッ".charAt(p) + reading.substring(i + 1);
            }
        }
        return null;
    }

    private static void add(final List<Answer> result, final String kind, final String text, final List<String> synonyms) {
        for (final Answer a: result) {
            if (a.text.equals(text) && a.synonyms.equals(synonyms)) {
                return;
            }
        }
        result.add(new Answer(kind, text, synonyms, false));
    }

    private static List<QuestionType> questionTypes(final Row row) {
        final SubjectType type = SubjectType.from(row.object);
        final Set<QuestionType> set = EnumSet.noneOf(QuestionType.class);
        set.addAll(type.getPossibleQuestionTypes(false));
        set.addAll(type.getPossibleQuestionTypes(true));
        return new ArrayList<>(set);
    }

    private static List<String> names(final Iterable<QuestionType> types) {
        final List<String> result = new ArrayList<>();
        for (final QuestionType q: types) {
            result.add(q.name());
        }
        return result;
    }

    private static String shortName(final QuestionType q) {
        return q.name().replace("WANIKANI_", "").toLowerCase(Locale.ROOT).replace('_', '-');
    }
}
