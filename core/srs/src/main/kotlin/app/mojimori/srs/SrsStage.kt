package app.mojimori.srs

import kotlin.time.Duration
import kotlin.time.Duration.Companion.days
import kotlin.time.Duration.Companion.hours

/**
 * WaniKani-style SRS stages (spec §4.4). [interval] is the wait until the next review
 * after an item *arrives* at this stage; null means never (Burned).
 */
enum class SrsStage(val number: Int, val label: String, val interval: Duration?) {
    LOCKED(0, "Locked", null),
    APPRENTICE_1(1, "Apprentice I", 4.hours),
    APPRENTICE_2(2, "Apprentice II", 8.hours),
    APPRENTICE_3(3, "Apprentice III", 1.days),
    APPRENTICE_4(4, "Apprentice IV", 2.days),
    GURU_1(5, "Guru I", 7.days),
    GURU_2(6, "Guru II", 14.days),
    MASTER(7, "Master", 30.days),
    ENLIGHTENED(8, "Enlightened", 120.days),
    BURNED(9, "Burned", null);

    val isApprentice: Boolean get() = number in 1..4
    val isGuruOrAbove: Boolean get() = number >= GURU_1.number
    val isBurned: Boolean get() = this == BURNED

    companion object {
        fun of(number: Int): SrsStage = entries.first { it.number == number }
        val MIN_REVIEWABLE: SrsStage = APPRENTICE_1
    }
}
