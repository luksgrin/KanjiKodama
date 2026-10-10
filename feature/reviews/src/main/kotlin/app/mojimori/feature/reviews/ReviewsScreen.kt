package app.mojimori.feature.reviews

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import app.mojimori.ui.question.Feedback
import app.mojimori.ui.question.QuestionCard
import app.mojimori.ui.srs.SrsColors
import app.mojimori.ui.text.KanjiText

@Composable
fun ReviewsScreen(onDone: () -> Unit, onOpenItem: (type: String, key: String) -> Unit, viewModel: ReviewsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                state.loading -> Text("Loading reviews…", Modifier.padding(24.dp))
                state.finished -> Summary(state, onDone, onOpenItem)
                else -> {
                    val prompt = state.current!!
                    Column {
                        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${state.completed.size} / ${state.total} done", style = MaterialTheme.typography.labelLarge)
                            TextButton(onClick = viewModel::wrapUp) { Text("Wrap up") }
                        }
                        state.lastStageChange?.let { (before, after) ->
                            StageChangeBanner(before, after)
                        }
                        QuestionCard(
                            question = viewModel.question(prompt),
                            feedback = state.feedback,
                            correctAnswer = state.correctAnswer,
                            onSubmit = viewModel::submit,
                            onNext = viewModel::advance,
                        ) {
                            if (state.feedback == Feedback.INCORRECT) {
                                Card(Modifier.padding(horizontal = 24.dp)) {
                                    Column(Modifier.padding(12.dp)) {
                                        Text(prompt.item.content.summary, style = MaterialTheme.typography.bodyMedium)
                                        TextButton(onClick = { onOpenItem(prompt.item.content.type.name, prompt.item.content.key.key) }) { Text("Open item") }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StageChangeBanner(before: Int, after: Int) {
    val up = after > before
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(8.dp)).background(SrsColors.forStage(after)).padding(8.dp),
        horizontalArrangement = Arrangement.Center,
    ) {
        Text("${if (up) "↑" else "↓"} ${SrsColors.label(after)}", color = Color.White)
    }
}

@Composable
private fun Summary(state: ReviewsState, onDone: () -> Unit, onOpenItem: (String, String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Session summary", style = MaterialTheme.typography.headlineSmall)
            Text("${state.correctCount} of ${state.completed.size} items fully correct")
        }
        state.clearedBlock?.let { block ->
            item {
                Card(colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("${block.label} cleared! 🌳", style = MaterialTheme.typography.titleLarge)
                        Text("Every ${block.label} kanji has reached Guru. ${block.next?.let { "Welcome to ${it.label} ${it.nickname}." } ?: ""}")
                    }
                }
            }
        }
        state.newLevel?.let { lvl ->
            item {
                Card(colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Level up! Level $lvl", style = MaterialTheme.typography.titleLarge)
                        Text("New components and kanji are waiting in your lessons.")
                    }
                }
            }
        }
        items(state.completed) { c ->
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                KanjiText(c.content.glyph, fontSize = 24.sp)
                Spacer(Modifier.height(1.dp))
                Text(c.content.shortLabel, Modifier.weight(1f).padding(horizontal = 8.dp), maxLines = 2, style = MaterialTheme.typography.bodySmall)
                Box(Modifier.clip(RoundedCornerShape(6.dp)).background(SrsColors.forStage(c.stageAfter)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                    Text("${SrsColors.label(c.stageBefore)} → ${SrsColors.label(c.stageAfter)}", color = Color.White, style = MaterialTheme.typography.labelSmall)
                }
                TextButton(onClick = { onOpenItem(c.content.type.name, c.content.key.key) }) { Text("Open") }
            }
        }
        item { Button(onClick = onDone, Modifier.padding(top = 12.dp)) { Text("Dashboard") } }
    }
}
