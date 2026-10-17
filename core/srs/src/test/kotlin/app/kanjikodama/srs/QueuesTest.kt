package app.kanjikodama.srs

import app.kanjikodama.model.Assignment
import app.kanjikodama.model.HOUR_MS
import app.kanjikodama.model.ItemKey
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import kotlin.random.Random

class QueuesTest {
    private val c = Fixtures.curriculum
    private val now = Fixtures.T0

    @Test
    fun `lessons go components then kanji then vocab by level`() {
        val pending = listOf(
            Assignment(ItemKey.vocab(100), unlockedAt = now),
            Assignment(ItemKey.kanji("時"), unlockedAt = now),
            Assignment(ItemKey.kanji("一"), unlockedAt = now),
            Assignment(ItemKey.component("寺"), unlockedAt = now),
            Assignment(ItemKey.component("口"), unlockedAt = now),
            Fixtures.started(ItemKey.kanji("日")), // already started: excluded
        )
        LessonQueue.order(c, pending).map { it.key.key } shouldBe listOf("口", "一", "100", "寺", "時")
        LessonQueue.nextBatch(c, pending, batchSize = 5, dailyCap = 3, doneToday = 1).size shouldBe 2
        LessonQueue.nextBatch(c, pending, batchSize = 2, dailyCap = null, doneToday = 0).size shouldBe 2
    }

    @Test
    fun `due reviews and forecast`() {
        val due = Fixtures.started(ItemKey.kanji("一")).copy(availableAt = now - 1)
        val later = Fixtures.started(ItemKey.kanji("日")).copy(availableAt = now + 2 * HOUR_MS + 1)
        val burned = Fixtures.passed(ItemKey.kanji("中"), stage = 9).copy(availableAt = null)
        val notStarted = Assignment(ItemKey.kanji("時"), unlockedAt = now)
        val all = listOf(due, later, burned, notStarted)
        ReviewQueue.due(all, now).map { it.key.key } shouldBe listOf("一")
        ReviewQueue.session(all, now, Random(1)).size shouldBe 1
        ReviewQueue.forecast(all, now, 4) shouldBe listOf(0, 0, 1, 0)
    }
}
