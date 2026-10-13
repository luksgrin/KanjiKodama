package app.kanjikodama.feature.browse

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.kanjikodama.content.ComponentInfo
import app.kanjikodama.content.ComponentSummary
import app.kanjikodama.content.KanjiInfo
import app.kanjikodama.content.KanjiSummary
import app.kanjikodama.content.LevelInfo
import app.kanjikodama.content.SeriesInfo
import app.kanjikodama.content.VocabInfo
import app.kanjikodama.content.VocabSummary
import app.kanjikodama.model.Assignment
import app.kanjikodama.model.ItemKey
import app.kanjikodama.model.ItemType
import app.kanjikodama.study.StudyRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class BrowseState(val levels: List<LevelInfo> = emptyList(), val openLevel: Int = 1, val passedPerLevel: Map<Int, Int> = emptyMap(), val kanjiPerLevel: Map<Int, Int> = emptyMap())

@HiltViewModel
class BrowseViewModel @Inject constructor(private val repo: StudyRepository) : ViewModel() {
    private val levels = MutableStateFlow<List<LevelInfo>>(emptyList())

    init {
        viewModelScope.launch { levels.value = repo.content.levels() }
    }

    val state: StateFlow<BrowseState> = combine(levels, repo.assignments) { lv, assignments ->
        val cur = repo.curriculum()
        val open = app.kanjikodama.srs.UnlockEngine(cur, repo.srsSettings()).highestOpenLevel(assignments)
        val passed = assignments.values.filter { it.key.type == ItemType.KANJI && it.isPassed }.groupingBy { cur.kanji[it.key.key]?.level ?: 0 }.eachCount()
        BrowseState(lv, open, passed, cur.kanji.values.groupingBy { it.level }.eachCount())
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), BrowseState())
}

data class LevelState(
    val level: Int,
    val kanji: List<KanjiSummary> = emptyList(),
    val components: List<ComponentSummary> = emptyList(),
    val vocab: List<VocabSummary> = emptyList(),
    val assignments: Map<ItemKey, Assignment> = emptyMap(),
)

@HiltViewModel
class LevelViewModel @Inject constructor(private val repo: StudyRepository, savedState: SavedStateHandle) : ViewModel() {
    private val level: Int = savedState.get<Int>("level") ?: 1
    private val content = MutableStateFlow(LevelState(level))

    init {
        viewModelScope.launch {
            content.value = LevelState(level, repo.content.kanjiAtLevel(level), repo.content.componentsAtLevel(level), repo.content.vocabAtLevel(level))
        }
    }

    val state: StateFlow<LevelState> = combine(content, repo.assignments) { c, a -> c.copy(assignments = a) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LevelState(level))
}

sealed interface ItemDetail {
    data class Kanji(val info: KanjiInfo, val components: Map<String, ComponentSummary>, val series: SeriesInfo?, val vocab: List<VocabSummary>) : ItemDetail
    data class Component(val info: ComponentInfo, val usedIn: List<KanjiSummary>) : ItemDetail
    data class Vocab(val info: VocabInfo, val kanji: Map<String, KanjiSummary>) : ItemDetail
    data object Missing : ItemDetail
}

data class ItemState(val detail: ItemDetail? = null, val assignment: Assignment? = null, val synonyms: List<String> = emptyList())

@HiltViewModel
class ItemViewModel @Inject constructor(private val repo: StudyRepository, savedState: SavedStateHandle) : ViewModel() {
    private val key = ItemKey(ItemType.valueOf(savedState.get<String>("type") ?: "KANJI"), savedState.get<String>("key") ?: "")
    private val detail = MutableStateFlow<ItemDetail?>(null)

    init {
        viewModelScope.launch {
            detail.value = when (key.type) {
                ItemType.KANJI -> repo.content.kanji(key.key)?.let { k ->
                    ItemDetail.Kanji(k, repo.content.componentSummaries(k.components.map { it.slug }), k.seriesId?.let { repo.content.series(it) }, repo.content.vocabUsingKanji(k.literal))
                }
                ItemType.COMPONENT -> repo.content.component(key.key)?.let { ItemDetail.Component(it, repo.content.kanjiUsingComponent(it.slug)) }
                ItemType.VOCABULARY -> key.key.toLongOrNull()?.let { repo.content.vocab(it) }?.let { v -> ItemDetail.Vocab(v, repo.content.kanjiSummaries(v.kanji)) }
            } ?: ItemDetail.Missing
        }
    }

    val state: StateFlow<ItemState> = combine(detail, repo.assignments) { d, a -> ItemState(d, a[key]) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ItemState())
}

data class SeriesState(val series: SeriesInfo? = null, val summaries: Map<String, KanjiSummary> = emptyMap(), val assignments: Map<ItemKey, Assignment> = emptyMap())

@HiltViewModel
class SeriesViewModel @Inject constructor(private val repo: StudyRepository, savedState: SavedStateHandle) : ViewModel() {
    private val id: Int = savedState.get<Int>("id") ?: 0
    private val content = MutableStateFlow(SeriesState())

    init {
        viewModelScope.launch {
            val s = repo.content.series(id)
            content.value = SeriesState(s, s?.let { repo.content.kanjiSummaries(it.members.map { m -> m.literal }) } ?: emptyMap())
        }
    }

    val state: StateFlow<SeriesState> = combine(content, repo.assignments) { c, a -> c.copy(assignments = a) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SeriesState())
}
