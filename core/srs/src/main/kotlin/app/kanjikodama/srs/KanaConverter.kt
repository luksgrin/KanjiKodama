package app.kanjikodama.srs

/**
 * Incremental romaji → hiragana conversion in the wanakana style.
 *
 * Converts as much of the input as is unambiguous and leaves a trailing partial syllable as
 * latin, so it can be applied on every keystroke. Supports Hepburn and kunrei spellings,
 * doubled consonants (っ), n/nn/n' handling, small-kana prefixes (x, l), and "-" for ー.
 */
object KanaConverter {
    private val table: Map<String, String> = buildMap {
        val rows = listOf(
            "a" to "あ", "i" to "い", "u" to "う", "e" to "え", "o" to "お",
            "ka" to "か", "ki" to "き", "ku" to "く", "ke" to "け", "ko" to "こ",
            "ga" to "が", "gi" to "ぎ", "gu" to "ぐ", "ge" to "げ", "go" to "ご",
            "sa" to "さ", "shi" to "し", "si" to "し", "su" to "す", "se" to "せ", "so" to "そ",
            "za" to "ざ", "ji" to "じ", "zi" to "じ", "zu" to "ず", "ze" to "ぜ", "zo" to "ぞ",
            "ta" to "た", "chi" to "ち", "ti" to "ち", "tsu" to "つ", "tu" to "つ", "te" to "て", "to" to "と",
            "da" to "だ", "di" to "ぢ", "dzu" to "づ", "du" to "づ", "de" to "で", "do" to "ど",
            "na" to "な", "ni" to "に", "nu" to "ぬ", "ne" to "ね", "no" to "の",
            "ha" to "は", "hi" to "ひ", "fu" to "ふ", "hu" to "ふ", "he" to "へ", "ho" to "ほ",
            "ba" to "ば", "bi" to "び", "bu" to "ぶ", "be" to "べ", "bo" to "ぼ",
            "pa" to "ぱ", "pi" to "ぴ", "pu" to "ぷ", "pe" to "ぺ", "po" to "ぽ",
            "ma" to "ま", "mi" to "み", "mu" to "む", "me" to "め", "mo" to "も",
            "ya" to "や", "yu" to "ゆ", "yo" to "よ",
            "ra" to "ら", "ri" to "り", "ru" to "る", "re" to "れ", "ro" to "ろ",
            "wa" to "わ", "wo" to "を", "we" to "ゑ", "wi" to "ゐ",
            "nn" to "ん", "n'" to "ん", "-" to "ー",
            "kya" to "きゃ", "kyu" to "きゅ", "kyo" to "きょ",
            "gya" to "ぎゃ", "gyu" to "ぎゅ", "gyo" to "ぎょ",
            "sha" to "しゃ", "shu" to "しゅ", "sho" to "しょ", "sya" to "しゃ", "syu" to "しゅ", "syo" to "しょ",
            "ja" to "じゃ", "ju" to "じゅ", "jo" to "じょ", "jya" to "じゃ", "jyu" to "じゅ", "jyo" to "じょ",
            "zya" to "じゃ", "zyu" to "じゅ", "zyo" to "じょ",
            "cha" to "ちゃ", "chu" to "ちゅ", "cho" to "ちょ", "tya" to "ちゃ", "tyu" to "ちゅ", "tyo" to "ちょ",
            "dya" to "ぢゃ", "dyu" to "ぢゅ", "dyo" to "ぢょ",
            "nya" to "にゃ", "nyu" to "にゅ", "nyo" to "にょ",
            "hya" to "ひゃ", "hyu" to "ひゅ", "hyo" to "ひょ",
            "bya" to "びゃ", "byu" to "びゅ", "byo" to "びょ",
            "pya" to "ぴゃ", "pyu" to "ぴゅ", "pyo" to "ぴょ",
            "mya" to "みゃ", "myu" to "みゅ", "myo" to "みょ",
            "rya" to "りゃ", "ryu" to "りゅ", "ryo" to "りょ",
            "fa" to "ふぁ", "fi" to "ふぃ", "fe" to "ふぇ", "fo" to "ふぉ",
            "va" to "ゔぁ", "vi" to "ゔぃ", "vu" to "ゔ", "ve" to "ゔぇ", "vo" to "ゔぉ",
            "she" to "しぇ", "je" to "じぇ", "che" to "ちぇ",
            "tsa" to "つぁ", "tsi" to "つぃ", "tse" to "つぇ", "tso" to "つぉ",
            "thi" to "てぃ", "dhi" to "でぃ", "twu" to "とぅ", "dwu" to "どぅ",
            "wha" to "うぁ", "whi" to "うぃ", "whe" to "うぇ", "who" to "うぉ",
            "xa" to "ぁ", "xi" to "ぃ", "xu" to "ぅ", "xe" to "ぇ", "xo" to "ぉ",
            "xya" to "ゃ", "xyu" to "ゅ", "xyo" to "ょ", "xtu" to "っ", "xtsu" to "っ", "xwa" to "ゎ", "xka" to "ヵ", "xke" to "ヶ",
            "la" to "ぁ", "li" to "ぃ", "lu" to "ぅ", "le" to "ぇ", "lo" to "ぉ",
            "lya" to "ゃ", "lyu" to "ゅ", "lyo" to "ょ", "ltu" to "っ", "ltsu" to "っ",
        )
        rows.forEach { (k, v) -> put(k, v) }
    }
    private val maxKey = table.keys.maxOf { it.length }
    private val vowels = setOf('a', 'i', 'u', 'e', 'o')
    private val consonants = ('a'..'z').filter { it !in vowels && it != 'n' }.toSet()

    /** Convert a submitted answer: a trailing lone "n" becomes ん. */
    fun toHiragana(input: String): String = convert(input, live = false)

    /** Convert while typing: a trailing lone "n" stays latin until the next key resolves it. */
    fun toHiraganaLive(input: String): String = convert(input, live = true)

    private fun convert(input: String, live: Boolean): String {
        val s = input.lowercase()
        val out = StringBuilder()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            // doubled consonant (kk, ss, tt, pp, ...) → っ; also "tch" → っ + ch
            if (c in consonants && i + 1 < s.length && (s[i + 1] == c || (c == 't' && s.startsWith("ch", i + 1)))) {
                out.append('っ'); i++; continue
            }
            // n: "n'" → ん; "nn" → ん (the second n starts the next syllable when a vowel or y
            // follows, as in konnichiwa); n before a consonant → ん; lone trailing n → ん on submit
            if (c == 'n') {
                if (i + 1 < s.length) {
                    val next = s[i + 1]
                    if (next == '\'') { out.append('ん'); i += 2; continue }
                    if (next == 'n') {
                        val after = s.getOrNull(i + 2)
                        out.append('ん')
                        i += if (after != null && (after in vowels || after == 'y')) 1 else 2
                        continue
                    }
                    if (next !in vowels && next != 'y') { out.append('ん'); i++; continue }
                } else if (!live) {
                    out.append('ん'); i++; continue
                }
            }
            var matched = false
            for (len in minOf(maxKey, s.length - i) downTo 1) {
                val chunk = s.substring(i, i + len)
                val kana = table[chunk]
                if (kana != null) {
                    out.append(kana); i += len; matched = true; break
                }
            }
            if (!matched) {
                out.append(c); i++
            }
        }
        return out.toString()
    }

    /** True when the string is entirely hiragana/katakana (plus ー and spaces). */
    fun isKana(s: String): Boolean = s.isNotEmpty() && s.all { it in '぀'..'ヿ' || it == 'ー' || it == ' ' }

    /** Katakana → hiragana (for comparing on'yomi stored in katakana with typed hiragana). */
    fun katakanaToHiragana(s: String): String = buildString {
        for (ch in s) append(if (ch in 'ァ'..'ヶ') (ch.code - 0x60).toChar() else ch)
    }
}
