package app.kanjikodama.srs

import kotlin.math.ceil

/**
 * Stage transition after a completed review (spec §4.4).
 *
 * Both prompts correct on the first try: stage + 1.
 * Otherwise: stage − ceil(incorrect / 2) × penalty, floored at Apprentice I,
 * where penalty is 1 below Guru and 2 from Guru upward.
 */
object StageTransition {
    fun next(current: SrsStage, incorrectAnswers: Int): SrsStage {
        require(current != SrsStage.LOCKED) { "Locked items are not reviewed" }
        require(incorrectAnswers >= 0)
        if (incorrectAnswers == 0) {
            return SrsStage.of(minOf(current.number + 1, SrsStage.BURNED.number))
        }
        val penalty = if (current.isGuruOrAbove) 2 else 1
        val drop = ceil(incorrectAnswers / 2.0).toInt() * penalty
        return SrsStage.of(maxOf(SrsStage.APPRENTICE_1.number, current.number - drop))
    }
}
