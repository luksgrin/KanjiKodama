package app.mojimori.srs

import app.mojimori.model.Assignment
import app.mojimori.model.HOUR_MS
import app.mojimori.model.ItemKey
import io.kotest.matchers.nulls.shouldBeNull
import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class SchedulerTest {
    private val s = Scheduler()
    private val key = ItemKey.kanji("日")
    private val now = Fixtures.T0 + 17 * 60_000L // 17 minutes past an hour boundary? T0 is on the hour

    @Test
    fun `lesson puts item at apprentice one due in four hours on the hour`() {
        val a = s.startLesson(Assignment(key, unlockedAt = now), now)
        a.stage shouldBe 1
        a.startedAt shouldBe now
        a.availableAt shouldBe ((now + 4 * HOUR_MS) / HOUR_MS) * HOUR_MS
        (a.availableAt!! % HOUR_MS) shouldBe 0L
    }

    @Test
    fun `correct review advances and records passed at guru`() {
        var a = Fixtures.started(key, stage = 4)
        val r = s.review(a, 0, 0, now)
        r.stageAfter shouldBe SrsStage.GURU_1
        r.assignment.passedAt shouldBe now
        r.leveledUp shouldBe true
        a = r.assignment
        a.availableAt shouldBe s.truncateToHour(now + 7 * 24 * HOUR_MS)
    }

    @Test
    fun `wrong review drops and keeps passedAt`() {
        val a = Fixtures.passed(key, stage = 6)
        val r = s.review(a, 1, 1, now)
        r.stageAfter shouldBe SrsStage.APPRENTICE_4 // 6 - ceil(2/2)*2 = 4
        r.assignment.passedAt shouldBe a.passedAt
        r.record.meaningIncorrect shouldBe 1
    }

    @Test
    fun `burning clears availability and resurrect brings back at apprentice four`() {
        val r = s.review(Fixtures.passed(key, stage = 8), 0, 0, now)
        r.stageAfter shouldBe SrsStage.BURNED
        r.assignment.availableAt.shouldBeNull()
        r.assignment.burnedAt shouldBe now
        val back = s.resurrect(r.assignment, now + 1)
        back.stage shouldBe 4
        back.availableAt shouldBe now + 1
        assertThrows<IllegalArgumentException> { s.review(r.assignment, 0, 0, now) }
    }

    @Test
    fun `vacation shift moves pending reviews only`() {
        val pending = Fixtures.started(key)
        val burned = Fixtures.passed(ItemKey.kanji("一"), stage = 9).copy(availableAt = null)
        val shifted = s.shift(listOf(pending, burned), 3 * HOUR_MS)
        shifted[0].availableAt shouldBe pending.availableAt!! + 3 * HOUR_MS
        shifted[1].availableAt.shouldBeNull()
    }
}
