package app.mojimori.study

import app.mojimori.model.EpochMillis

fun interface Clock {
    fun now(): EpochMillis

    companion object {
        val SYSTEM: Clock = Clock { System.currentTimeMillis() }
    }
}
