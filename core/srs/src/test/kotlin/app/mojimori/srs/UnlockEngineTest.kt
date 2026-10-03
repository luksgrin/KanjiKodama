package app.mojimori.srs

import app.mojimori.model.Block
import app.mojimori.model.GateStrictness
import app.mojimori.model.ItemKey
import app.mojimori.model.SrsSettings
import io.kotest.matchers.collections.shouldContain
import io.kotest.matchers.collections.shouldContainExactlyInAnyOrder
import io.kotest.matchers.collections.shouldNotContain
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test

class UnlockEngineTest {
    private val c = Fixtures.curriculum
    private val engine = UnlockEngine(c)
    private val now = Fixtures.T0

    @Test
    fun `fresh learner gets level one components and atomic kanji only`() {
        val unlocks = engine.newUnlocks(emptyMap(), now).map { it.key }
        unlocks shouldContainExactlyInAnyOrder listOf(
            ItemKey.component("一"), ItemKey.component("口"), ItemKey.kanji("一"), ItemKey.kanji("日"),
        )
        engine.highestOpenLevel(emptyMap()) shouldBe 1
    }

    @Test
    fun `kanji unlocks when its components pass and vocab when its kanji pass`() {
        val a = Fixtures.allPassed(listOf(ItemKey.component("口"))) +
            mapOf(ItemKey.component("一") to Fixtures.started(ItemKey.component("一")))
        val unlocks = engine.newUnlocks(a, now).map { it.key }
        unlocks shouldContain ItemKey.kanji("中")
        unlocks shouldNotContain ItemKey.vocab(100)
        val b = a + Fixtures.allPassed(listOf(ItemKey.kanji("一"), ItemKey.kanji("日")))
        engine.newUnlocks(b, now).map { it.key } shouldContain ItemKey.vocab(100)
    }

    @Test
    fun `level two opens at ninety percent of level one kanji passed`() {
        // level 1 has 3 kanji: 2/3 = 67% is not enough, 3/3 is
        val two = Fixtures.allPassed(listOf(ItemKey.kanji("一"), ItemKey.kanji("日")))
        engine.highestOpenLevel(two) shouldBe 1
        val three = two + Fixtures.allPassed(listOf(ItemKey.kanji("中")))
        engine.highestOpenLevel(three) shouldBe 2
        engine.newUnlocks(three, now).map { it.key } shouldContain ItemKey.component("寺")
    }

    @Test
    fun `block gate is strict by default and relaxed on request`() {
        val level1 = Fixtures.allPassed(listOf(ItemKey.kanji("一"), ItemKey.kanji("日"), ItemKey.kanji("中")))
        // level 2 (last of N5) has 時 and 工; pass only 工: 1/2 = 50% < 90% level-up share anyway
        val partial = level1 + Fixtures.allPassed(listOf(ItemKey.kanji("工")))
        engine.highestOpenLevel(partial) shouldBe 2
        engine.blockProgress(partial, Block.N5).holding shouldBe listOf("時")
        // all of N5 passed: gate opens
        val cleared = partial + Fixtures.allPassed(listOf(ItemKey.kanji("時")))
        engine.highestOpenLevel(cleared) shouldBe 3
        engine.currentBlock(cleared) shouldBe Block.N4
        engine.clearedBlocks(cleared) shouldBe listOf(Block.N5)
        // relaxed with a 20-kanji block would pass at 95%; with 5 kanji 4/5 = 80% does not
        val relaxed = UnlockEngine(c, SrsSettings(gateStrictness = GateStrictness.RELAXED))
        relaxed.isBlockCleared(partial, Block.N5) shouldBe false
        relaxed.isBlockCleared(cleared, Block.N5) shouldBe true
    }

    @Test
    fun `kanji whose component is taught at the same level waits for the component`() {
        val all = Fixtures.allPassed(listOf(ItemKey.kanji("一"), ItemKey.kanji("日"), ItemKey.kanji("中"), ItemKey.kanji("工"), ItemKey.kanji("時"), ItemKey.component("工")))
        // level 3 open; 江 needs 氵 (level 3 component) and 工 (component) passed
        val unlocks = engine.newUnlocks(all, now).map { it.key }
        unlocks shouldContain ItemKey.component("氵")
        unlocks shouldNotContain ItemKey.kanji("江")
        val withSanzui = all + Fixtures.allPassed(listOf(ItemKey.component("氵")))
        engine.newUnlocks(withSanzui, now).map { it.key } shouldContain ItemKey.kanji("江")
    }
}
