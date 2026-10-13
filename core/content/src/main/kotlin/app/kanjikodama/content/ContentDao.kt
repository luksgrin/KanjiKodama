package app.kanjikodama.content

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import app.kanjikodama.model.Block
import app.kanjikodama.model.Curriculum
import app.kanjikodama.model.CurriculumComponent
import app.kanjikodama.model.CurriculumKanji
import app.kanjikodama.model.CurriculumVocab
import app.kanjikodama.model.Level
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray

/** Hand-written queries over content.db (schema: docs/spec.md §9). */
class ContentDao(private val store: ContentStore) {

    private suspend fun <T> read(block: (SQLiteDatabase) -> T): T = withContext(Dispatchers.IO) { block(store.open()) }

    private fun Cursor.str(col: String): String = getString(getColumnIndexOrThrow(col))
    private fun Cursor.strOrNull(col: String): String? = getColumnIndexOrThrow(col).let { if (isNull(it)) null else getString(it) }
    private fun Cursor.int(col: String): Int = getInt(getColumnIndexOrThrow(col))
    private fun Cursor.intOrNull(col: String): Int? = getColumnIndexOrThrow(col).let { if (isNull(it)) null else getInt(it) }
    private fun Cursor.long(col: String): Long = getLong(getColumnIndexOrThrow(col))
    private fun Cursor.bool(col: String): Boolean = getInt(getColumnIndexOrThrow(col)) != 0
    private fun Cursor.jsonList(col: String): List<String> {
        val raw = strOrNull(col) ?: return emptyList()
        val arr = JSONArray(raw)
        return List(arr.length()) { arr.getString(it) }
    }

    private inline fun <T> SQLiteDatabase.rows(sql: String, args: Array<String> = emptyArray(), map: (Cursor) -> T): List<T> =
        rawQuery(sql, args).use { c ->
            val out = ArrayList<T>(c.count)
            while (c.moveToNext()) out += map(c)
            out
        }

    private fun block(id: String): Block = Block.valueOf(id)

    // ------------------------------------------------------------------ meta / structure

    suspend fun meta(): Map<String, String> = read { db -> db.rows("SELECT key, value FROM meta") { it.str("key") to it.str("value") }.toMap() }

    suspend fun levels(): List<LevelInfo> = read { db ->
        db.rows("SELECT id, block_id, ordinal, obscure_tier FROM level ORDER BY id") {
            LevelInfo(it.int("id"), block(it.str("block_id")), it.int("ordinal"), it.intOrNull("obscure_tier"))
        }
    }

    /** Everything the SRS engine needs, in one pass. */
    suspend fun loadCurriculum(): Curriculum = read { db ->
        val levels = db.rows("SELECT id, block_id FROM level ORDER BY id") { Level(it.int("id"), block(it.str("block_id"))) }
        val components = db.rows("SELECT slug, level_id FROM component WHERE level_id IS NOT NULL") {
            CurriculumComponent(it.str("slug"), it.int("level_id"))
        }
        val comps = db.rows("SELECT literal, component_slug FROM kanji_component ORDER BY literal, ordinal") { it.str("literal") to it.str("component_slug") }
            .groupBy({ it.first }, { it.second })
        val series = db.rows("SELECT literal, series_id FROM series_member") { it.str("literal") to it.int("series_id") }.toMap()
        val readings = db.rows("SELECT literal, kana, type FROM kanji_reading WHERE type IN ('on','kun')") { Triple(it.str("literal"), it.str("kana"), it.str("type")) }
            .groupBy { it.first }
        val kanji = db.rows("SELECT literal, level_id FROM kanji") { c ->
            val lit = c.str("literal")
            val r = readings[lit].orEmpty()
            CurriculumKanji(
                lit, c.int("level_id"), comps[lit].orEmpty(), series[lit],
                onReadings = r.filter { it.third == "on" }.map { it.second },
                kunReadings = r.filter { it.third == "kun" }.map { it.second },
            )
        }
        val vk = db.rows("SELECT vocab_id, literal FROM vocab_kanji") { it.long("vocab_id") to it.str("literal") }.groupBy({ it.first }, { it.second })
        val vocab = db.rows("SELECT id, level_id FROM vocab") { CurriculumVocab(it.long("id"), it.int("level_id"), vk[it.long("id")].orEmpty()) }
        Curriculum(levels, components, kanji, vocab)
    }

    // ------------------------------------------------------------------ lists

    suspend fun kanjiAtLevel(level: Int): List<KanjiSummary> = read { db ->
        db.rows(
            """SELECT k.literal, k.level_id,
                 (SELECT text FROM kanji_meaning m WHERE m.literal = k.literal ORDER BY is_primary DESC, rowid LIMIT 1) AS meaning,
                 (SELECT kana FROM kanji_reading r WHERE r.literal = k.literal AND r.type = k.asked_reading_type ORDER BY is_primary DESC, rowid LIMIT 1) AS reading
               FROM kanji k WHERE k.level_id = ? ORDER BY k.rowid""",
            arrayOf(level.toString()),
        ) { KanjiSummary(it.str("literal"), it.int("level_id"), it.strOrNull("meaning") ?: "", it.strOrNull("reading")) }
    }

    suspend fun kanjiSummaries(literals: Collection<String>): Map<String, KanjiSummary> = read { db ->
        if (literals.isEmpty()) return@read emptyMap()
        val placeholders = literals.joinToString(",") { "?" }
        db.rows(
            """SELECT k.literal, k.level_id,
                 (SELECT text FROM kanji_meaning m WHERE m.literal = k.literal ORDER BY is_primary DESC, rowid LIMIT 1) AS meaning,
                 (SELECT kana FROM kanji_reading r WHERE r.literal = k.literal AND r.type = k.asked_reading_type ORDER BY is_primary DESC, rowid LIMIT 1) AS reading
               FROM kanji k WHERE k.literal IN ($placeholders)""",
            literals.toTypedArray(),
        ) { KanjiSummary(it.str("literal"), it.int("level_id"), it.strOrNull("meaning") ?: "", it.strOrNull("reading")) }.associateBy { it.literal }
    }

    suspend fun componentsAtLevel(level: Int): List<ComponentSummary> = read { db ->
        db.rows("SELECT slug, glyph, svg, name, level_id FROM component WHERE level_id = ? ORDER BY rowid", arrayOf(level.toString())) {
            ComponentSummary(it.str("slug"), it.str("glyph"), it.jsonList("svg"), it.str("name"), it.intOrNull("level_id"))
        }
    }

    suspend fun componentSummaries(slugs: Collection<String>): Map<String, ComponentSummary> = read { db ->
        if (slugs.isEmpty()) return@read emptyMap()
        val placeholders = slugs.joinToString(",") { "?" }
        db.rows("SELECT slug, glyph, svg, name, level_id FROM component WHERE slug IN ($placeholders)", slugs.toTypedArray()) {
            ComponentSummary(it.str("slug"), it.str("glyph"), it.jsonList("svg"), it.str("name"), it.intOrNull("level_id"))
        }.associateBy { it.slug }
    }

    suspend fun vocabAtLevel(level: Int): List<VocabSummary> = read { db -> vocabSummariesWhere(db, "v.level_id = ?", arrayOf(level.toString())) }

    suspend fun vocabSummaries(ids: Collection<Long>): Map<Long, VocabSummary> = read { db ->
        if (ids.isEmpty()) return@read emptyMap()
        vocabSummariesWhere(db, "v.id IN (${ids.joinToString(",") { "?" }})", ids.map { it.toString() }.toTypedArray()).associateBy { it.id }
    }

    suspend fun vocabUsingKanji(literal: String): List<VocabSummary> = read { db ->
        vocabSummariesWhere(db, "v.id IN (SELECT vocab_id FROM vocab_kanji WHERE literal = ?)", arrayOf(literal))
    }

    private fun vocabSummariesWhere(db: SQLiteDatabase, where: String, args: Array<String>): List<VocabSummary> = db.rows(
        """SELECT v.id, v.word, v.level_id,
             (SELECT text FROM vocab_meaning m WHERE m.vocab_id = v.id ORDER BY is_primary DESC, rowid LIMIT 1) AS meaning,
             (SELECT kana FROM vocab_reading r WHERE r.vocab_id = v.id ORDER BY is_primary DESC, rowid LIMIT 1) AS reading
           FROM vocab v WHERE $where ORDER BY v.level_id, v.priority, v.rowid""",
        args,
    ) { VocabSummary(it.long("id"), it.str("word"), it.int("level_id"), it.strOrNull("meaning") ?: "", it.strOrNull("reading") ?: "") }

    suspend fun kanjiUsingComponent(slug: String): List<KanjiSummary> = read { db ->
        db.rows(
            """SELECT k.literal, k.level_id,
                 (SELECT text FROM kanji_meaning m WHERE m.literal = k.literal ORDER BY is_primary DESC, rowid LIMIT 1) AS meaning,
                 (SELECT kana FROM kanji_reading r WHERE r.literal = k.literal AND r.type = k.asked_reading_type ORDER BY is_primary DESC, rowid LIMIT 1) AS reading
               FROM kanji k WHERE k.literal IN (SELECT literal FROM kanji_component WHERE component_slug = ?) ORDER BY k.level_id, k.rowid""",
            arrayOf(slug),
        ) { KanjiSummary(it.str("literal"), it.int("level_id"), it.strOrNull("meaning") ?: "", it.strOrNull("reading")) }
    }

    // ------------------------------------------------------------------ details

    suspend fun kanji(literal: String): KanjiInfo? = read { db ->
        val base = db.rows(
            "SELECT literal, block_id, level_id, grade, freq, strokes, svg, category, asked_reading_type, old_form_of, meaning_mnemonic, reading_mnemonic FROM kanji WHERE literal = ?",
            arrayOf(literal),
        ) { c ->
            KanjiInfo(
                literal = c.str("literal"), block = block(c.str("block_id")), level = c.int("level_id"), grade = c.intOrNull("grade"),
                freq = c.intOrNull("freq"), strokeCount = c.intOrNull("strokes"), strokes = c.jsonList("svg"), category = c.str("category"),
                askedReadingType = c.str("asked_reading_type"), oldFormOf = c.strOrNull("old_form_of"),
                meaningMnemonic = c.str("meaning_mnemonic"), readingMnemonic = c.str("reading_mnemonic"),
                readings = emptyList(), meanings = emptyList(), components = emptyList(), seriesId = null, seriesMatch = null,
            )
        }.firstOrNull() ?: return@read null
        val readings = db.rows("SELECT kana, type, is_primary FROM kanji_reading WHERE literal = ? ORDER BY rowid", arrayOf(literal)) {
            Reading(it.str("kana"), it.str("type"), it.bool("is_primary"))
        }
        val meanings = db.rows("SELECT text, is_primary FROM kanji_meaning WHERE literal = ? ORDER BY rowid", arrayOf(literal)) {
            Meaning(it.str("text"), it.bool("is_primary"))
        }
        val components = db.rows("SELECT component_slug, role, position FROM kanji_component WHERE literal = ? ORDER BY ordinal", arrayOf(literal)) {
            ComponentUse(it.str("component_slug"), it.str("role"), it.strOrNull("position"))
        }
        val series = db.rows("SELECT series_id, match FROM series_member WHERE literal = ? LIMIT 1", arrayOf(literal)) { it.int("series_id") to it.str("match") }.firstOrNull()
        base.copy(readings = readings, meanings = meanings, components = components, seriesId = series?.first, seriesMatch = series?.second)
    }

    suspend fun component(slug: String): ComponentInfo? = read { db ->
        db.rows(
            "SELECT slug, glyph, svg, name, meaning, role_tendency, on_readings, is_kanji, variant_of, level_id FROM component WHERE slug = ?",
            arrayOf(slug),
        ) { c ->
            ComponentInfo(
                c.str("slug"), c.str("glyph"), c.jsonList("svg"), c.str("name"), c.str("meaning"), c.str("role_tendency"),
                c.jsonList("on_readings"), c.bool("is_kanji"), c.strOrNull("variant_of"), c.intOrNull("level_id"),
            )
        }.firstOrNull()
    }

    suspend fun vocab(id: Long): VocabInfo? = read { db ->
        val args = arrayOf(id.toString())
        val base = db.rows("SELECT id, word, level_id, pos, priority, is_kana_only, selection_source FROM vocab WHERE id = ?", args) { c ->
            VocabInfo(
                c.long("id"), c.str("word"), c.int("level_id"), c.str("pos"), c.int("priority"), c.bool("is_kana_only"), c.str("selection_source"),
                emptyList(), emptyList(), emptyList(), emptyList(),
            )
        }.firstOrNull() ?: return@read null
        base.copy(
            readings = db.rows("SELECT kana FROM vocab_reading WHERE vocab_id = ? ORDER BY is_primary DESC, rowid", args) { it.str("kana") },
            meanings = db.rows("SELECT text FROM vocab_meaning WHERE vocab_id = ? ORDER BY is_primary DESC, rowid", args) { it.str("text") },
            kanji = db.rows("SELECT literal FROM vocab_kanji WHERE vocab_id = ? ORDER BY rowid", args) { it.str("literal") },
            sentences = db.rows("SELECT ja, en FROM sentence WHERE vocab_id = ? ORDER BY id", args) { Sentence(it.str("ja"), it.str("en")) },
        )
    }

    suspend fun series(id: Int): SeriesInfo? = read { db ->
        val base = db.rows("SELECT id, component_slug, reading, reliability, total_members FROM phonetic_series WHERE id = ?", arrayOf(id.toString())) { c ->
            SeriesInfo(c.int("id"), c.str("component_slug"), c.str("reading"), c.getDouble(c.getColumnIndexOrThrow("reliability")), c.int("total_members"), emptyList())
        }.firstOrNull() ?: return@read null
        base.copy(
            members = db.rows(
                "SELECT m.literal, m.actual_reading, m.match FROM series_member m JOIN kanji k ON k.literal = m.literal WHERE m.series_id = ? ORDER BY k.level_id, k.rowid",
                arrayOf(id.toString()),
            ) { SeriesMember(it.str("literal"), it.str("actual_reading"), it.str("match")) },
        )
    }

    suspend fun allSeries(): List<SeriesInfo> = read { db ->
        db.rows("SELECT id, component_slug, reading, reliability, total_members FROM phonetic_series ORDER BY total_members DESC, component_slug") { c ->
            SeriesInfo(c.int("id"), c.str("component_slug"), c.str("reading"), c.getDouble(c.getColumnIndexOrThrow("reliability")), c.int("total_members"), emptyList())
        }
    }

    suspend fun sources(): List<Triple<String, String, String>> = read { db ->
        db.rows("SELECT name, url, licence FROM source ORDER BY rowid") { Triple(it.str("name"), it.str("url"), it.str("licence")) }
    }
}
