package app.kanjikodama.feature.practice

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.kanjikodama.ui.question.QuestionCard

@Composable
fun PracticeSetupScreen(onStart: (length: Int) -> Unit, onBack: () -> Unit) {
    var length by remember { mutableIntStateOf(20) }
    Scaffold { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("Practice", style = MaterialTheme.typography.headlineSmall)
            Text("Everything you have learned, weighted toward your current block, with surprise refreshers from earlier blocks. Practice never changes your SRS stages.")
            Text("Session length", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(10, 20, 50, 0).forEach { n ->
                    FilterChip(selected = length == n, onClick = { length = n }, label = { Text(if (n == 0) "Endless" else "$n") })
                }
            }
            Text("Scope: kanji (meaning + reading). Vocabulary and components arrive in a later version.", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(onClick = { onStart(length) }) { Text("Start") }
                TextButton(onClick = onBack) { Text("Back") }
            }
        }
    }
}

@Composable
fun PracticeSessionScreen(onDone: () -> Unit, viewModel: PracticeViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when {
                state.loading -> Text("Preparing practice…", Modifier.padding(24.dp))
                state.finished || state.current == null -> Summary(state, onDone)
                else -> {
                    val item = state.current!!
                    Column {
                        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(if (state.endless) "${state.asked} answered" else "${state.asked} / ${state.length}", style = MaterialTheme.typography.labelLarge)
                            TextButton(onClick = viewModel::stop) { Text("Stop") }
                        }
                        QuestionCard(
                            question = viewModel.question(item, state.kind),
                            feedback = state.feedback,
                            correctAnswer = state.correctAnswer,
                            onSubmit = viewModel::submit,
                            onNext = viewModel::advance,
                        )
                        state.offerResurrect?.let { key ->
                            Card(Modifier.padding(24.dp)) {
                                Column(Modifier.padding(12.dp)) {
                                    Text("This item was Burned. Bring it back into reviews?")
                                    Button(onClick = { viewModel.resurrect(key) }) { Text("Resurrect") }
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
private fun Summary(state: PracticeState, onDone: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Practice summary", style = MaterialTheme.typography.headlineSmall)
        if (state.results.isEmpty()) Text("Nothing to practise yet. Learn a few kanji first.")
        state.byBlock().forEach { r ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${r.block.label} ${r.block.nickname}")
                Text("${r.correct} / ${r.asked} · ${if (r.asked > 0) r.correct * 100 / r.asked else 0} %")
            }
        }
        Button(onClick = onDone) { Text("Dashboard") }
    }
}
