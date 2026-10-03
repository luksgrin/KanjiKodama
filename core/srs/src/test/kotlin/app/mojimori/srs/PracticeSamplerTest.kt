package app.mojimori.srs

import app.mojimori.model.Block
import app.mojimori.model.DAY_MS
import app.mojimori.model.ItemKey
import app.mojimori.model.PracticeSettings
import io.kotest.matchers.doubles.plusOrMinus
import io.kotest.matchers.shouldBe
import io.kotest.matchers.shouldNotBe
import org.junit.jupiter.api.Test
import kotlin.random.Random

class PracticeSamplerTest {
    private val c = Fixtures.curriculum
    private val now = Fixtures.T0 + 30 * DAY_MS

    private fun state(key: ItemKey, stage: Int = 5, lastSeen: Long? = null, lapses: Int = 0) =
        PracticeSampler.ItemState(Fixtures.passed(key, stage), lastSeen, lapses)

    @Test
    fun `block weights follow the 60 25 15 default and the focus slider`() {
        val s = PracticeSampler(c)
        val w = s.blockWeights(listOf(Block.N5, Block.N4, Block.N3), Block.N3)
        w[Block.N3]!! shouldBe (0.60 plusOrMinus 1e-9)
        w[Block.N4]!! shouldBe (0.25 plusOrMinus 1e-9)
        w[Block.N5]!! shouldBe (0.15 plusOrMinus 1e-9)
        val uniform = PracticeSampler(c, PracticeSettings(focus = 0.0)).blockWeights(listOf(Block.N5, Block.N4), Block.N4)
        uniform[Block.N5]!! shouldBe (0.5 plusOrMinus 1e-9)
        val only = PracticeSampler(c, PracticeSettings(focus = 1.0)).blockWeights(listOf(Block.N5, Block.N4), Block.N4)
        only[Block.N4]!! shouldBe (1.0 plusOrMinus 1e-9)
        s.blockWeights(listOf(Block.N5), Block.N5)[Block.N5]!! shouldBe (1.0 plusOrMinus 1e-9)
    }

    @Test
    fun `sampling distribution matches block weights and never returns unlearned or excluded items`() {
        val s = PracticeSampler(c)
        val states = listOf(
            state(ItemKey.kanji("一")), state(ItemKey.kanji("日")), state(ItemKey.kanji("中")), state(ItemKey.kanji("時")), state(ItemKey.kanji("工")),
            state(ItemKey.kanji("江")),
            PracticeSampler.ItemState(app.mojimori.model.Assignment(ItemKey.kanji("江"), unlockedAt = now), null, 0), // duplicate unstarted ignored
            state(ItemKey.vocab(100)), // vocab excluded by default
        )
        val rnd = Random(42)
        var n4 = 0
        val draws = 10_000
        repeat(draws) {
            val pick = s.next(states, Block.N4, 3, now, emptySet(), rnd)!!
            pick.key.type shouldBe app.mojimori.model.ItemType.KANJI
            if (pick.block == Block.N4) n4++ else pick.isRefresher shouldBe true
        }
        (n4.toDouble() / draws) shouldBe (0.60 plusOrMinus 0.03)
        s.next(states, Block.N4, 3, now, states.map { it.assignment.key }.toSet(), rnd) shouldBe null
    }

    @Test
    fun `staleness prefers old lapsed low stage and series siblings`() {
        val s = PracticeSampler(c)
        val fresh = s.staleness(state(ItemKey.kanji("一"), stage = 8, lastSeen = now), now, emptySet())
        val stale = s.staleness(state(ItemKey.kanji("一"), stage = 8, lastSeen = now - 10 * DAY_MS), now, emptySet())
        val lapsed = s.staleness(state(ItemKey.kanji("一"), stage = 8, lastSeen = now, lapses = 2), now, emptySet())
        val low = s.staleness(state(ItemKey.kanji("一"), stage = 1, lastSeen = now), now, emptySet())
        val sibling = s.staleness(state(ItemKey.kanji("時"), stage = 8, lastSeen = now), now, setOf(1))
        (stale > fresh) shouldBe true
        (lapsed > fresh) shouldBe true
        (low > fresh) shouldBe true
        sibling shouldBe (fresh * 1.5 plusOrMinus 1e-9)
    }

    @Test
    fun `soft mode pulls forward once per day and offers resurrect for burned`() {
        val soft = PracticeSampler(c, PracticeSettings(soft = true))
        val a = Fixtures.passed(ItemKey.kanji("一"), stage = 7).copy(availableAt = now + 10 * DAY_MS)
        val e1 = soft.softEffect(a, correct = false, now = now, lastPullAt = null)
        e1.pulledForward shouldBe true
        e1.assignment.availableAt shouldBe now
        e1.assignment.stage shouldBe 7
        val e2 = soft.softEffect(a, correct = false, now = now, lastPullAt = now - DAY_MS / 2)
        e2.pulledForward shouldBe false
        e2.leechCandidate shouldBe true
        val burned = Fixtures.passed(ItemKey.kanji("一"), stage = 9).copy(availableAt = null)
        soft.softEffect(burned, false, now, null).offerResurrect shouldBe true
        PracticeSampler(c).softEffect(a, false, now, null).assignment shouldBe a
        soft.softEffect(a, true, now, null).assignment shouldNotBe null
    }
}
