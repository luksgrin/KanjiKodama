package app.kanjikodama.ui.srs

import androidx.compose.ui.graphics.Color

/** Stage-group colours; every use also carries a text label (spec §13). */
object SrsColors {
    val Locked = Color(0xFF9E9E9E)
    val Apprentice = Color(0xFFD81B60)
    val Guru = Color(0xFF8E24AA)
    val Master = Color(0xFF1E88E5)
    val Enlightened = Color(0xFF00ACC1)
    val Burned = Color(0xFF424242)

    fun forStage(stage: Int): Color = when (stage) {
        0 -> Locked
        in 1..4 -> Apprentice
        5, 6 -> Guru
        7 -> Master
        8 -> Enlightened
        else -> Burned
    }

    fun label(stage: Int): String = when (stage) {
        0 -> "Lesson"
        1 -> "Apprentice I"
        2 -> "Apprentice II"
        3 -> "Apprentice III"
        4 -> "Apprentice IV"
        5 -> "Guru I"
        6 -> "Guru II"
        7 -> "Master"
        8 -> "Enlightened"
        else -> "Burned"
    }

    val KanjiTint = Color(0xFFE91E63)
    val VocabTint = Color(0xFF7B1FA2)
    val ComponentTint = Color(0xFF1976D2)
}
