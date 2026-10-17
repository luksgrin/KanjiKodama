package app.kanjikodama.study

import app.kanjikodama.model.EpochMillis

fun interface Clock {
    fun now(): EpochMillis

    companion object {
        val SYSTEM: Clock = Clock { System.currentTimeMillis() }
    }
}
