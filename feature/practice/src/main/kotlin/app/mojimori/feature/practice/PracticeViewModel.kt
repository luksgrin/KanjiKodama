package app.mojimori.feature.practice

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.mojimori.content.KanjiInfo
import app.mojimori.model.Block
import app.mojimori.model.ItemKey
import app.mojimori.model.ItemType
import app.mojimori.srs.AnswerChecker
import app.mojimori.srs.PracticeSampler
import app.mojimori.study.StudyRepository
import app.mojimori.ui.question.Feedback
import app.mojimori.ui.question.PromptKind
import app.mojimori.ui.question.Question
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.random.Random
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PracticeItem(val pick: PracticeSampler.Pick, val kanji: KanjiInfo, val level: Int)

data class BlockResult(val block: Block, val asked: Int, val correct: Int)

data class PracticeState(
    val loading: Boolean = true,
    val length: Int = 20,
    val current: PracticeItem? = null,
    val kind: PromptKind = PromptKind.MEANING,
    val meaningDone: Boolean = false,
    val missed: Boolean = false,
    val feedback: Feedback = Feedback.NONE,
    val correctAnswer: String? = null,
    val asked: Int = 0,
    val results: List<Pair<Block, Boolean>> = emptyList(),
    val finished: Boolean = false,
    val offerResurrect: ItemKey? = null,
) {
    val endless: Boolean get() = length <= 0
    fun byBlock(): List<BlockResult> = results.groupBy { it.first }.map { (b, rs) -> BlockResult(b, rs.size, rs.count { it.second }) }.sortedBy { it.block.ordinal }
}

@HiltViewModel
class PracticeViewModel @Inject constructor(private val repo: StudyRepository, savedState: SavedStateHandle) : ViewModel() {
    private val _state = MutableStateFlow(PracticeState(length = savedState.get<Int>("length") ?: 20))
    val state: StateFlow<PracticeState> = _state
    private val random = Random(System.nanoTime())
    private var states: List<PracticeSampler.ItemState> = emptyList()
    private var sampler: PracticeSampler? = null
    private var block: Block = Block.N5
    private var level: Int = 1
    private val shown = mutableSetOf<ItemKey>()

    init {
        viewModelScope.launch {
            states = repo.practiceStates()
            sampler = repo.sampler()
            repo.practiceContext().let { (b, l) -> block = b; level = l }
            drawNext()
        }
    }

    private suspend fun drawNext() {
        val s = _state.value
        if (!s.endless && s.asked >= s.length) {
            _state.update { it.copy(loading = false, current = null, finished = true) }
            return
        }
        var pick = sampler?.next(states, block, level, System.currentTimeMillis(), shown, random)
        if (pick == null && shown.isNotEmpty()) {
            shown.clear() // endless mode: start over once everything has been seen
            pick = sampler?.next(states, block, level, System.currentTimeMillis(), shown, random)
        }
        if (pick == null) {
            _state.update { it.copy(loading = false, current = null, finished = true) }
            return
        }
        shown += pick.key
        val kanji = repo.content.kanji(pick.key.key)
        if (kanji == null) {
            drawNext(); return
        }
        _state.update {
            it.copy(loading = false, current = PracticeItem(pick, kanji, kanji.level), kind = PromptKind.MEANING, meaningDone = false, missed = false, feedback = Feedback.NONE, correctAnswer = null, offerResurrect = null)
        }
    }

    fun question(item: PracticeItem, kind: PromptKind): Question = Question(
        ItemType.KANJI, item.kanji.literal, item.kanji.strokes, kind,
        tag = if (item.pick.isRefresher) "Refresher · ${item.pick.block.label} · Level ${item.level}" else null,
    )

    fun submit(answer: String) {
        val s = _state.value
        val item = s.current ?: return
        if (s.feedback == Feedback.CORRECT || s.feedback == Feedback.INCORRECT) return
        val verdict = if (s.kind == PromptKind.MEANING) AnswerChecker.checkMeaning(answer, item.kanji.meanings.map { it.text })
        else AnswerChecker.checkReading(answer, item.kanji.askedReadings, item.kanji.otherReadings)
        when (verdict) {
            AnswerChecker.Verdict.CORRECT -> _state.update { it.copy(feedback = Feedback.CORRECT) }
            AnswerChecker.Verdict.WRONG_READING_TYPE -> _state.update { it.copy(feedback = Feedback.SHAKE) }
            AnswerChecker.Verdict.INCORRECT -> _state.update {
                it.copy(feedback = Feedback.INCORRECT, missed = true, correctAnswer = if (s.kind == PromptKind.MEANING) item.kanji.primaryMeaning else item.kanji.askedReadings.joinToString(", "))
            }
        }
    }

    fun advance() {
        val s = _state.value
        val item = s.current ?: return
        if (s.kind == PromptKind.MEANING && item.kanji.askedReadings.isNotEmpty()) {
            _state.update { it.copy(kind = PromptKind.READING, meaningDone = true, feedback = Feedback.NONE, correctAnswer = null) }
            return
        }
        val correct = !s.missed
        viewModelScope.launch {
            val effect = repo.recordPractice(item.pick.key, item.pick.block, correct, item.pick.isRefresher)
            _state.update { it.copy(asked = it.asked + 1, results = it.results + (item.pick.block to correct), offerResurrect = if (effect?.offerResurrect == true) item.pick.key else null) }
            drawNext()
        }
    }

    fun resurrect(key: ItemKey) {
        viewModelScope.launch { repo.resurrect(key); _state.update { it.copy(offerResurrect = null) } }
    }

    fun stop() {
        _state.update { it.copy(current = null, finished = true) }
    }
}
