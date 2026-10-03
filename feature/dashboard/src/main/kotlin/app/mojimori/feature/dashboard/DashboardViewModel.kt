package app.mojimori.feature.dashboard

import androidx.lifecycle.ViewModel
import app.mojimori.model.Block
import app.mojimori.model.Level
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

data class DashboardState(
    val level: Level = Level(1, Block.N5),
    val lessonsAvailable: Int = 0,
    val reviewsAvailable: Int = 0,
)

/** Placeholder until progress and content repositories exist (phase 3). */
@HiltViewModel
class DashboardViewModel @Inject constructor() : ViewModel() {
    private val _state = MutableStateFlow(DashboardState())
    val state: StateFlow<DashboardState> = _state
}
