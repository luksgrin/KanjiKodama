/*
 * Copyright 2019-2020 Ernst Jan Plugge <rmc@dds.nl>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package com.smouldering_durtles.wk.model;

import com.smouldering_durtles.wk.api.model.Meaning;
import com.smouldering_durtles.wk.api.model.Reading;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.enums.QuestionType;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import javax.annotation.Nullable;

/**
 * What {@link Session#submit} and the session UI derive from a verdict for the user: the list for the
 * "other accepted answers" (alternatives) toast, and the texts of the alternatives toast, the
 * close-enough toast/message and the digraph message.
 *
 * <p>KanjiKodama: moved out of Session.submitHelper, SessionActivity.showAlternativesToast,
 * showCloseToast/showCloseMessage and AnsweredSessionFragment unchanged (same expressions, same order)
 * so golden tests can run them on the plain JVM. The callers still decide when each is shown and keep
 * the FloatingUiState bookkeeping.</p>
 */
public final class SubmitFeedback {
    private SubmitFeedback() {
        //
    }

    /**
     * The alternatives before filtering: all meanings (accepted or not) for a meaning question when
     * the subject has more than one, all accepted readings for a reading question when there is more
     * than one, otherwise null (Session then sets alternativesForLastCorrectAnswer to null).
     *
     * @param type the question type
     * @param subject the subject
     * @return the list or null
     */
    public static @Nullable List<String> alternativeCandidates(final QuestionType type, final Subject subject) {
        List<String> alternatives = null;
        if (type.isMeaning() && subject.getMeanings().size() > 1) {
            alternatives = subject.getMeanings().stream().map(Meaning::getMeaning).collect(Collectors.toList());
        } else if (type.isReading() && subject.getAcceptedReadings().size() > 1) {
            alternatives = subject.getAcceptedReadings().stream().map(Reading::getReading).collect(Collectors.toList());
        }
        return alternatives;
    }

    /**
     * Filter the alternatives: compare lower-cased and without a leading "the ", drop the ones equal to
     * the current answer or to the verdict's matched answer, and drop later duplicates. The kept
     * entries are returned as they were (original case, with "The").
     *
     * @param alternatives the candidates from {@link #alternativeCandidates}
     * @param currentAnswer the answer as Session holds it (after the trailing-n fix, not trimmed)
     * @param lastVerdict the verdict (Session passes FloatingUiState.lastVerdict, just set to the verdict)
     * @return the filtered list
     */
    public static List<String> filterAlternatives(final List<String> alternatives, final String currentAnswer,
                                                  final @Nullable AnswerVerdict lastVerdict) {
        List<String> filteredAlternatives = new ArrayList<>();
        Set<String> uniqueAlternativesWithoutThe = new HashSet<>();
        String lowerCaseCurrentAnswer = currentAnswer.toLowerCase().replaceFirst("^the ", "");
        String closeEnoughAnswer = lastVerdict != null ? lastVerdict.getMatchedAnswer().toLowerCase().replaceFirst("^the ", "") : null;

        for (String alternative : alternatives) {
            String lowerCaseAlternative = alternative.toLowerCase();
            String alternativeWithoutThe = lowerCaseAlternative.replaceFirst("^the ", "");

            if (alternativeWithoutThe.equals(lowerCaseCurrentAnswer) || alternativeWithoutThe.equals(closeEnoughAnswer)) {
                continue;
            }

            if (uniqueAlternativesWithoutThe.contains(alternativeWithoutThe)) {
                continue;
            }

            uniqueAlternativesWithoutThe.add(alternativeWithoutThe);
            filteredAlternatives.add(alternative);
        }
        return filteredAlternatives;
    }

    /**
     * The alternatives toast text.
     *
     * @param alternativesForLastCorrectAnswer the filtered alternatives joined with ", "
     * @return the text
     */
    public static String alternativesToastMessage(final String alternativesForLastCorrectAnswer) {
        return "Alt: " + alternativesForLastCorrectAnswer;
    }

    /**
     * The close-enough toast/message text (both use the same text).
     *
     * @param verdict the verdict
     * @return the text
     */
    public static String closeEnoughMessage(final AnswerVerdict verdict) {
        return String.format("Your answer ('%s') was a bit off, the closest correct answer was '%s'. "
                + "Check the meaning to make sure you are correct.",
                verdict.getGivenAnswer(),
                verdict.getMatchedAnswer());
    }

    /**
     * The digraph message on the answered-question screen.
     *
     * @param match the digraph match from the verdict
     * @return the text
     */
    public static String digraphMessage(final DigraphMatch match) {
        return String.format(Locale.ROOT, "Your answer was incorrect because you mixed up the regular kana %c"
                        + " and the small kana %c. Tap this message for more information about the difference between small and regular kana.",
                match.getRegularKana(), match.getSmallKana());
    }
}
