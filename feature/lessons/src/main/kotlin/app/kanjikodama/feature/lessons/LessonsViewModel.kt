package app.kanjikodama.feature.lessons

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.kanjikodama.content.ComponentInfo
import app.kanjikodama.content.ComponentSummary
import app.kanjikodama.content.KanjiInfo
import app.kanjikodama.content.KanjiSummary
import app.kanjikodama.content.SeriesInfo
import app.kanjikodama.content.VocabInfo
import app.kanjikodama.content.VocabSummary
import app.kanjikodama.model.ItemKey
import app.kanjikodama.model.ItemType
import app.kanjikodama.srs.AnswerChecker
import app.kanjikodama.study.StudyRepository
import app.kanjikodama.ui.question.Feedback
import app.kanjikodama.ui.question.PromptKind
import app.kanjikodama.ui.question.Question
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface LessonItem {
    val key: ItemKey

    data class Component(val info: ComponentInfo, val usedIn: List<KanjiSummary>) : LessonItem {
        override val key get() = ItemKey.component(info.slug)
    }

    data class Kanji(val info: KanjiInfo, val components: Map<String, ComponentSummary>, val series: SeriesInfo?, val vocab: List<VocabSummary>) : LessonItem {
        override val key get() = ItemKey.kanji(info.literal)
    }

    data class Vocab(val info: VocabInfo, val kanji: Map<String, KanjiSummary>) : LessonItem {
        override val key get() = ItemKey.vocab(info.id)
    }
}

data class QuizPrompt(val item: LessonItem, val kind: PromptKind)

sealed interface LessonPhase {
    data object Loading : LessonPhase
    data class Learn(val page: Int) : LessonPhase
    data class Quiz(val queue: List<QuizPrompt>, val feedback: Feedback, val correctAnswer: String?, val misses: Int) : LessonPhase
    data class Done(val remaining: Int) : LessonPhase
    data object Empty : LessonPhase
}

data class LessonsState(val items: List<LessonItem> = emptyList(), val phase: LessonPhase = LessonPhase.Loading)

@HiltViewModel
class LessonsViewModel @Inject constructor(private val repo: StudyRepository) : ViewModel() {
    private val _state = MutableStateFlow(LessonsState())
    val state: StateFlow<LessonsState> = _state

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            repo.refreshUnlocks()
            val batch = repo.lessonBatch()
            val items = batch.mapNotNull { a -> loadItem(a.key) }
            _state.value = LessonsState(items, if (items.isEmpty()) LessonPhase.Empty else LessonPhase.Learn(0))
        }
    }

    private suspend fun loadItem(key: ItemKey): LessonItem? = when (key.type) {
        ItemType.COMPONENT -> repo.content.component(key.key)?.let { LessonItem.Component(it, repo.content.kanjiUsingComponent(it.slug).take(8)) }
        ItemType.KANJI -> repo.content.kanji(key.key)?.let { k ->
            LessonItem.Kanji(
                k,
                repo.content.componentSummaries(k.components.map { it.slug }),
                k.seriesId?.let { repo.content.series(it) },
                repo.content.vocabUsingKanji(k.literal).take(5),
            )
        }
        ItemType.VOCABULARY -> repo.content.vocab(key.key.toLong())?.let { v -> LessonItem.Vocab(v, repo.content.kanjiSummaries(v.kanji)) }
    }

    fun next() {
        val s = _state.value
        val p = s.phase as? LessonPhase.Learn ?: return
        if (p.page + 1 < s.items.size) {
            _state.update { it.copy(phase = LessonPhase.Learn(p.page + 1)) }
        } else {
            startQuiz()
        }
    }

    fun previous() {
        val p = _state.value.phase as? LessonPhase.Learn ?: return
        if (p.page > 0) _state.update { it.copy(phase = LessonPhase.Learn(p.page - 1)) }
    }

    fun jumpTo(page: Int) {
        _state.update { it.copy(phase = LessonPhase.Learn(page.coerceIn(0, (it.items.size - 1).coerceAtLeast(0)))) }
    }

    private fun startQuiz() {
        val prompts = _state.value.items.flatMap { item ->
            when (item) {
                is LessonItem.Component -> listOf(QuizPrompt(item, PromptKind.MEANING))
                is LessonItem.Kanji -> listOf(QuizPrompt(item, PromptKind.MEANING), QuizPrompt(item, PromptKind.READING))
                is LessonItem.Vocab -> listOf(QuizPrompt(item, PromptKind.MEANING), QuizPrompt(item, PromptKind.READING))
            }
        }.shuffled()
        _state.update { it.copy(phase = LessonPhase.Quiz(prompts, Feedback.NONE, null, 0)) }
    }

    fun submit(answer: String) {
        val q = _state.value.phase as? LessonPhase.Quiz ?: return
        if (q.feedback == Feedback.CORRECT || q.feedback == Feedback.INCORRECT) return
        val prompt = q.queue.first()
        val verdict = check(prompt, answer)
        when (verdict) {
            AnswerChecker.Verdict.CORRECT -> _state.update { it.copy(phase = q.copy(feedback = Feedback.CORRECT)) }
            AnswerChecker.Verdict.WRONG_READING_TYPE -> _state.update { it.copy(phase = q.copy(feedback = Feedback.SHAKE)) }
            AnswerChecker.Verdict.INCORRECT -> _state.update { it.copy(phase = q.copy(feedback = Feedback.INCORRECT, correctAnswer = answerFor(prompt), misses = q.misses + 1)) }
        }
    }

    fun advance() {
        val q = _state.value.phase as? LessonPhase.Quiz ?: return
        val prompt = q.queue.first()
        val rest = q.queue.drop(1) + if (q.feedback == Feedback.INCORRECT) listOf(prompt) else emptyList()
        if (rest.isEmpty()) {
            viewModelScope.launch {
                repo.completeLessons(_state.value.items.map { it.key })
                _state.update { it.copy(phase = LessonPhase.Done(repo.lessonsRemaining())) }
            }
        } else {
            _state.update { it.copy(phase = LessonPhase.Quiz(rest, Feedback.NONE, null, q.misses)) }
        }
    }

    private fun check(p: QuizPrompt, answer: String): AnswerChecker.Verdict = when (val item = p.item) {
        is LessonItem.Component -> AnswerChecker.checkMeaning(answer, listOf(item.info.name) + item.info.meaning.split(",").map { it.trim() })
        is LessonItem.Kanji -> if (p.kind == PromptKind.MEANING) AnswerChecker.checkMeaning(answer, item.info.meanings.map { it.text })
        else AnswerChecker.checkReading(answer, item.info.askedReadings, item.info.otherReadings)
        is LessonItem.Vocab -> if (p.kind == PromptKind.MEANING) AnswerChecker.checkMeaning(answer, item.info.meanings)
        else AnswerChecker.checkReading(answer, item.info.readings)
    }

    private fun answerFor(p: QuizPrompt): String = when (val item = p.item) {
        is LessonItem.Component -> item.info.name
        is LessonItem.Kanji -> if (p.kind == PromptKind.MEANING) item.info.primaryMeaning else item.info.askedReadings.joinToString(", ")
        is LessonItem.Vocab -> if (p.kind == PromptKind.MEANING) item.info.primaryMeaning else item.info.readings.first()
    }

    fun question(p: QuizPrompt): Question = when (val item = p.item) {
        is LessonItem.Component -> Question(ItemType.COMPONENT, item.info.glyph, item.info.strokes, p.kind)
        is LessonItem.Kanji -> Question(ItemType.KANJI, item.info.literal, item.info.strokes, p.kind)
        is LessonItem.Vocab -> Question(ItemType.VOCABULARY, item.info.word, emptyList(), p.kind)
    }
}
