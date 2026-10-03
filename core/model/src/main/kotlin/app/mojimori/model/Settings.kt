package app.mojimori.model

enum class GateStrictness(val requiredShare: Double) {
    /** Every kanji of the block at Guru I or above. */
    STRICT(1.0),

    /** 95 % of the block's kanji at Guru I or above. */
    RELAXED(0.95),
}

data class SrsSettings(
    /** Milliseconds to wait after arriving at stage n (index n); null = never. Index 0 unused. */
    val intervals: List<Long?> = DEFAULT_INTERVALS,
    val lessonBatchSize: Int = 5,
    val dailyLessonCap: Int? = null,
    val levelUpShare: Double = 0.9,
    val gateStrictness: GateStrictness = GateStrictness.STRICT,
) {
    init {
        require(intervals.size == 10)
        require(lessonBatchSize in 1..20)
        require(levelUpShare in 0.5..1.0)
    }

    companion object {
        val DEFAULT_INTERVALS: List<Long?> = listOf(
            null,
            4 * HOUR_MS,
            8 * HOUR_MS,
            DAY_MS,
            2 * DAY_MS,
            7 * DAY_MS,
            14 * DAY_MS,
            30 * DAY_MS,
            120 * DAY_MS,
            null,
        )
    }
}

data class PracticeSettings(
    /** 0 = uniform across all learned blocks, 0.5 = default 60/25/15 weighting, 1 = current block only. */
    val focus: Double = 0.5,
    val includeVocabulary: Boolean = false,
    val includeComponents: Boolean = false,
    /** Soft mode: a wrong answer pulls the next review forward (once per day) and flags a leech. */
    val soft: Boolean = false,
) {
    init {
        require(focus in 0.0..1.0)
    }
}
