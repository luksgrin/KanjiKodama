package app.kanjikodama.srs

import io.kotest.matchers.shouldBe
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource

class StageTransitionTest {

    @Test
    fun `correct answer advances one stage`() {
        StageTransition.next(SrsStage.APPRENTICE_1, 0) shouldBe SrsStage.APPRENTICE_2
        StageTransition.next(SrsStage.GURU_2, 0) shouldBe SrsStage.MASTER
    }

    @Test
    fun `enlightened and correct burns`() {
        StageTransition.next(SrsStage.ENLIGHTENED, 0) shouldBe SrsStage.BURNED
    }

    @ParameterizedTest(name = "stage {0} with {1} wrong -> {2}")
    @CsvSource(
        "4, 1, 3",   // Apprentice IV, one miss: -1
        "4, 2, 3",   // two misses still ceil(2/2)=1
        "4, 3, 2",   // three misses: ceil(3/2)=2
        "2, 5, 1",   // never below Apprentice I
        "5, 1, 3",   // Guru I, one miss: penalty 2
        "7, 3, 3",   // Master, three misses: 2*2=4
        "8, 1, 6",   // Enlightened, one miss: -2
    )
    fun `wrong answers drop by WaniKani formula`(from: Int, wrong: Int, expected: Int) {
        StageTransition.next(SrsStage.of(from), wrong) shouldBe SrsStage.of(expected)
    }

    @Test
    fun `stage never leaves the 1 to 9 range`() {
        for (stage in SrsStage.entries.filter { it != SrsStage.LOCKED }) {
            for (wrong in 0..20) {
                (StageTransition.next(stage, wrong).number in 1..9) shouldBe true
            }
        }
    }
}
