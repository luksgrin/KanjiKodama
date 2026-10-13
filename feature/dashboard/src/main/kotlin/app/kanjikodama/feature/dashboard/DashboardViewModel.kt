package app.kanjikodama.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.kanjikodama.content.KanjiSummary
import app.kanjikodama.study.DashboardSnapshot
import app.kanjikodama.study.StudyRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class DashboardState(
    val snapshot: DashboardSnapshot? = null,
    val holding: List<KanjiSummary> = emptyList(),
)

@HiltViewModel
class DashboardViewModel @Inject constructor(private val repo: StudyRepository) : ViewModel() {
    init {
        viewModelScope.launch { repo.refreshUnlocks() }
    }

    /** Ticks every minute so "reviews available" and "next review" stay current without data changes. */
    private val minuteTick = flow {
        while (true) {
            emit(Unit)
            delay(60_000)
        }
    }

    val state: StateFlow<DashboardState> = combine(repo.assignments, minuteTick) { map, _ -> build(map) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DashboardState())

    private suspend fun build(map: Map<app.kanjikodama.model.ItemKey, app.kanjikodama.model.Assignment>): DashboardState {
        val snap = repo.dashboard(map)
        val holding = repo.content.kanjiSummaries(snap.blockProgress.holding.take(60)).values.sortedBy { it.level }
        return DashboardState(snap, holding)
    }

    fun refresh() {
        viewModelScope.launch { repo.refreshUnlocks() }
    }
}
