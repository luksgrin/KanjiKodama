package app.kanjikodama

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import app.kanjikodama.feature.browse.BrowseScreen
import app.kanjikodama.feature.browse.ItemScreen
import app.kanjikodama.feature.browse.LevelScreen
import app.kanjikodama.feature.browse.SeriesScreen
import app.kanjikodama.feature.dashboard.DashboardScreen
import app.kanjikodama.feature.lessons.LessonsScreen
import app.kanjikodama.feature.practice.PracticeSessionScreen
import app.kanjikodama.feature.practice.PracticeSetupScreen
import app.kanjikodama.feature.reviews.ReviewsScreen
import kotlinx.serialization.Serializable

@Serializable object DashboardRoute
@Serializable object LessonsRoute
@Serializable object ReviewsRoute
@Serializable object PracticeSetupRoute
@Serializable data class PracticeSessionRoute(val length: Int)
@Serializable object BrowseRoute
@Serializable data class LevelRoute(val level: Int)
@Serializable data class ItemRoute(val type: String, val key: String)
@Serializable data class SeriesRoute(val id: Int)

@Composable
fun KanjiKodamaNavHost() {
    val nav = rememberNavController()
    val openItem: (String, String) -> Unit = { type, key -> nav.navigate(ItemRoute(type, key)) }
    val toDashboard: () -> Unit = { nav.popBackStack(DashboardRoute, inclusive = false) }
    NavHost(navController = nav, startDestination = DashboardRoute) {
        composable<DashboardRoute> {
            DashboardScreen(
                onLessons = { nav.navigate(LessonsRoute) },
                onReviews = { nav.navigate(ReviewsRoute) },
                onPractice = { nav.navigate(PracticeSetupRoute) },
                onBrowse = { nav.navigate(BrowseRoute) },
                onKanji = { openItem("KANJI", it) },
            )
        }
        composable<LessonsRoute> { LessonsScreen(onDone = toDashboard) }
        composable<ReviewsRoute> { ReviewsScreen(onDone = toDashboard, onOpenItem = openItem) }
        composable<PracticeSetupRoute> {
            PracticeSetupScreen(onStart = { nav.navigate(PracticeSessionRoute(it)) }, onBack = { nav.popBackStack() })
        }
        composable<PracticeSessionRoute> { PracticeSessionScreen(onDone = toDashboard) }
        composable<BrowseRoute> { BrowseScreen(onLevel = { nav.navigate(LevelRoute(it)) }, onBack = { nav.popBackStack() }) }
        composable<LevelRoute> { LevelScreen(onItem = openItem, onBack = { nav.popBackStack() }) }
        composable<ItemRoute> { ItemScreen(onItem = openItem, onSeries = { nav.navigate(SeriesRoute(it)) }, onBack = { nav.popBackStack() }) }
        composable<SeriesRoute> { SeriesScreen(onItem = openItem, onBack = { nav.popBackStack() }) }
    }
}
