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

import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.util.KanaUtil;

import javax.annotation.Nullable;

/**
 * The answer pre-checks that {@link Session#submit} runs on a typed answer before the question type's
 * answer checker: the empty check, the trailing 'n' to 'ん' fix, the kana-only check and the
 * expected-kana check for kana question types.
 *
 * <p>KanjiKodama: moved out of Session.submitHelper unchanged (same order, same verdicts) so golden
 * tests can run it on the plain JVM. Session still does the state checks (no question, already
 * answered), updates FloatingUiState with the fixed answer, trims it and calls checkAnswer.</p>
 */
public final class SubmitPrecheck {
    /** The answer is empty. */
    public static final String EMPTY = "empty";
    /** A kana question type got an answer with a character outside U+3040..U+30FF. */
    public static final String NON_KANA = "non-kana";
    /** A kana question type got an answer that does not contain the subject's own kana in order. */
    public static final String MISSING_KANA = "missing-kana";

    private final String answer;
    private final boolean trailingNFixed;
    private final @Nullable AnswerVerdict rejection;
    private final @Nullable String reason;

    private SubmitPrecheck(final String answer, final boolean trailingNFixed,
                           final @Nullable AnswerVerdict rejection, final @Nullable String reason) {
        this.answer = answer;
        this.trailingNFixed = trailingNFixed;
        this.rejection = rejection;
        this.reason = reason;
    }

    /**
     * Run the pre-checks.
     *
     * @param type the question type
     * @param subjectCharacters the subject's characters (only used for kana question types)
     * @param currentAnswer the answer as typed (not trimmed)
     * @return the result
     */
    public static SubmitPrecheck check(final QuestionType type, final @Nullable String subjectCharacters,
                                       final String currentAnswer) {
        if (currentAnswer.isEmpty()) {
            return new SubmitPrecheck(currentAnswer, false, AnswerVerdict.NOK_WITH_RETRY, EMPTY);
        }

        String answer = currentAnswer;
        boolean fixed = false;
        if (type.isKana()) {
            if (answer.endsWith("n")) {
                answer = answer.substring(0, answer.length() - 1) + "ん";
                fixed = true;
            }
            for (int i=0; i<answer.length(); i++) {
                final char c = answer.charAt(i);
                if (c < 0x3040 || c > 0x30FF) {
                    return new SubmitPrecheck(answer, fixed, AnswerVerdict.NOK_WITH_RETRY, NON_KANA);
                }
            }

            // Because the user input and subject can contain both Hiragana and Katakana in addition to Kanji, we convert Katakana to Hiragana for the next check
            // 〜 and the small Katakana ヶ have a special meaning, so it's easier to ignore/convert them
            //noinspection ConstantConditions
            final String characters = subjectCharacters.replace("〜", "").replace("ヶ", "か");
            final String normalizedSubjectCharacters = KanaUtil.convertKatakanaToHiragana(characters);
            final String normalizedAnswer = KanaUtil.convertKatakanaToHiragana(answer);

            // Check if the answer contains the subject's Kana characters in the expected order
            final String expectedKana = normalizedSubjectCharacters.replaceAll("[\\p{Script=Han}０-９]+", ".+");
            final boolean foundNecessaryKana = normalizedAnswer.matches(expectedKana);
            if (!foundNecessaryKana) {
                return new SubmitPrecheck(answer, fixed, AnswerVerdict.NOK_WITH_RETRY, MISSING_KANA);
            }
        }

        return new SubmitPrecheck(answer, fixed, null, null);
    }

    /**
     * The answer after the trailing 'n' fix. This is what Session stores back as the current answer.
     *
     * @return the value
     */
    public String getAnswer() {
        return answer;
    }

    /**
     * True if a trailing 'n' was replaced by 'ん'.
     *
     * @return the value
     */
    public boolean isTrailingNFixed() {
        return trailingNFixed;
    }

    /**
     * The verdict submit returns when a pre-check rejects the answer, or null if the answer passed.
     *
     * @return the value
     */
    public @Nullable AnswerVerdict getRejection() {
        return rejection;
    }

    /**
     * Why the answer was rejected ({@link #EMPTY}, {@link #NON_KANA}, {@link #MISSING_KANA}), or null.
     *
     * @return the value
     */
    public @Nullable String getReason() {
        return reason;
    }
}
