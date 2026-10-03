package app.mojimori.srs

import app.mojimori.srs.AnswerChecker.Verdict
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class AnswerCheckerTest {
    @Test
    fun `meaning accepts exact synonyms and small typos`() {
        AnswerChecker.checkMeaning("Creek", listOf("creek", "inlet", "bay")) shouldBe Verdict.CORRECT
        AnswerChecker.checkMeaning("creak", listOf("creek")) shouldBe Verdict.CORRECT // 1 typo on 5 letters
        AnswerChecker.checkMeaning("bey", listOf("bay")) shouldBe Verdict.INCORRECT // no typos on 3 letters
        AnswerChecker.checkMeaning("to meet", listOf("to meet, to see".split(", ")[0])) shouldBe Verdict.CORRECT
        AnswerChecker.checkMeaning("river mouth", listOf("creek"), synonyms = listOf("River Mouth")) shouldBe Verdict.CORRECT
        AnswerChecker.checkMeaning("", listOf("creek")) shouldBe Verdict.INCORRECT
    }

    @Test
    fun `meaning blocklist stops near misses`() {
        AnswerChecker.checkMeaning("days", listOf("day"), blocklist = listOf("days")) shouldBe Verdict.INCORRECT
        AnswerChecker.checkMeaning("day", listOf("day"), blocklist = listOf("days")) shouldBe Verdict.CORRECT
    }

    @Test
    fun `meaning normalisation ignores case punctuation and parentheticals`() {
        AnswerChecker.normalizeMeaning("  Two Persons (people) ") shouldBe "two persons"
        AnswerChecker.checkMeaning("two persons", listOf("two persons (people)")) shouldBe Verdict.CORRECT
    }

    @Test
    fun `reading accepts romaji or kana and distinguishes reading type`() {
        AnswerChecker.checkReading("kou", listOf("コウ"), other = listOf("え")) shouldBe Verdict.CORRECT
        AnswerChecker.checkReading("こう", listOf("コウ")) shouldBe Verdict.CORRECT
        AnswerChecker.checkReading("e", listOf("コウ"), other = listOf("え")) shouldBe Verdict.WRONG_READING_TYPE
        AnswerChecker.checkReading("ko", listOf("コウ")) shouldBe Verdict.INCORRECT
        AnswerChecker.checkReading("hitotsu", listOf("ひと.つ")) shouldBe Verdict.CORRECT // KANJIDIC dot separator
        AnswerChecker.checkReading("gakkou", listOf("がっこう")) shouldBe Verdict.CORRECT
    }

    @Test
    fun `damerau distance counts transpositions as one`() {
        AnswerChecker.distance("creek", "creke") shouldBe 1
        AnswerChecker.distance("abc", "abc") shouldBe 0
        AnswerChecker.distance("kitten", "sitting") shouldBe 3
    }
}
