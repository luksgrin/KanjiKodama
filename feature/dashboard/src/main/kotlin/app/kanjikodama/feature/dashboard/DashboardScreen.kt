package app.kanjikodama.feature.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.kanjikodama.model.EpochMillis
import app.kanjikodama.ui.srs.SrsColors
import app.kanjikodama.ui.text.KanjiText
import java.text.DateFormat
import java.util.Date

@Composable
fun DashboardScreen(
    onLessons: () -> Unit,
    onReviews: () -> Unit,
    onPractice: () -> Unit,
    onBrowse: () -> Unit,
    onKanji: (String) -> Unit,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    DashboardContent(state, onLessons, onReviews, onPractice, onBrowse, onKanji)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DashboardContent(
    state: DashboardState,
    onLessons: () -> Unit,
    onReviews: () -> Unit,
    onPractice: () -> Unit,
    onBrowse: () -> Unit,
    onKanji: (String) -> Unit,
) {
    val snap = state.snapshot
    Scaffold { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            KanjiText(text = "漢字木霊", fontSize = 40.sp, style = MaterialTheme.typography.displaySmall)
            if (snap == null) {
                Text("Loading…")
                return@Column
            }
            Text("Level ${snap.level} · ${snap.block.label} ${snap.block.nickname}", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                CountCard("Lessons", snap.lessonsAvailable, Modifier.weight(1f), enabled = snap.lessonsAvailable > 0, onClick = onLessons)
                CountCard("Reviews", snap.reviewsAvailable, Modifier.weight(1f), enabled = snap.reviewsAvailable > 0, onClick = onReviews)
            }
            val nextAt = snap.nextReviewAt
            Text(
                when {
                    snap.reviewsAvailable > 0 -> "Reviews are waiting."
                    nextAt != null -> "Next review ${formatTime(nextAt)}"
                    else -> "No reviews scheduled yet. Do some lessons!"
                },
                style = MaterialTheme.typography.bodyMedium,
            )
            Forecast(snap.forecast24h)

            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Level ${snap.level} progress", style = MaterialTheme.typography.labelLarge)
                    LinearProgressIndicator(progress = { snap.levelProgress.share.toFloat() }, modifier = Modifier.fillMaxWidth())
                    Text("${snap.levelProgress.passed} of ${snap.levelProgress.total} kanji at Guru or above · level up at 90 %")
                }
            }
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${snap.block.label} block clear", style = MaterialTheme.typography.labelLarge)
                    LinearProgressIndicator(progress = { snap.blockProgress.share.toFloat() }, modifier = Modifier.fillMaxWidth())
                    Text("${snap.blockProgress.passed} of ${snap.blockProgress.total} kanji passed. The next block opens when every ${snap.block.label} kanji has passed.")
                    if (state.holding.isNotEmpty()) {
                        Text("Still to pass:", style = MaterialTheme.typography.labelMedium)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            state.holding.forEach { k ->
                                Box(
                                    Modifier.clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surfaceVariant).clickable { onKanji(k.literal) }.padding(horizontal = 8.dp, vertical = 4.dp),
                                ) { KanjiText(k.literal, fontSize = 20.sp) }
                            }
                        }
                    }
                }
            }
            StageRow(snap.stageCounts.apprentice, snap.stageCounts.guru, snap.stageCounts.master, snap.stageCounts.enlightened, snap.stageCounts.burned)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = onPractice, enabled = snap.stageCounts.let { it.apprentice + it.guru + it.master + it.enlightened + it.burned } > 0) { Text("Practice") }
                OutlinedButton(onClick = onBrowse) { Text("Browse") }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun CountCard(title: String, count: Int, modifier: Modifier = Modifier, enabled: Boolean, onClick: () -> Unit) {
    Card(modifier = modifier.clickable(enabled = enabled, onClick = onClick)) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Text("$count", style = MaterialTheme.typography.displayMedium)
        }
    }
}

@Composable
private fun Forecast(buckets: List<Int>) {
    val max = (buckets.maxOrNull() ?: 0).coerceAtLeast(1)
    Column {
        Text("Next 24 hours", style = MaterialTheme.typography.labelMedium)
        Row(Modifier.fillMaxWidth().height(40.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            buckets.forEach { n ->
                Box(
                    Modifier.weight(1f).height((4 + 36 * n / max).dp).clip(RoundedCornerShape(2.dp))
                        .background(if (n == 0) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primary),
                )
            }
        }
        Text("${buckets.sum()} reviews coming up", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun StageRow(apprentice: Int, guru: Int, master: Int, enlightened: Int, burned: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        StageCell("Apprentice", apprentice, SrsColors.Apprentice, Modifier.weight(1f))
        StageCell("Guru", guru, SrsColors.Guru, Modifier.weight(1f))
        StageCell("Master", master, SrsColors.Master, Modifier.weight(1f))
        StageCell("Enlightened", enlightened, SrsColors.Enlightened, Modifier.weight(1f))
        StageCell("Burned", burned, SrsColors.Burned, Modifier.weight(1f))
    }
}

@Composable
private fun StageCell(label: String, count: Int, color: Color, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(8.dp)).background(color).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("$count", color = Color.White, style = MaterialTheme.typography.titleLarge)
        Text(label, color = Color.White, style = MaterialTheme.typography.labelSmall, maxLines = 1)
    }
}

private fun formatTime(t: EpochMillis): String {
    val now = System.currentTimeMillis()
    val diff = t - now
    return when {
        diff < 60 * 60_000L -> "in ${(diff / 60_000L).coerceAtLeast(1)} min"
        diff < 24 * 60 * 60_000L -> "at " + DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(t))
        else -> "on " + DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(t))
    }
}
