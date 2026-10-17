package app.kanjikodama.model

/** Epoch milliseconds, UTC. Kept as Long so the domain stays platform-neutral. */
typealias EpochMillis = Long

const val HOUR_MS: Long = 60L * 60L * 1000L
const val DAY_MS: Long = 24L * HOUR_MS

/**
 * One learner's relationship with one item. Exists only once the item is unlocked.
 * [stage] is the SRS stage number (0 = unlocked but not yet taught, 1..9 as in spec §4.4).
 */
data class Assignment(
    val key: ItemKey,
    val stage: Int = 0,
    val unlockedAt: EpochMillis,
    val startedAt: EpochMillis? = null,
    val availableAt: EpochMillis? = null,
    val passedAt: EpochMillis? = null,
    val burnedAt: EpochMillis? = null,
    val resurrectedAt: EpochMillis? = null,
) {
    val isStarted: Boolean get() = startedAt != null
    val isPassed: Boolean get() = passedAt != null && stage >= 5
    val isBurned: Boolean get() = stage == 9
    fun isDue(now: EpochMillis): Boolean = isStarted && !isBurned && availableAt != null && availableAt <= now
}

/** One completed review of one item. */
data class ReviewRecord(
    val key: ItemKey,
    val reviewedAt: EpochMillis,
    val stageBefore: Int,
    val stageAfter: Int,
    val meaningIncorrect: Int,
    val readingIncorrect: Int,
)

/** One answered practice prompt (spec §4.8). */
data class PracticeRecord(
    val key: ItemKey,
    val at: EpochMillis,
    val correct: Boolean,
    val wasRefresher: Boolean,
)
