package app.kanjikodama.srs

import io.kotest.matchers.shouldBe
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource

class KanaConverterTest {
    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource(
        "kou, こう",
        "shi, し",
        "si, し",
        "chi, ち",
        "tsu, つ",
        "fu, ふ",
        "ji, じ",
        "kyou, きょう",
        "sha, しゃ",
        "jyo, じょ",
        "gakkou, がっこう",
        "kitte, きって",
        "matcha, まっちゃ",
        "zasshi, ざっし",
        "kanji, かんじ",
        "kan'i, かんい",
        "kani, かに",
        "konnichiwa, こんにちわ",
        "konnnichiwa, こんにちわ",
        "shinnen, しんねん",
        "onna, おんな",
        "hon, ほん",
        "nn, ん",
        "ra-men, らーめん",
        "xtsu, っ",
        "ltu, っ",
        "tyuu, ちゅう",
        "fa, ふぁ",
        "KOU, こう",
        "nya, にゃ",
    )
    fun converts(input: String, expected: String) {
        KanaConverter.toHiragana(input) shouldBe expected
    }

    @ParameterizedTest(name = "partial {0} -> {1}")
    @CsvSource("k, k", "ky, ky", "kyo, きょ", "n, n", "hon, ほn", "honn, ほん", "sh, sh", "shi, し", "kan, かn", "kanj, かんj")
    fun `live input keeps the unfinished syllable`(input: String, expected: String) {
        KanaConverter.toHiraganaLive(input) shouldBe expected
    }

    @ParameterizedTest(name = "kata {0} -> {1}")
    @CsvSource("コウ, こう", "ジ, じ", "ひ, ひ", "キョウ, きょう")
    fun `katakana to hiragana`(input: String, expected: String) {
        KanaConverter.katakanaToHiragana(input) shouldBe expected
    }
}
