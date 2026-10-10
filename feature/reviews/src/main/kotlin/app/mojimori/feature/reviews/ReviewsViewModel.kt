package app.mojimori.feature.reviews

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.mojimori.content.ComponentInfo
import app.mojimori.content.KanjiInfo
import app.mojimori.content.VocabInfo
import app.mojimori.model.Assignment
import app.mojimori.model.Block
import app.mojimori.model.ItemKey
import app.mojimori.model.ItemType
import app.mojimori.srs.AnswerChecker
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

/** Content needed to ask and check an item. */
sealed interface Reviewable {
    val key: ItemKey
    val glyph: String
    val strokes: List<String>
    val type: ItemType
    val meanings: List<String>
    val readings: List<String>
    val otherReadings: List<String>
    val summary: String
    /** One short line for lists: the primary answer(s). */
    val shortLabel: String

    data class Component(val info: ComponentInfo) : Reviewable {
        override val key get() = ItemKey.component(info.slug)
        override val glyph get() = info.glyph
        override val strokes get() = info.strokes
        override val type get() = ItemType.COMPONENT
        override val meanings get() = listOf(info.name) + info.meaning.split(",").map { it.trim() }
        override val readings get() = emptyList<String>()
        override val otherReadings get() = emptyList<String>()
        override val summary get() = "${info.name} — ${info.meaning}"
        override val shortLabel get() = info.name
    }

    data class Kanji(val info: KanjiInfo) : Reviewable {
        override val key get() = ItemKey.kanji(info.literal)
        override val glyph get() = info.literal
        override val strokes get() = info.strokes
        override val type get() = ItemType.KANJI
        override val meanings get() = info.meanings.map { it.text }
        override val readings get() = info.askedReadings
        override val otherReadings get() = info.otherReadings
        override val summary get() = "${info.primaryMeaning} · ${info.askedReadings.joinToString("、")}\n${info.readingMnemonic}"
        override val shortLabel get() = "${info.primaryMeaning} · ${info.askedReadings.joinToString("、")}"
    }

    data class Vocab(val info: VocabInfo) : Reviewable {
        override val key get() = ItemKey.vocab(info.id)
        override val glyph get() = info.word
        override val strokes get() = emptyList<String>()
        override val type get() = ItemType.VOCABULARY
        override val meanings get() = info.meanings
        override val readings get() = info.readings
        override val otherReadings get() = emptyList<String>()
        override val summary get() = "${info.readings.first()} · ${info.meanings.take(3).joinToString(", ")}"
        override val shortLabel get() = "${info.readings.first()} · ${info.primaryMeaning}"
    }
}

data class PendingItem(
    val assignment: Assignment,
    val content: Reviewable,
    val remaining: Set<PromptKind>,
    val meaningIncorrect: Int = 0,
    val readingIncorrect: Int = 0,
)

data class Prompt(val item: PendingItem, val kind: PromptKind)

data class CompletedItem(val content: Reviewable, val stageBefore: Int, val stageAfter: Int, val incorrect: Int)

data class ReviewsState(
    val loading: Boolean = true,
    val queue: List<PendingItem> = emptyList(),
    val current: Prompt? = null,
    val feedback: Feedback = Feedback.NONE,
    val correctAnswer: String? = null,
    val completed: List<CompletedItem> = emptyList(),
    val total: Int = 0,
    val newLevel: Int? = null,
    val clearedBlock: Block? = null,
    val lastStageChange: Pair<Int, Int>? = null,
) {
    val finished: Boolean get() = !loading && current == null
    val correctCount: Int get() = completed.count { it.incorrect == 0 }
}

@HiltViewModel
class ReviewsViewModel @Inject constructor(private val repo: StudyRepository) : ViewModel() {
    private val _state = MutableStateFlow(ReviewsState())
    val state: StateFlow<ReviewsState> = _state
    private val random = Random(System.nanoTime())

    init {
        viewModelScope.launch {
            val due = repo.dueReviews(random)
            val items = due.mapNotNull { a ->
                val content = load(a.key) ?: return@mapNotNull null
                val prompts = if (a.key.type == ItemType.COMPONENT) setOf(PromptKind.MEANING) else setOf(PromptKind.MEANING, PromptKind.READING)
                PendingItem(a, content, prompts)
            }
            _state.value = ReviewsState(loading = false, queue = items, total = items.size, current = pick(items))
        }
    }

    private suspend fun load(key: ItemKey): Reviewable? = when (key.type) {
        ItemType.COMPONENT -> repo.content.component(key.key)?.let { Reviewable.Component(it) }
        ItemType.KANJI -> repo.content.kanji(key.key)?.let { Reviewable.Kanji(it) }
        ItemType.VOCABULARY -> repo.content.vocab(key.key.toLong())?.let { Reviewable.Vocab(it) }
    }

    /** Pick among the first few queued items so prompts interleave but the queue still drains. */
    private fun pick(queue: List<PendingItem>): Prompt? {
        if (queue.isEmpty()) return null
        val window = queue.take(5)
        val item = window[random.nextInt(window.size)]
        val kind = item.remaining.random(random)
        return Prompt(item, kind)
    }

    fun question(p: Prompt): Question = Question(p.item.content.type, p.item.content.glyph, p.item.content.strokes, p.kind)

    fun submit(answer: String) {
        val s = _state.value
        val p = s.current ?: return
        if (s.feedback == Feedback.CORRECT || s.feedback == Feedback.INCORRECT) return
        val c = p.item.content
        val verdict = if (p.kind == PromptKind.MEANING) AnswerChecker.checkMeaning(answer, c.meanings)
        else AnswerChecker.checkReading(answer, c.readings, c.otherReadings)
        when (verdict) {
            AnswerChecker.Verdict.CORRECT -> _state.update { it.copy(feedback = Feedback.CORRECT) }
            AnswerChecker.Verdict.WRONG_READING_TYPE -> _state.update { it.copy(feedback = Feedback.SHAKE) }
            AnswerChecker.Verdict.INCORRECT -> _state.update {
                it.copy(feedback = Feedback.INCORRECT, correctAnswer = if (p.kind == PromptKind.MEANING) c.meanings.first() else c.readings.joinToString(", "))
            }
        }
    }

    fun advance() {
        val s = _state.value
        val p = s.current ?: return
        val wasCorrect = s.feedback == Feedback.CORRECT
        var item = p.item
        if (!wasCorrect) {
            item = if (p.kind == PromptKind.MEANING) item.copy(meaningIncorrect = item.meaningIncorrect + 1) else item.copy(readingIncorrect = item.readingIncorrect + 1)
        } else {
            item = item.copy(remaining = item.remaining - p.kind)
        }
        val others = s.queue.filter { it.assignment.key != item.assignment.key }
        if (item.remaining.isEmpty()) {
            viewModelScope.launch {
                val outcome = repo.submitReview(item.assignment.key, item.meaningIncorrect, item.readingIncorrect)
                _state.update {
                    it.copy(
                        queue = others,
                        current = pick(others),
                        feedback = Feedback.NONE,
                        correctAnswer = null,
                        completed = it.completed + CompletedItem(item.content, outcome.stageBefore, outcome.stageAfter, item.meaningIncorrect + item.readingIncorrect),
                        newLevel = outcome.newLevel ?: it.newLevel,
                        clearedBlock = outcome.clearedBlock ?: it.clearedBlock,
                        lastStageChange = outcome.stageBefore to outcome.stageAfter,
                    )
                }
            }
        } else {
            // wrong or half-done: push the item back a little so the other prompt comes later
            val queue = (others.take(3) + item + others.drop(3))
            _state.update { it.copy(queue = queue, current = pick(queue), feedback = Feedback.NONE, correctAnswer = null, lastStageChange = null) }
        }
    }

    fun wrapUp() {
        _state.update { it.copy(current = null, queue = emptyList()) }
    }
}
