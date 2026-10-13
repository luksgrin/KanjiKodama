package app.kanjikodama.model

/** A JLPT block, plus the open-ended Obscure block after N1. Blocks are the hard gates. */
enum class Block(val label: String, val nickname: String) {
    N5("N5", "Sprout"),
    N4("N4", "Sapling"),
    N3("N3", "Grove"),
    N2("N2", "Forest"),
    N1("N1", "Canopy"),
    OBSCURE("Obscure", "Deep Woods");

    val next: Block? get() = entries.getOrNull(ordinal + 1)
    val previous: Block? get() = entries.getOrNull(ordinal - 1)
}

/** A WaniKani-style numbered level: ~25 kanji, their components and ~100+ words. */
data class Level(val number: Int, val block: Block) {
    init {
        require(number >= 1) { "Level numbers start at 1" }
    }
}

enum class ItemType { COMPONENT, KANJI, VOCABULARY }

/** Stable natural key: component slug, kanji literal, or JMdict sequence id as text. */
data class ItemKey(val type: ItemType, val key: String) {
    companion object {
        fun component(slug: String) = ItemKey(ItemType.COMPONENT, slug)
        fun kanji(literal: String) = ItemKey(ItemType.KANJI, literal)
        fun vocab(id: Long) = ItemKey(ItemType.VOCABULARY, id.toString())
    }
}

/** The curriculum facts the engine needs: what exists, at which level, and what depends on what. */
data class CurriculumComponent(val slug: String, val level: Int)

data class CurriculumKanji(
    val literal: String,
    val level: Int,
    val components: List<String>,
    val seriesId: Int? = null,
    val onReadings: List<String> = emptyList(),
    val kunReadings: List<String> = emptyList(),
)

data class CurriculumVocab(val id: Long, val level: Int, val kanji: List<String>)

class Curriculum(
    val levels: List<Level>,
    components: List<CurriculumComponent>,
    kanji: List<CurriculumKanji>,
    vocab: List<CurriculumVocab>,
) {
    val components: Map<String, CurriculumComponent> = components.associateBy { it.slug }
    val kanji: Map<String, CurriculumKanji> = kanji.associateBy { it.literal }
    val vocab: Map<Long, CurriculumVocab> = vocab.associateBy { it.id }
    private val levelByNumber: Map<Int, Level> = levels.associateBy { it.number }

    val maxLevel: Int = levels.maxOfOrNull { it.number } ?: 0

    fun level(number: Int): Level? = levelByNumber[number]
    fun blockOf(level: Int): Block? = levelByNumber[level]?.block
    fun levelsOf(block: Block): List<Level> = levels.filter { it.block == block }
    fun kanjiAtLevel(level: Int): List<CurriculumKanji> = kanji.values.filter { it.level == level }
    fun kanjiInBlock(block: Block): List<CurriculumKanji> = kanji.values.filter { blockOf(it.level) == block }
    fun componentsAtLevel(level: Int): List<CurriculumComponent> = components.values.filter { it.level == level }
    fun vocabAtLevel(level: Int): List<CurriculumVocab> = vocab.values.filter { it.level == level }

    fun levelOf(key: ItemKey): Int? = when (key.type) {
        ItemType.COMPONENT -> components[key.key]?.level
        ItemType.KANJI -> kanji[key.key]?.level
        ItemType.VOCABULARY -> key.key.toLongOrNull()?.let { vocab[it]?.level }
    }

    fun blockOf(key: ItemKey): Block? = levelOf(key)?.let { blockOf(it) }
}
