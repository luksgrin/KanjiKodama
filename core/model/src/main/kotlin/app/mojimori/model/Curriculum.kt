package app.mojimori.model

/** A JLPT block, plus the open-ended Obscure block after N1. Blocks are the hard gates. */
enum class Block(val ordinalIndex: Int, val label: String, val nickname: String) {
    N5(0, "N5", "Sprout"),
    N4(1, "N4", "Sapling"),
    N3(2, "N3", "Grove"),
    N2(3, "N2", "Forest"),
    N1(4, "N1", "Canopy"),
    OBSCURE(5, "Obscure", "Deep Woods");

    val next: Block? get() = entries.getOrNull(ordinal + 1)
}

/** A WaniKani-style numbered level: ~25 kanji, their components and ~100 words. */
data class Level(val number: Int, val block: Block) {
    init {
        require(number >= 1) { "Level numbers start at 1" }
    }
}

enum class ItemType { COMPONENT, KANJI, VOCABULARY }

/** Stable natural key: component slug, kanji literal, or JMdict sequence id as text. */
data class ItemKey(val type: ItemType, val key: String)
