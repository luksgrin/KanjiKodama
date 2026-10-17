package com.smouldering_durtles.wk.golden;

import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.db.model.SubjectEntity;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.enums.SubjectType;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.Nullable;

import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.MAPPER;
import static com.smouldering_durtles.wk.golden.AnswerGoldenSupport.verdict;
import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

/**
 * Tie-focused synthetic cases for the meaning question types (golden-a): subjects whose accepted
 * answers reach the same fuzzy score, so {@code matchedAnswer} follows Java's HashSet order (see
 * {@link AnswerTies}). Each case has the full verdict per {@link CloseEnoughAction} as in
 * {@code answers/check-synthetic.json}, plus the tie record. Several cases repeat a tie set in another
 * subject order, which shows that Java's pick does not follow the subject's meaning order.
 */
public final class AnswerTiesGolden {
    private static final class Spec {
        final String name;
        final String meanings;
        final String aux;
        final List<String> synonyms;
        final String answer;

        Spec(final String name, final String meanings, final String aux, final List<String> synonyms, final String answer) {
            this.name = name;
            this.meanings = meanings;
            this.aux = aux;
            this.synonyms = synonyms;
            this.answer = answer;
        }
    }

    /** Accepted meanings, the first one primary: {@code m("Center", "Centre")}. A leading "!" makes one not accepted. */
    private static String m(final String... meanings) throws Exception {
        final List<Object> list = new ArrayList<>();
        for (int i = 0; i < meanings.length; i++) {
            final boolean accepted = !meanings[i].startsWith("!");
            list.add(obj("meaning", accepted ? meanings[i] : meanings[i].substring(1), "primary", i == 0, "accepted_answer", accepted));
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

    private static List<String> syn(final String... s) {
        return Arrays.asList(s);
    }

    @Test
    public void ties() throws Exception {
        final List<String> none = Collections.emptyList();
        final Spec[] specs = {
                // Near match (score 1) on two meanings, both subject orders.
                new Spec("center-centre-typo", m("Center", "Centre"), aux(), none, "Centr"),
                new Spec("centre-center-typo", m("Centre", "Center"), aux(), none, "Centr"),
                new Spec("no-tie-exact", m("Center", "Centre"), aux(), none, "Center"),
                // Near match on a meaning and a whitelisted auxiliary meaning.
                new Spec("sing-song-aux", m("Sing"), aux("+Song"), none, "Sng"),
                new Spec("song-sing-aux", m("Song"), aux("+Sing"), none, "Sng"),
                // Three-way near match.
                new Spec("bake-cake-lake", m("Bake", "Cake", "Lake"), aux(), none, "Xake"),
                new Spec("lake-cake-bake", m("Lake", "Cake", "Bake"), aux(), none, "Xake"),
                // Tie at the same score as a rejected answer (accepted wins ties with rejected).
                new Spec("cake-lake-rejected-make", m("Cake", "Lake", "!Make"), aux(), none, "Xake"),
                new Spec("cake-lake-blacklist-make", m("Cake", "Lake"), aux("-Make"), none, "Xake"),
                // Exact tie (score 0): strings that differ only in what cleanString normalizes.
                new Spec("case-synonym", m("Ten"), aux(), syn("ten"), "ten"),
                new Spec("case-synonym-reversed", m("ten"), aux(), syn("Ten"), "TEN"),
                new Spec("dashes", m("-al", "–Al", "—Al"), aux(), none, "-al"),
                new Spec("dashes-reversed", m("—Al", "–Al", "-al"), aux(), none, "-al"),
                new Spec("fullwidth-percent", m("10 %", "10 ％"), aux(), none, "10 %"),
                new Spec("spaces", m("Ice Cream", "Ice  Cream"), aux(), none, "ice cream"),
                // "The" prefix: the alternatives toast strips "the " before comparing.
                new Spec("the-heck-the-hell", m("The Heck", "The Hell"), aux(), none, "The Hecl"),
                new Spec("the-hell-the-heck", m("The Hell", "The Heck"), aux(), none, "The Hecl"),
                // Synonym tying with a meaning on a near match.
                new Spec("synonym-near", m("Mouse"), aux(), syn("House"), "Gouse"),
                // No tie: one candidate strictly closer (control case).
                new Spec("no-tie-control", m("Center", "Centre"), aux(), none, "Centar"),
        };
        try (final GoldenWriter w = GoldenWriter.open("answers/check-ties-cases.json", "answers.checkTies",
                "enums/QuestionType.WANIKANI_VOCAB_MEANING.checkAnswer on subjects with tied accepted answers")) {
            long id = -101;
            for (final Spec spec: specs) {
                final SubjectEntity e = new SubjectEntity();
                e.id = id;
                e.type = SubjectType.from("vocabulary");
                e.characters = "語";
                e.hiddenAt = 0;
                e.meanings = spec.meanings;
                e.auxiliaryMeanings = spec.aux;
                e.readings = "[{\"reading\":\"ご\",\"primary\":true,\"accepted_answer\":true}]";
                e.meaningSynonyms = spec.synonyms.isEmpty() ? null : MAPPER.writeValueAsString(spec.synonyms);
                final Subject s = new Subject(e);
                final QuestionType q = QuestionType.WANIKANI_VOCAB_MEANING;
                final Map<String, Object> verdicts = new LinkedHashMap<>();
                for (final CloseEnoughAction action: CloseEnoughAction.values()) {
                    verdicts.put(action.name(), verdict(q.checkAnswer(s, null, spec.answer, action, false)));
                }
                final @Nullable Map<String, Object> ties = AnswerTies.ties(q, s, spec.answer);
                if (!spec.name.startsWith("no-tie")) {
                    assertNotNull(spec.name + " has no tie", ties);
                }
                final Object subject = obj("id", id, "object", "vocabulary", "characters", e.characters, "hiddenAt", 0L,
                        "meanings", MAPPER.readTree(e.meanings), "auxiliaryMeanings", MAPPER.readTree(e.auxiliaryMeanings),
                        "readings", MAPPER.readTree(e.readings));
                w.add(spec.name,
                        obj("subject", subject, "questionType", q.name(), "answer", spec.answer, "matchingKanji", null,
                                "meaningSynonyms", spec.synonyms),
                        obj("verdicts", verdicts, "ties", ties));
                id--;
            }
            assertEquals(specs.length, w.size());
        }
    }
}
