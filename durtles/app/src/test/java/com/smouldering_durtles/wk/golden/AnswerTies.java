package com.smouldering_durtles.wk.golden;

import com.smouldering_durtles.wk.api.model.AuxiliaryMeaning;
import com.smouldering_durtles.wk.api.model.Meaning;
import com.smouldering_durtles.wk.db.model.Subject;
import com.smouldering_durtles.wk.enums.CloseEnoughAction;
import com.smouldering_durtles.wk.enums.QuestionType;
import com.smouldering_durtles.wk.model.AnswerVerdict;
import com.smouldering_durtles.wk.util.FuzzyMatching;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.annotation.Nullable;

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;

/**
 * Tie analysis for the meaning question types (golden-a, companion of {@link AnswerCheckGolden}).
 *
 * <p>The meaning question types collect the accepted answers in a {@code HashSet} and
 * {@link FuzzyMatching#matches} keeps the first candidate with the lowest score (strict {@code <}).
 * When several accepted answers reach that score, {@code matchedAnswer} is whichever of them the
 * HashSet yields first, i.e. it follows Java's {@code String.hashCode} bucket order. This class
 * recomputes the scores with FuzzyMatching's own (private, read by reflection) {@code cleanString} and
 * {@code getMatchScore}, and lists every tied candidate in subject order (accepted meanings, whitelisted
 * auxiliary meanings, user synonyms; exact duplicates removed, as the HashSet does).</p>
 */
final class AnswerTies {
    private static final Method CLEAN;
    private static final Method SCORE;

    static {
        try {
            CLEAN = FuzzyMatching.class.getDeclaredMethod("cleanString", String.class);
            CLEAN.setAccessible(true);
            SCORE = FuzzyMatching.class.getDeclaredMethod("getMatchScore", CharSequence.class, CharSequence.class);
            SCORE.setAccessible(true);
        } catch (final ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private AnswerTies() {
        //
    }

    private static String clean(final String s) {
        try {
            return (String) CLEAN.invoke(null, s);
        } catch (final ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private static int score(final String cleanAnswer, final String reference) {
        try {
            return (Integer) SCORE.invoke(null, cleanAnswer, clean(reference));
        } catch (final ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * The tie record for one meaning check, or null when there is no tie: the answer is not accepted by
     * the fuzzy match, or exactly one accepted answer has the best score.
     *
     * <p>{@code {score, ties, subjectOrderFirst, javaPick}}: {@code score} is the best OSA distance
     * (0 = exact after cleanup; above 0 only the lenient close-enough actions accept, as a near match),
     * {@code ties} the tied candidates in subject order, {@code javaPick} what Java's matchedAnswer is
     * for every close-enough action that accepts.</p>
     */
    static @Nullable Map<String, Object> ties(final QuestionType q, final Subject s, final String answer) {
        if (!q.isMeaning()) {
            return null;
        }
        // Same collection as QuestionType's meaning checkAnswer, but insertion-ordered.
        final Set<String> accepted = new LinkedHashSet<>();
        final List<String> rejected = new ArrayList<>();
        for (final Meaning m: s.getMeanings()) {
            if (m.isAcceptedAnswer()) {
                accepted.add(m.getMeaning());
            }
            else {
                rejected.add(m.getMeaning());
            }
        }
        for (final AuxiliaryMeaning m: s.getAuxiliaryMeanings()) {
            if (m.isWhiteList()) {
                accepted.add(m.getMeaning());
            }
            else if (m.isBlackList()) {
                rejected.add(m.getMeaning());
            }
        }
        accepted.addAll(s.getMeaningSynonyms());

        final String cleanAnswer = clean(answer);
        int bestRejected = Integer.MAX_VALUE;
        for (final String r: rejected) {
            bestRejected = Math.min(bestRejected, score(cleanAnswer, r));
        }
        int best = Integer.MAX_VALUE;
        final List<String> tied = new ArrayList<>();
        for (final String a: accepted) {
            final int sc = score(cleanAnswer, a);
            if (sc < best) {
                best = sc;
                tied.clear();
            }
            if (sc == best && sc < Integer.MAX_VALUE) {
                tied.add(a);
            }
        }
        if (best == Integer.MAX_VALUE || best > bestRejected || tied.size() < 2) {
            return null;
        }
        final AnswerVerdict v = q.checkAnswer(s, null, answer, CloseEnoughAction.SILENTLY_ACCEPT, false);
        final String pick = v.getMatchedAnswer();
        if (!v.isOk() || pick == null || !tied.contains(pick)) {
            throw new IllegalStateException("tie analysis disagrees with checkAnswer for '" + answer + "': " + v + " vs " + tied);
        }
        return obj("score", best, "ties", tied, "subjectOrderFirst", tied.get(0), "javaPick", pick);
    }
}
