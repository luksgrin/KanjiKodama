package com.smouldering_durtles.wk.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.smouldering_durtles.wk.api.model.AuxiliaryMeaning;
import com.smouldering_durtles.wk.api.model.Meaning;
import com.smouldering_durtles.wk.api.model.Reading;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.enums.SubjectType;
import com.smouldering_durtles.wk.model.AnswerVerdict;
import com.smouldering_durtles.wk.model.SubmitFeedback;
import com.smouldering_durtles.wk.model.SubmitPrecheck;
import com.smouldering_durtles.wk.util.PseudoIme;

import org.junit.Assume;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

import javax.annotation.Nullable;

import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.MAPPER;
import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.verdict;
import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static com.smouldering_durtles.wk.util.ObjectSupport.isEmpty;
import static org.junit.Assert.assertTrue;

/**
 * Golden cases for what {@code Session.submit} derives from the verdict for the UI, after
 * {@link SubmitPrecheck} and {@code checkAnswer} (see {@link SubmitPrecheckGolden}): the alternatives
 * ("other accepted answers") list ({@link SubmitFeedback#alternativeCandidates},
 * {@link SubmitFeedback#filterAlternatives}), the FloatingUiState fields submit assigns, and the texts
 * of the alternatives toast, the close-enough toast/message and the digraph message.
 *
 * <p>Input {@code {subject, questionType, answer, matchingKanji, meaningSynonyms, closeEnoughAction,
 * requireOnInKatakana}}: {@code answer} is the raw field text, as in {@code answers/submit-precheck*}.
 * Output {@code {verdict, sessionAnswer, candidates, alternatives, sets, ui, ties}}, see the README.</p>
 */
public final class SubmitAlternativesGolden {
    private static final String SOURCE = "model/Session.submitHelper (after checkAnswer) + model/SubmitFeedback"
            + " + activities/SessionActivity.showAlternativesToast/showCloseToast/showCloseMessage"
            + " + fragments/AnsweredSessionFragment (digraph text)";

    private static final class Row {
        final long id;
        final String object;
        final @Nullable String characters;
        final String meanings;
        final String auxiliaryMeanings;
        final @Nullable String readings;
        final List<String> synonyms;

        Row(final long id, final String object, final @Nullable String characters, final String meanings,
            final String auxiliaryMeanings, final @Nullable String readings, final List<String> synonyms) {
            this.id = id;
            this.object = object;
            this.characters = characters;
            this.meanings = meanings;
            this.auxiliaryMeanings = auxiliaryMeanings;
            this.readings = readings;
            this.synonyms = synonyms;
        }

        Subject subject() throws Exception {
            final SubjectEntity e = new SubjectEntity();
            e.id = id;
            e.type = SubjectType.from(object);
            e.characters = characters;
            e.hiddenAt = 0;
            e.meanings = meanings;
            e.auxiliaryMeanings = auxiliaryMeanings;
            e.readings = readings;
            e.meaningSynonyms = synonyms.isEmpty() ? null : MAPPER.writeValueAsString(synonyms);
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

    private interface Call<T> {
        T run();
    }

    private static <T> Object safe(final Call<T> call) {
        try {
            return call.run();
        } catch (final RuntimeException e) {
            return obj("error", e.getClass().getSimpleName());
        }
    }

    /** The filtered list for a given verdict, or {"error": ...}. */
    private static Object filtered(final List<String> candidates, final String sessionAnswer, final AnswerVerdict v) {
        return safe(() -> SubmitFeedback.filterAlternatives(candidates, sessionAnswer, v));
    }

    /** The alternatives toast text when the "alternatives toast" setting is on, or null. */
    private static @Nullable String toastText(final Object filtered) {
        if (!(filtered instanceof List) || ((List<?>) filtered).isEmpty()) {
            return null;
        }
        @SuppressWarnings("unchecked")
        final List<String> list = (List<String>) filtered;
        return SubmitFeedback.alternativesToastMessage(String.join(", ", list));
    }

    private static Map<String, Object> run(final Row row, final @Nullable Row kanji, final QuestionType q, final String raw,
                                           final CloseEnoughAction action, final boolean kata) throws Exception {
        final Subject s = row.subject();
        final @Nullable Subject mk = kanji == null ? null : kanji.subject();
        final Map<String, Object> out = new LinkedHashMap<>();
        final Map<String, Object> sets = new LinkedHashMap<>();
        final Map<String, Object> ui = new LinkedHashMap<>();

        // Session.submitHelper up to the verdict (see SubmitPrecheckGolden).
        final SubmitPrecheck p = SubmitPrecheck.check(q, s.getCharacters(), raw);
        final String sessionAnswer = p.getAnswer();
        final String trimmed = sessionAnswer.trim();
        final AnswerVerdict v;
        if (p.getRejection() != null) {
            v = p.getRejection();
        }
        else if (isEmpty(trimmed)) {
            v = AnswerVerdict.NOK_WITH_RETRY;
        }
        else {
            try {
                v = q.checkAnswer(s, mk, trimmed, action, kata);
            } catch (final RuntimeException e) {
                out.put("verdict", obj("error", e.getClass().getSimpleName()));
                return out;
            }
        }
        out.put("verdict", verdict(v));
        out.put("sessionAnswer", sessionAnswer);

        @Nullable Object candidates = null;
        @Nullable Object alternatives = null;
        @Nullable Map<String, Object> ties = null;
        if (v.isOk()) {
            // Correct: lastVerdict, the alternatives fields and showCloseToast are set.
            sets.put("lastVerdict", true);
            final Object c = safe(() -> SubmitFeedback.alternativeCandidates(q, s));
            candidates = c;
            if (c instanceof List) {
                @SuppressWarnings("unchecked")
                final List<String> list = (List<String>) c;
                alternatives = filtered(list, sessionAnswer, v);
                if (alternatives instanceof List) {
                    @SuppressWarnings("unchecked")
                    final List<String> f = (List<String>) alternatives;
                    sets.put("alternativesForLastCorrectAnswer", String.join(", ", f));
                    sets.put("showAlternativesToast", !f.isEmpty());
                }
            }
            else if (c == null) {
                sets.put("alternativesForLastCorrectAnswer", null);
            }
            if (!(c instanceof Map) && !(alternatives instanceof Map)) {
                sets.put("showCloseToast", v.isNearMatch());
            }
            ui.put("alternativesToast", toastText(alternatives));
            ui.put("closeEnough", v.isNearMatch() && action.isShowToast() ? SubmitFeedback.closeEnoughMessage(v) : null);
            ui.put("digraph", null);

            final @Nullable Map<String, Object> t = q.isMeaning() ? AnswerTies.ties(q, s, trimmed) : null;
            if (t != null && c instanceof List) {
                ties = new LinkedHashMap<>(t);
                final Map<String, Object> byPick = new LinkedHashMap<>();
                @SuppressWarnings("unchecked")
                final List<String> list = (List<String>) c;
                for (final Object pick: (List<?>) t.get("ties")) {
                    final AnswerVerdict pv = new AnswerVerdict(v.isOk(), v.isRetry(), v.isNearMatch(), v.getGivenAnswer(),
                            (String) pick, v.getDigraphMatch());
                    final Object f = filtered(list, sessionAnswer, pv);
                    byPick.put((String) pick, obj("alternatives", f, "alternativesToast", toastText(f),
                            "closeEnough", pv.isNearMatch() && action.isShowToast() ? SubmitFeedback.closeEnoughMessage(pv) : null));
                }
                ties.put("byPick", byPick);
            }
        }
        else if (!v.isRetry()) {
            // Incorrect: lastVerdict and showCloseToast are set, the alternatives fields keep their old values.
            sets.put("lastVerdict", true);
            sets.put("showCloseToast", false);
            ui.put("alternativesToast", null);
            ui.put("closeEnough", null);
            ui.put("digraph", v.getDigraphMatch() == null ? null : SubmitFeedback.digraphMessage(v.getDigraphMatch()));
        }
        else {
            // Retry (also pre-check rejections): nothing is set, the question stays unanswered.
            ui.put("alternativesToast", null);
            ui.put("closeEnough", null);
            ui.put("digraph", null);
        }
        out.put("candidates", candidates);
        out.put("alternatives", alternatives);
        out.put("sets", sets);
        out.put("ui", ui);
        out.put("ties", ties);
        return out;
    }

    private interface Sink {
        void add(String name, Object input, Object output) throws Exception;
    }

    private static void emit(final Sink w, final String name, final Row row, final @Nullable Row kanji,
                             final QuestionType q, final String raw, final CloseEnoughAction action,
                             final boolean kata) throws Exception {
        w.add(name, obj("subject", row.ref(), "questionType", q.name(), "answer", raw,
                "matchingKanji", kanji == null ? null : kanji.ref(), "meaningSynonyms", row.synonyms,
                "closeEnoughAction", action.name(), "requireOnInKatakana", kata),
                run(row, kanji, q, raw, action, kata));
    }

    /** Meanings, the first one primary; a leading "!" makes one not accepted; "\0" stands for a null meaning. */
    private static String m(final String... meanings) throws Exception {
        final List<Object> list = new ArrayList<>();
        for (int i = 0; i < meanings.length; i++) {
            final boolean accepted = !meanings[i].startsWith("!");
            final String text = accepted ? meanings[i] : meanings[i].substring(1);
            list.add(obj("meaning", text.equals("\0") ? null : text, "primary", i == 0, "accepted_answer", accepted));
        }
        return MAPPER.writeValueAsString(list);
    }

    /** Auxiliary meanings; "+X" is whitelist, "-X" blacklist. */
    private static String aux(final String... entries) throws Exception {
        final List<Object> list = new ArrayList<>();
        for (final String e: entries) {
            list.add(obj("meaning", e.substring(1), "type", e.charAt(0) == '+' ? "whitelist" : "blacklist"));
        }
        return MAPPER.writeValueAsString(list);
    }

    /**
     * Readings "kana:type" ("on", "kun", "nanori" or "" for none); a leading "!" makes one not accepted;
     * "\0" stands for a null reading.
     */
    private static String rd(final String... readings) throws Exception {
        final List<Object> list = new ArrayList<>();
        for (int i = 0; i < readings.length; i++) {
            final boolean accepted = !readings[i].startsWith("!");
            final String spec = accepted ? readings[i] : readings[i].substring(1);
            final int colon = spec.indexOf(':');
            final String kana0 = colon < 0 ? spec : spec.substring(0, colon);
            final @Nullable String kana = kana0.equals("\0") ? null : kana0;
            final String type = colon < 0 ? "" : spec.substring(colon + 1);
            final Map<String, Object> r = obj("reading", kana, "primary", i == 0, "accepted_answer", accepted);
            if (type.equals("on")) {
                r.put("type", "onyomi");
            }
            else if (type.equals("kun")) {
                r.put("type", "kunyomi");
            }
            else if (type.equals("nanori")) {
                r.put("type", "nanori");
            }
            list.add(r);
        }
        return MAPPER.writeValueAsString(list);
    }

    private static List<String> syn(final String... s) {
        return Arrays.asList(s);
    }

    private static final class Spec {
        final Row row;
        final String[] answers;

        Spec(final Row row, final String... answers) {
            this.row = row;
            this.answers = answers;
        }
    }

    @Test
    public void synthetic() throws Exception {
        final List<String> none = Collections.emptyList();
        final String noReadings = null;
        final String vr = rd("ご");
        final List<Spec> specs = new ArrayList<>();
        long id = -1;
        // Meaning questions.
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("The Heck", "Heck", "the heck", "The Hell"), "[]", vr, none),
                "heck", "Heck", "The heck", "THE HECK", "the heck", " heck ", "heck ", "hell", "the hell", "The Hell",
                "Hek", "The Hek", "the  heck", "thehell"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("Center", "center", "CENTER", "Centre"), "[]", vr, none),
                "center", "Center", "centre", "Centr", "Centar", "middle"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("One", "!Uno", "Single"), "[]", vr, none),
                "one", "single", "uno", "Singl"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("Sing"), aux("+Song", "-Sang"), vr, none),
                "sing", "song", "sang"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("Sing", "Chant"), aux("+Song", "-Sang"), vr, none),
                "sing", "song", "chant", "sang", "Chnt"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("Mouse", "Rat"), "[]", vr, syn("House Pet", "rat")),
                "mouse", "rat", "house pet", "House Pet", "Hous Pet"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("Dog"), "[]", vr, syn("Doggo")),
                "dog", "doggo", "Dgo"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("The", "the ", "Them", "Thee"), "[]", vr, none),
                "the", "The", "them", "thee", "the "));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("The The", "The", "the the the"), "[]", vr, none),
                "the the", "the", "the the the"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m(" The Heck", "Heck", "The  Heck", "THE Heck", "Thé Heck"), "[]", vr, none),
                "heck", "the heck"));
        // Ties: the matched answer follows Java's HashSet order; byPick has the result for every tied pick.
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("Center", "Centre", "Middle"), "[]", vr, none),
                "Centr", "center", "Middle"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("The Heck", "The Hell", "Darn"), "[]", vr, none),
                "The Hecl", "the hecl", "Hecl"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("Ice Cream", "Ice  Cream", "Gelato"), "[]", vr, none),
                "ice cream", "Ice  Cream", "Gelato"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("Bake", "Cake", "Lake"), "[]", vr, none),
                "Xake", "cake"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("Mouse", "Mice"), "[]", vr, syn("House")),
                "Gouse", "mice"));
        // Unusual characters and nulls.
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("İstanbul", "Istanbul", "ISTANBUL"), "[]", vr, none),
                "istanbul", "İstanbul"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("\0", "Two", "Pair"), "[]", vr, none),
                "two"));
        specs.add(new Spec(new Row(id--, "vocabulary", "語", m("Two", "\0", "Pair"), "[]", vr, none),
                "two", "pair"));
        // Other meaning subject types.
        specs.add(new Spec(new Row(id--, "radical", "一", m("Ground", "Floor", "The Ground"), "[]", null, none),
                "ground", "floor", "the ground", "Grond"));
        specs.add(new Spec(new Row(id--, "radical", null, m("Gun"), "[]", null, none), "gun"));
        specs.add(new Spec(new Row(id--, "kana_vocabulary", "ありがとう", m("Thank You", "Thanks", "the thanks"), "[]", noReadings, none),
                "thank you", "thanks", "Thank you "));
        // Kanji readings.
        specs.add(new Spec(new Row(id--, "kanji", "今", m("Now"), "[]", rd("こん:on", "きん:on", "いま:kun"), none),
                "こん", "コン", "きん", "キン", "いま", "イマ", "こn", "こんn", "now", "こ"));
        specs.add(new Spec(new Row(id--, "kanji", "一", m("One"), aux("+1"), rd("いち:on", "いつ:on", "!ひと:kun"), none),
                "いち", "イチ", "いつ", "ひと", "1"));
        specs.add(new Spec(new Row(id--, "kanji", "京", m("Capital"), "[]", rd("きょう:on", "けい:on", "!きん:on", "みやこ:kun"), none),
                "きょう", "キョウ", "きよう", "キヨウ", "けい", "みやこ", "きん", "きゆう"));
        specs.add(new Spec(new Row(id--, "kanji", "人", m("Person"), "[]", rd("じん:on", "にん:on", "!ひと:kun"), none),
                "じん", "にん", "ひと"));
        specs.add(new Spec(new Row(id--, "kanji", "日", m("Sun", "Day"), "[]", rd("にち:on", "じつ:on", "ひ:kun", "か:kun", "!び:kun"), none),
                "にち", "じつ", "ひ", "か", "び", "sun", "day"));
        // Vocabulary readings.
        specs.add(new Spec(new Row(id--, "vocabulary", "日本", m("Japan"), "[]", rd("にほん", "にっぽん"), none),
                "にほん", "にほn", "ニホン", "にっぽn", "にっぽん", "にほ"));
        specs.add(new Spec(new Row(id--, "vocabulary", "今日", m("Today", "This Day"), "[]", rd("きょう", "こんにち", "!こんじつ"), none),
                "きょう", "きよう", "キヨウ", "こんにち", "こんじつ", "today", "this day", "the today"));
        specs.add(new Spec(new Row(id--, "vocabulary", "人", m("Person"), "[]", rd("ひと", "ひと", "ヒト", "じん"), none),
                "ひと", "ヒト", "じん"));
        specs.add(new Spec(new Row(id--, "vocabulary", "ビール", m("Beer"), "[]", rd("びーる", "ビール"), none),
                "びーる", "ビール"));
        specs.add(new Spec(new Row(id--, "vocabulary", "東京", m("Tokyo"), "[]", rd("とうきょう"), none),
                "とうきょう", "とうきよう", "トウキヨウ"));
        specs.add(new Spec(new Row(id--, "vocabulary", "一", m("One"), "[]", rd("いち", "ひとつ"), none),
                "いち", "ひと", "ひとつ"));
        specs.add(new Spec(new Row(id--, "vocabulary", "二", m("Two"), "[]", rd("に", "\0"), none),
                "に"));

        final Row kanjiOne = specs.get(22).row;
        try (final GoldenWriter w = GoldenWriter.open("answers/submit-alternatives.json", "answers.submitAlternatives",
                SOURCE + " (synthetic subjects, every question type and variant)")) {
            final Sink sink = w::add;
            for (final Spec spec: specs) {
                final Row row = spec.row;
                final @Nullable Row kanji = "vocabulary".equals(row.object) && "一".equals(row.characters) ? kanjiOne : null;
                final SubjectType type = SubjectType.from(row.object);
                final Set<QuestionType> types = EnumSet.noneOf(QuestionType.class);
                types.addAll(type.getPossibleQuestionTypes(false));
                types.addAll(type.getPossibleQuestionTypes(true));
                for (final QuestionType q: types) {
                    int n = 0;
                    for (final String a: spec.answers) {
                        n++;
                        // Kana answers to meaning questions and latin answers to reading questions only
                        // reach the pre-checks or a plain rejection (answers/submit-precheck*).
                        if (q.isMeaning() == a.matches(".*[\u3040-\u30FF].*")) {
                            continue;
                        }
                        if (q.isMeaning()) {
                            for (final CloseEnoughAction action: CloseEnoughAction.values()) {
                                emit(sink, "syn" + (-row.id) + "-" + q.name() + "-" + n + "-" + action.name(),
                                        row, kanji, q, a, action, false);
                            }
                        }
                        else {
                            for (final boolean kata: new boolean[] {false, true}) {
                                emit(sink, "syn" + (-row.id) + "-" + q.name() + "-" + n + "-requireOnInKatakana=" + kata,
                                        row, kanji, q, a, CloseEnoughAction.SILENTLY_ACCEPT, kata);
                            }
                        }
                    }
                }
            }
        }
    }

    private static @Nullable String text(final JsonNode row, final String column) {
        final JsonNode v = row.get(column);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static final String SMALL = "ゃゅょャュョ";
    private static final String BIG = "やゆよヤユヨ";

    @Test
    public void content() throws Exception {
        Assume.assumeTrue("content DB missing", GoldenContent.available());
        final JsonNode rows = GoldenContent.query("SELECT id, object, characters, hiddenAt, meanings, auxiliaryMeanings,"
                + " readings FROM subject ORDER BY id");
        final List<Row> subjects = new ArrayList<>();
        final Map<String, Row> kanjiByCharacters = new HashMap<>();
        for (final JsonNode j: rows) {
            final Row row = new Row(j.get("id").asLong(), text(j, "object"), text(j, "characters"),
                    text(j, "meanings"), text(j, "auxiliaryMeanings"), text(j, "readings"), Collections.emptyList());
            subjects.add(row);
            // SubjectDao.getKanjiByCharacters: object = 'kanji' AND hiddenAt = 0 AND characters = ? LIMIT 1
            if ("kanji".equals(row.object) && j.get("hiddenAt").asLong() == 0 && row.characters != null
                    && !kanjiByCharacters.containsKey(row.characters)) {
                kanjiByCharacters.put(row.characters, row);
            }
        }
        int total;
        try (final AnswerGoldenSupport.ShardedWriter w = new AnswerGoldenSupport.ShardedWriter("answers/submit-alternatives-content",
                "answers.submitAlternatives", SOURCE + " (real subjects with more than one meaning or accepted reading,"
                + " and digraph slips)", 25_000)) {
            final Sink sink = w::add;
            for (final Row row: subjects) {
                final SubjectType type = SubjectType.from(row.object);
                final Set<QuestionType> types = EnumSet.noneOf(QuestionType.class);
                types.addAll(type.getPossibleQuestionTypes(false));
                types.addAll(type.getPossibleQuestionTypes(true));
                final @Nullable Row kanji = "vocabulary".equals(row.object) && row.characters != null
                        && row.characters.length() == 1 ? kanjiByCharacters.get(row.characters) : null;
                final Subject s = row.subject();
                for (final QuestionType q: types) {
                    final boolean hasAlternatives = SubmitFeedback.alternativeCandidates(q, s) != null;
                    final Map<String, CloseEnoughAction> answers = new LinkedHashMap<>();
                    if (q.isMeaning()) {
                        if (!hasAlternatives) {
                            continue;
                        }
                        for (final Meaning m: s.getMeanings()) {
                            final String meaning = m.getMeaning();
                            answers.put(meaning, CloseEnoughAction.SILENTLY_ACCEPT);
                            if (meaning.toLowerCase().startsWith("the ")) {
                                answers.putIfAbsent(meaning.substring(4), CloseEnoughAction.SILENTLY_ACCEPT);
                            }
                        }
                        for (final AuxiliaryMeaning m: s.getAuxiliaryMeanings()) {
                            if (m.isWhiteList()) {
                                answers.putIfAbsent(m.getMeaning(), CloseEnoughAction.SILENTLY_ACCEPT);
                            }
                        }
                        final String primary = s.getMeanings().get(0).getMeaning();
                        if (primary.length() >= 4) {
                            final String typo = AnswerGoldenSupport.typo(primary, 1, new Random(row.id));
                            answers.putIfAbsent(typo, CloseEnoughAction.ACCEPT_WITH_TOAST);
                        }
                    }
                    else {
                        if (q == QuestionType.WANIKANI_KANJI_ONYOMI || q == QuestionType.WANIKANI_KANJI_KUNYOMI) {
                            if (!hasAlternatives) {
                                continue;
                            }
                        }
                        for (final Reading r: s.getReadings()) {
                            final String reading = r.getReading();
                            if (reading == null || reading.isEmpty()) {
                                continue;
                            }
                            if (hasAlternatives) {
                                answers.putIfAbsent(reading, CloseEnoughAction.SILENTLY_ACCEPT);
                                answers.putIfAbsent(PseudoIme.toKatakana(reading), CloseEnoughAction.SILENTLY_ACCEPT);
                            }
                            if (r.isAcceptedAnswer() && q != QuestionType.WANIKANI_KANJI_ONYOMI
                                    && q != QuestionType.WANIKANI_KANJI_KUNYOMI) {
                                for (int i = 0; i < reading.length(); i++) {
                                    final int k = SMALL.indexOf(reading.charAt(i));
                                    if (k >= 0) {
                                        answers.putIfAbsent(reading.substring(0, i) + BIG.charAt(k) + reading.substring(i + 1),
                                                CloseEnoughAction.SILENTLY_ACCEPT);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    int n = 0;
                    for (final Map.Entry<String, CloseEnoughAction> e: answers.entrySet()) {
                        n++;
                        emit(sink, "s" + row.id + "-" + q.name() + "-" + n, row, kanji, q, e.getKey(), e.getValue(), false);
                    }
                }
            }
            total = w.total();
        }
        assertTrue(total > 10_000);
    }
}
