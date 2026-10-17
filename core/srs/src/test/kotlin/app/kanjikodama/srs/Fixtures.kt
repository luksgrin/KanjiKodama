package app.kanjikodama.srs

import app.kanjikodama.model.Assignment
import app.kanjikodama.model.Block
import app.kanjikodama.model.Curriculum
import app.kanjikodama.model.CurriculumComponent
import app.kanjikodama.model.CurriculumKanji
import app.kanjikodama.model.CurriculumVocab
import app.kanjikodama.model.DAY_MS
import app.kanjikodama.model.ItemKey
import app.kanjikodama.model.Level

/**
 * Tiny curriculum: N5 = levels 1–2, N4 = level 3.
 * Level 1: components 一 口; kanji 一 (atomic) 日 (atomic) 中 (口 丨→ absent comp, ignored) ; vocab 一日
 * Level 2: component 寺; kanji 時 (日 寺)  工 (atomic)
 * Level 3: kanji 江 (氵 工) with component 氵 at level 3
 */
object Fixtures {
    val T0 = 1_700_000_000_000L // arbitrary epoch

    val curriculum = Curriculum(
        levels = listOf(Level(1, Block.N5), Level(2, Block.N5), Level(3, Block.N4)),
        components = listOf(
            CurriculumComponent("一", 1), CurriculumComponent("口", 1),
            CurriculumComponent("寺", 2), CurriculumComponent("日", 2), CurriculumComponent("工", 3), CurriculumComponent("氵", 3),
        ),
        kanji = listOf(
            CurriculumKanji("一", 1, emptyList(), onReadings = listOf("イチ"), kunReadings = listOf("ひと.つ")),
            CurriculumKanji("日", 1, emptyList(), onReadings = listOf("ニチ", "ジツ"), kunReadings = listOf("ひ")),
            CurriculumKanji("中", 1, listOf("口"), onReadings = listOf("チュウ"), kunReadings = listOf("なか")),
            CurriculumKanji("時", 2, listOf("日", "寺"), seriesId = 1, onReadings = listOf("ジ")),
            CurriculumKanji("工", 2, emptyList(), onReadings = listOf("コウ")),
            CurriculumKanji("江", 3, listOf("氵", "工"), seriesId = 2, onReadings = listOf("コウ")),
        ),
        vocab = listOf(CurriculumVocab(100, 1, listOf("一", "日")), CurriculumVocab(200, 2, listOf("時"))),
    )

    fun passed(key: ItemKey, stage: Int = 5) = Assignment(
        key, stage = stage, unlockedAt = T0, startedAt = T0, availableAt = T0 + 7 * DAY_MS, passedAt = T0 + DAY_MS,
    )

    fun started(key: ItemKey, stage: Int = 1) = Assignment(key, stage = stage, unlockedAt = T0, startedAt = T0, availableAt = T0 + 4 * 3600_000L)

    fun allPassed(keys: List<ItemKey>): Map<ItemKey, Assignment> = keys.associateWith { passed(it) }
}
