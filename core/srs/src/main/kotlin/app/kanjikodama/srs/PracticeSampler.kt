package app.kanjikodama.srs

import app.kanjikodama.model.Assignment
import app.kanjikodama.model.Block
import app.kanjikodama.model.Curriculum
import app.kanjikodama.model.DAY_MS
import app.kanjikodama.model.EpochMillis
import app.kanjikodama.model.ItemKey
import app.kanjikodama.model.ItemType
import app.kanjikodama.model.PracticeSettings
import kotlin.random.Random

/**
 * Cross-block practice sampling (spec §4.8).
 *
 * Two steps: pick a learned block with weights that decay with distance from the current block
 * (shaped by the Focus setting), then pick an item in it with weight proportional to a
 * staleness score (time since last seen, lapses, low stage, series shared with the current level).
 */
class PracticeSampler(
    private val curriculum: Curriculum,
    private val settings: PracticeSettings = PracticeSettings(),
) {
    data class Pick(val key: ItemKey, val block: Block, val isRefresher: Boolean)

    data class ItemState(
        val assignment: Assignment,
        val lastSeenAt: EpochMillis?,
        val recentLapses: Int,
    )

    /** Block weights for the learned blocks, ordered by distance from [current] (index 0 = current). */
    fun blockWeights(learned: List<Block>, current: Block): Map<Block, Double> {
        val ordered = learned.sortedByDescending { it.ordinal }.filter { it.ordinal <= current.ordinal }
        if (ordered.isEmpty()) return emptyMap()
        val n = ordered.size
        val base = DoubleArray(n)
        base[0] = if (n == 1) 1.0 else 0.60
        if (n >= 2) base[1] = if (n == 2) 0.40 else 0.25
        if (n >= 3) for (i in 2 until n) base[i] = 0.15 / (n - 2)
        val uniform = DoubleArray(n) { 1.0 / n }
        val onlyCurrent = DoubleArray(n) { if (it == 0) 1.0 else 0.0 }
        val f = settings.focus
        val w = DoubleArray(n) { i ->
            if (f <= 0.5) lerp(uniform[i], base[i], f / 0.5) else lerp(base[i], onlyCurrent[i], (f - 0.5) / 0.5)
        }
        val sum = w.sum()
        return ordered.indices.associate { ordered[it] to w[it] / sum }
    }

    private fun lerp(a: Double, b: Double, t: Double) = a + (b - a) * t

    fun staleness(state: ItemState, now: EpochMillis, currentLevelSeries: Set<Int>): Double {
        val a = state.assignment
        val days = ((now - (state.lastSeenAt ?: a.startedAt ?: now)) / DAY_MS.toDouble()).coerceAtLeast(0.0)
        var score = 1.0 + days
        score += state.recentLapses * 2.0
        score += (9 - a.stage) * 0.5
        if (a.key.type == ItemType.KANJI) {
            val s = curriculum.kanji[a.key.key]?.seriesId
            if (s != null && s in currentLevelSeries) score *= 1.5
        }
        return score
    }

    private fun eligible(state: ItemState): Boolean {
        val a = state.assignment
        if (!a.isStarted) return false
        return when (a.key.type) {
            ItemType.KANJI -> true
            ItemType.VOCABULARY -> settings.includeVocabulary
            ItemType.COMPONENT -> settings.includeComponents
        }
    }

    /**
     * Draw the next item. [states] covers every started assignment; [exclude] holds keys already
     * shown this session. Returns null when nothing is eligible.
     */
    fun next(
        states: Collection<ItemState>,
        current: Block,
        currentLevel: Int,
        now: EpochMillis,
        exclude: Set<ItemKey>,
        random: Random,
    ): Pick? {
        val pool = states.filter { eligible(it) && it.assignment.key !in exclude }
        if (pool.isEmpty()) return null
        val byBlock = pool.groupBy { curriculum.blockOf(it.assignment.key) ?: Block.N5 }
        val weights = blockWeights(byBlock.keys.toList(), current).filterKeys { it in byBlock }
        if (weights.isEmpty()) return null
        val block = weightedChoice(weights.keys.toList(), weights.values.toList(), random)
        val series = curriculum.kanjiAtLevel(currentLevel).mapNotNull { it.seriesId }.toSet()
        val items = byBlock.getValue(block)
        val scores = items.map { staleness(it, now, series) }
        val chosen = weightedChoice(items, scores, random)
        return Pick(chosen.assignment.key, block, isRefresher = block != current)
    }

    private fun <T> weightedChoice(items: List<T>, weights: List<Double>, random: Random): T {
        val total = weights.sum()
        if (total <= 0.0) return items[random.nextInt(items.size)]
        var r = random.nextDouble() * total
        for (i in items.indices) {
            r -= weights[i]
            if (r <= 0) return items[i]
        }
        return items.last()
    }

    data class SoftEffect(val assignment: Assignment, val pulledForward: Boolean, val leechCandidate: Boolean, val offerResurrect: Boolean)

    /** Soft mode side effects of a wrong practice answer (spec §4.8). Never changes the stage. */
    fun softEffect(a: Assignment, correct: Boolean, now: EpochMillis, lastPullAt: EpochMillis?): SoftEffect {
        if (correct || !settings.soft) return SoftEffect(a, false, false, false)
        if (a.isBurned) return SoftEffect(a, false, true, offerResurrect = true)
        val pulledToday = lastPullAt != null && now - lastPullAt < DAY_MS
        val availableAt = a.availableAt
        val due = availableAt != null && availableAt <= now
        return if (pulledToday || due) SoftEffect(a, false, true, false)
        else SoftEffect(a.copy(availableAt = now), true, true, false)
    }
}
