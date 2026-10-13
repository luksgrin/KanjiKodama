package app.kanjikodama.srs

import app.kanjikodama.model.Assignment
import app.kanjikodama.model.Curriculum
import app.kanjikodama.model.EpochMillis
import app.kanjikodama.model.ItemType
import kotlin.random.Random

/** Lesson order: components, then kanji, then vocabulary; lower levels first; stable within a level. */
object LessonQueue {
    private val typeOrder = mapOf(ItemType.COMPONENT to 0, ItemType.KANJI to 1, ItemType.VOCABULARY to 2)

    fun order(curriculum: Curriculum, assignments: Collection<Assignment>): List<Assignment> =
        assignments
            .filter { !it.isStarted }
            .sortedWith(
                compareBy<Assignment>({ curriculum.levelOf(it.key) ?: Int.MAX_VALUE }, { typeOrder[it.key.type] }, { it.unlockedAt }, { it.key.key }),
            )

    /** Next batch, honouring the daily cap (lessons already done today count against it). */
    fun nextBatch(
        curriculum: Curriculum,
        assignments: Collection<Assignment>,
        batchSize: Int,
        dailyCap: Int?,
        doneToday: Int,
    ): List<Assignment> {
        val remaining = dailyCap?.let { (it - doneToday).coerceAtLeast(0) } ?: Int.MAX_VALUE
        return order(curriculum, assignments).take(minOf(batchSize, remaining))
    }
}

/** Due reviews, shuffled so item types interleave; the caller pairs meaning and reading prompts. */
object ReviewQueue {
    fun due(assignments: Collection<Assignment>, now: EpochMillis): List<Assignment> =
        assignments.filter { it.isDue(now) }

    fun session(assignments: Collection<Assignment>, now: EpochMillis, random: Random): List<Assignment> =
        due(assignments, now).shuffled(random)

    /** Count of reviews becoming available in each of the next [hours] hour buckets from [now]. */
    fun forecast(assignments: Collection<Assignment>, now: EpochMillis, hours: Int): List<Int> {
        val buckets = IntArray(hours)
        val start = (now / app.kanjikodama.model.HOUR_MS) * app.kanjikodama.model.HOUR_MS
        for (a in assignments) {
            val t = a.availableAt ?: continue
            if (!a.isStarted || a.isBurned || t <= now) continue
            val idx = ((t - start) / app.kanjikodama.model.HOUR_MS).toInt()
            if (idx in 0 until hours) buckets[idx]++
        }
        return buckets.toList()
    }
}
