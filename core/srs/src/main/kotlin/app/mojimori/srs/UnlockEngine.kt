package app.mojimori.srs

import app.mojimori.model.Assignment
import app.mojimori.model.Block
import app.mojimori.model.Curriculum
import app.mojimori.model.EpochMillis
import app.mojimori.model.ItemKey
import app.mojimori.model.SrsSettings

/**
 * Unlock, level-up and block-gate rules (spec §4.5), evaluated over a snapshot of assignments.
 *
 * Level 1 is always open. Level n+1 opens when ≥ levelUpShare of level n's kanji have passed
 * (reached Guru I), and, when level n ends a block, when the block is cleared under the gate
 * strictness. Items unlock inside open levels when their prerequisites have passed.
 */
class UnlockEngine(
    private val curriculum: Curriculum,
    private val settings: SrsSettings = SrsSettings(),
) {
    data class BlockProgress(val block: Block, val passed: Int, val total: Int, val holding: List<String>) {
        val share: Double get() = if (total == 0) 1.0 else passed.toDouble() / total
    }

    data class LevelProgress(val level: Int, val passed: Int, val total: Int) {
        val share: Double get() = if (total == 0) 1.0 else passed.toDouble() / total
    }

    private fun passed(assignments: Map<ItemKey, Assignment>, key: ItemKey): Boolean =
        assignments[key]?.isPassed == true

    fun levelProgress(assignments: Map<ItemKey, Assignment>, level: Int): LevelProgress {
        val kanji = curriculum.kanjiAtLevel(level)
        return LevelProgress(level, kanji.count { passed(assignments, ItemKey.kanji(it.literal)) }, kanji.size)
    }

    fun blockProgress(assignments: Map<ItemKey, Assignment>, block: Block): BlockProgress {
        val kanji = curriculum.kanjiInBlock(block)
        val holding = kanji.filter { !passed(assignments, ItemKey.kanji(it.literal)) }.map { it.literal }
        return BlockProgress(block, kanji.size - holding.size, kanji.size, holding)
    }

    fun isBlockCleared(assignments: Map<ItemKey, Assignment>, block: Block): Boolean {
        val p = blockProgress(assignments, block)
        return p.total == 0 || p.share >= settings.gateStrictness.requiredShare
    }

    private fun isLastLevelOfBlock(level: Int): Boolean {
        val block = curriculum.blockOf(level) ?: return false
        return curriculum.levelsOf(block).maxOf { it.number } == level
    }

    /** Highest level whose content is open to the learner. */
    fun highestOpenLevel(assignments: Map<ItemKey, Assignment>): Int {
        var open = 1
        while (open < curriculum.maxLevel) {
            if (levelProgress(assignments, open).share < settings.levelUpShare) break
            if (isLastLevelOfBlock(open) && !isBlockCleared(assignments, curriculum.blockOf(open)!!)) break
            open++
        }
        return open
    }

    /** The block the learner is working in: that of the highest open level. */
    fun currentBlock(assignments: Map<ItemKey, Assignment>): Block =
        curriculum.blockOf(highestOpenLevel(assignments)) ?: Block.N5

    /** Blocks whose gate has been passed (every level of the block is behind the highest open level). */
    fun clearedBlocks(assignments: Map<ItemKey, Assignment>): List<Block> {
        val current = currentBlock(assignments)
        return Block.entries.filter { it.ordinal < current.ordinal && curriculum.levelsOf(it).isNotEmpty() }
    }

    /**
     * Items that should become unlocked now: in open levels, with all prerequisites passed, and
     * without an assignment yet. Returned as fresh assignments (stage 0, lesson pending).
     */
    fun newUnlocks(assignments: Map<ItemKey, Assignment>, now: EpochMillis): List<Assignment> {
        val open = highestOpenLevel(assignments)
        val out = mutableListOf<Assignment>()
        for (c in curriculum.components.values) {
            val key = ItemKey.component(c.slug)
            if (c.level <= open && key !in assignments) out += Assignment(key, unlockedAt = now)
        }
        for (k in curriculum.kanji.values) {
            val key = ItemKey.kanji(k.literal)
            if (k.level > open || key in assignments) continue
            val ready = k.components.all { slug ->
                curriculum.components[slug] == null || passed(assignments, ItemKey.component(slug))
            }
            if (ready) out += Assignment(key, unlockedAt = now)
        }
        for (v in curriculum.vocab.values) {
            val key = ItemKey.vocab(v.id)
            if (v.level > open || key in assignments) continue
            val ready = v.kanji.all { lit -> curriculum.kanji[lit] == null || passed(assignments, ItemKey.kanji(lit)) }
            if (ready) out += Assignment(key, unlockedAt = now)
        }
        return out
    }
}
