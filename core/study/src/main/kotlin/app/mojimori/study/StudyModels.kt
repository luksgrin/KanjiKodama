package app.mojimori.study

import app.mojimori.model.Assignment
import app.mojimori.model.Block
import app.mojimori.model.EpochMillis
import app.mojimori.model.ItemKey
import app.mojimori.srs.UnlockEngine

data class StageCounts(val apprentice: Int, val guru: Int, val master: Int, val enlightened: Int, val burned: Int)

data class DashboardSnapshot(
    val level: Int,
    val block: Block,
    val lessonsAvailable: Int,
    val reviewsAvailable: Int,
    val nextReviewAt: EpochMillis?,
    val forecast24h: List<Int>,
    val levelProgress: UnlockEngine.LevelProgress,
    val blockProgress: UnlockEngine.BlockProgress,
    val stageCounts: StageCounts,
    val leechCandidates: List<ItemKey>,
)

/** Result of one completed review, including whether it caused a level-up or block clear. */
data class ReviewOutcome(
    val assignment: Assignment,
    val stageBefore: Int,
    val stageAfter: Int,
    val newLevel: Int?,
    val clearedBlock: Block?,
)
