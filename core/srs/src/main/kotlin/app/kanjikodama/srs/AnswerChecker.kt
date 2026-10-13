package app.kanjikodama.srs

import kotlin.math.min

/** Meaning and reading answer evaluation (spec §4.9). */
object AnswerChecker {

    enum class Verdict { CORRECT, INCORRECT, WRONG_READING_TYPE }

    /** Damerau-Levenshtein (optimal string alignment) distance. */
    fun distance(a: String, b: String): Int {
        val d = Array(a.length + 1) { IntArray(b.length + 1) }
        for (i in 0..a.length) d[i][0] = i
        for (j in 0..b.length) d[0][j] = j
        for (i in 1..a.length) for (j in 1..b.length) {
            val cost = if (a[i - 1] == b[j - 1]) 0 else 1
            d[i][j] = min(min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost)
            if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
        }
        return d[a.length][b.length]
    }

    /** Typos allowed for an accepted answer of this length (WaniKani-like). */
    fun tolerance(length: Int): Int = when {
        length <= 3 -> 0
        length <= 5 -> 1
        length <= 7 -> 2
        else -> 3
    }

    fun normalizeMeaning(s: String): String =
        s.lowercase().trim()
            .replace(Regex("\\(.*?\\)"), "")
            .replace(Regex("[^\\p{L}\\p{N} ]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

    /**
     * Accept if the normalised answer equals, or is within typo tolerance of, any accepted
     * meaning or user synonym, unless it exactly matches a blocklisted near-miss.
     */
    fun checkMeaning(answer: String, accepted: Collection<String>, synonyms: Collection<String> = emptyList(), blocklist: Collection<String> = emptyList()): Verdict {
        val a = normalizeMeaning(answer)
        if (a.isEmpty()) return Verdict.INCORRECT
        if (blocklist.any { normalizeMeaning(it) == a }) return Verdict.INCORRECT
        for (m in accepted + synonyms) {
            val n = normalizeMeaning(m)
            if (n.isEmpty()) continue
            if (n == a) return Verdict.CORRECT
            if (distance(a, n) <= tolerance(n.length)) return Verdict.CORRECT
        }
        return Verdict.INCORRECT
    }

    fun normalizeReading(s: String): String =
        KanaConverter.katakanaToHiragana(s.trim()).replace(" ", "").replace(".", "").trim('-')

    /**
     * Readings must match exactly (after kana normalisation). For kanji, when [asked] readings are
     * missed but [other] readings (the other reading type) match, the answer is a WRONG_READING_TYPE
     * so the UI can shake and re-ask instead of marking it wrong.
     */
    fun checkReading(answer: String, asked: Collection<String>, other: Collection<String> = emptyList()): Verdict {
        val a = normalizeReading(if (KanaConverter.isKana(answer)) answer else KanaConverter.toHiragana(answer))
        if (a.isEmpty()) return Verdict.INCORRECT
        if (asked.any { normalizeReading(it) == a }) return Verdict.CORRECT
        if (other.any { normalizeReading(it) == a }) return Verdict.WRONG_READING_TYPE
        return Verdict.INCORRECT
    }
}
