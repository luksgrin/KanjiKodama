package app.kanjikodama.srs

import app.kanjikodama.model.Assignment
import app.kanjikodama.model.EpochMillis
import app.kanjikodama.model.HOUR_MS
import app.kanjikodama.model.ReviewRecord
import app.kanjikodama.model.SrsSettings

/** Applies lessons, reviews and resurrections to assignments (spec §4.4). */
class Scheduler(private val settings: SrsSettings = SrsSettings()) {

    /** Reviews land on the hour so they arrive in batches. */
    fun truncateToHour(t: EpochMillis): EpochMillis = (t / HOUR_MS) * HOUR_MS

    fun availableAfter(stage: SrsStage, now: EpochMillis): EpochMillis? =
        settings.intervals[stage.number]?.let { truncateToHour(now + it) }

    /** Lesson completed: Apprentice I, first review in four hours (truncated to the hour). */
    fun startLesson(a: Assignment, now: EpochMillis): Assignment {
        require(!a.isStarted) { "${a.key} already started" }
        return a.copy(
            stage = SrsStage.APPRENTICE_1.number,
            startedAt = now,
            availableAt = availableAfter(SrsStage.APPRENTICE_1, now),
        )
    }

    data class ReviewResult(val assignment: Assignment, val record: ReviewRecord) {
        val stageBefore: SrsStage get() = SrsStage.of(record.stageBefore)
        val stageAfter: SrsStage get() = SrsStage.of(record.stageAfter)
        val leveledUp: Boolean get() = record.stageAfter > record.stageBefore
    }

    fun review(a: Assignment, meaningIncorrect: Int, readingIncorrect: Int, now: EpochMillis): ReviewResult {
        require(a.isStarted && !a.isBurned) { "${a.key} is not reviewable" }
        val before = SrsStage.of(a.stage)
        val after = StageTransition.next(before, meaningIncorrect + readingIncorrect)
        val updated = a.copy(
            stage = after.number,
            availableAt = availableAfter(after, now),
            passedAt = a.passedAt ?: now.takeIf { after.isGuruOrAbove },
            burnedAt = a.burnedAt ?: now.takeIf { after.isBurned },
        )
        return ReviewResult(
            updated,
            ReviewRecord(a.key, now, before.number, after.number, meaningIncorrect, readingIncorrect),
        )
    }

    /** Burned item brought back at Apprentice IV, due immediately. */
    fun resurrect(a: Assignment, now: EpochMillis): Assignment {
        require(a.isBurned) { "${a.key} is not burned" }
        return a.copy(stage = SrsStage.APPRENTICE_4.number, availableAt = now, resurrectedAt = now)
    }

    /** Vacation mode: shift every pending review by the time spent away. */
    fun shift(assignments: Collection<Assignment>, deltaMillis: Long): List<Assignment> =
        assignments.map { a ->
            val t = a.availableAt
            if (t != null && !a.isBurned) a.copy(availableAt = t + deltaMillis) else a
        }
}
