package app.kanjikodama.content

import app.kanjikodama.model.Block

data class LevelInfo(val number: Int, val block: Block, val ordinal: Int, val obscureTier: Int?)

data class ComponentInfo(
    val slug: String,
    val glyph: String,
    val strokes: List<String>,
    val name: String,
    val meaning: String,
    val roleTendency: String,
    val onReadings: List<String>,
    val isKanji: Boolean,
    val variantOf: String?,
    val level: Int?,
)

data class Reading(val kana: String, val type: String, val isPrimary: Boolean)

data class Meaning(val text: String, val isPrimary: Boolean)

data class ComponentUse(val slug: String, val role: String, val position: String?)

data class KanjiInfo(
    val literal: String,
    val block: Block,
    val level: Int,
    val grade: Int?,
    val freq: Int?,
    val strokeCount: Int?,
    val strokes: List<String>,
    val category: String,
    val askedReadingType: String,
    val oldFormOf: String?,
    val meaningMnemonic: String,
    val readingMnemonic: String,
    val readings: List<Reading>,
    val meanings: List<Meaning>,
    val components: List<ComponentUse>,
    val seriesId: Int?,
    val seriesMatch: String?,
) {
    val onReadings: List<String> get() = readings.filter { it.type == "on" }.map { it.kana }
    val kunReadings: List<String> get() = readings.filter { it.type == "kun" }.map { it.kana }
    val primaryMeaning: String get() = meanings.firstOrNull { it.isPrimary }?.text ?: meanings.firstOrNull()?.text ?: ""
    val askedReadings: List<String> get() = if (askedReadingType == "on") onReadings else kunReadings
    val otherReadings: List<String> get() = if (askedReadingType == "on") kunReadings else onReadings
    val phonetic: String? get() = components.firstOrNull { it.role == "phonetic" || it.role == "both" }?.slug
}

data class Sentence(val ja: String, val en: String)

data class VocabInfo(
    val id: Long,
    val word: String,
    val level: Int,
    val pos: String,
    val priority: Int,
    val isKanaOnly: Boolean,
    val source: String,
    val readings: List<String>,
    val meanings: List<String>,
    val kanji: List<String>,
    val sentences: List<Sentence>,
) {
    val primaryMeaning: String get() = meanings.firstOrNull() ?: ""
}

data class SeriesMember(val literal: String, val actualReading: String, val match: String)

data class SeriesInfo(
    val id: Int,
    val component: String,
    val reading: String,
    val reliability: Double,
    val totalMembers: Int,
    val members: List<SeriesMember>,
)

/** Light rows for lists and grids. */
data class KanjiSummary(val literal: String, val level: Int, val primaryMeaning: String, val primaryReading: String?)

data class VocabSummary(val id: Long, val word: String, val level: Int, val primaryMeaning: String, val primaryReading: String)

data class ComponentSummary(val slug: String, val glyph: String, val strokes: List<String>, val name: String, val level: Int?)
