package app.kanjikodama.feature.lessons

import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.kanjikodama.content.KanjiInfo
import app.kanjikodama.ui.glyph.Glyph
import app.kanjikodama.ui.glyph.StrokeCanvas
import app.kanjikodama.ui.question.QuestionCard
import app.kanjikodama.ui.srs.SrsColors
import app.kanjikodama.ui.text.KanjiText

@Composable
fun LessonsScreen(onDone: () -> Unit, viewModel: LessonsViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (val phase = state.phase) {
                LessonPhase.Loading -> Text("Loading lessons…", Modifier.padding(24.dp))
                LessonPhase.Empty -> Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("No lessons available right now.", style = MaterialTheme.typography.titleMedium)
                    Text("New items unlock as their components and kanji reach Guru.")
                    Button(onClick = onDone) { Text("Back") }
                }
                is LessonPhase.Learn -> LearnPage(state, phase, viewModel)
                is LessonPhase.Quiz -> {
                    val prompt = phase.queue.first()
                    Column {
                        Text("Lesson quiz · ${phase.queue.size} left", Modifier.padding(16.dp), style = MaterialTheme.typography.labelLarge)
                        QuestionCard(
                            question = viewModel.question(prompt),
                            feedback = phase.feedback,
                            correctAnswer = phase.correctAnswer,
                            onSubmit = viewModel::submit,
                            onNext = viewModel::advance,
                        )
                    }
                }
                is LessonPhase.Done -> Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Batch complete!", style = MaterialTheme.typography.headlineSmall)
                    Text("These items are now Apprentice I. First reviews arrive in about four hours.")
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        if (phase.remaining > 0) Button(onClick = viewModel::load) { Text("More lessons (${phase.remaining})") }
                        OutlinedButton(onClick = onDone) { Text("Dashboard") }
                    }
                }
            }
        }
    }
}

@Composable
private fun LearnPage(state: LessonsState, phase: LessonPhase.Learn, vm: LessonsViewModel) {
    val item = state.items[phase.page]
    Column(Modifier.fillMaxSize()) {
        LinearProgressIndicator(progress = { (phase.page + 1f) / state.items.size }, modifier = Modifier.fillMaxWidth())
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            when (item) {
                is LessonItem.Component -> ComponentLesson(item)
                is LessonItem.Kanji -> KanjiLesson(item)
                is LessonItem.Vocab -> VocabLesson(item)
            }
        }
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            OutlinedButton(onClick = vm::previous, enabled = phase.page > 0) { Text("Back") }
            Text("${phase.page + 1} / ${state.items.size}", Modifier.align(Alignment.CenterVertically))
            Button(onClick = vm::next) { Text(if (phase.page + 1 == state.items.size) "Quiz" else "Next") }
        }
    }
}

@Composable
private fun Header(glyph: String, strokes: List<String>, tint: androidx.compose.ui.graphics.Color, subtitle: String) {
    Column(Modifier.fillMaxWidth().background(tint).padding(vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Glyph(glyph, strokes, Modifier.size(if (glyph.isEmpty()) 110.dp else 140.dp), fontSize = if (glyph.length > 2) 44.sp else 96.sp)
        Text(subtitle, color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = 20.dp, vertical = 10.dp)) {
        Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(4.dp))
        content()
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ComponentLesson(item: LessonItem.Component) {
    val c = item.info
    Header(c.glyph, c.strokes, SrsColors.ComponentTint, "Component · ${c.name}")
    Section("Meaning") { Text(c.meaning, style = MaterialTheme.typography.bodyLarge) }
    if (c.strokes.isNotEmpty()) Section("Stroke order") { StrokeCanvas(c.strokes, Modifier.size(160.dp)) }
    Section("Role") {
        Text(
            when (c.roleTendency) {
                "phonetic" -> "This component usually carries the sound${if (c.onReadings.isNotEmpty()) ": " + c.onReadings.joinToString(", ") else ""}."
                "semantic" -> "This component usually hints at the meaning."
                "both" -> "This component can carry meaning or sound depending on the kanji."
                else -> "Watch how this component behaves across the kanji that use it."
            },
        )
    }
    c.variantOf?.let { Section("Variant of") { KanjiText(it, fontSize = 28.sp) } }
    if (item.usedIn.isNotEmpty()) Section("Appears in") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { item.usedIn.forEach { KanjiText(it.literal, fontSize = 28.sp) } }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun KanjiLesson(item: LessonItem.Kanji) {
    val k = item.info
    Header(k.literal, k.strokes, SrsColors.KanjiTint, "Kanji · ${k.primaryMeaning}")
    Section("Structure") {
        if (k.components.isEmpty()) Text("A basic form. Learn its shape directly.")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            k.components.forEach { use ->
                val cs = item.components[use.slug]
                Card(colors = CardDefaults.cardColors(containerColor = roleColor(use.role))) {
                    Column(Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Glyph(cs?.glyph ?: use.slug, cs?.strokes ?: emptyList(), Modifier.size(44.dp), fontSize = 32.sp)
                        Text(cs?.name ?: use.slug, style = MaterialTheme.typography.labelSmall)
                        Text(roleLabel(use.role), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
    PredictionCard(k, item.series)
    Section("Readings") {
        if (k.onReadings.isNotEmpty()) Text("On'yomi: ${k.onReadings.joinToString("、")}${if (k.askedReadingType == "on") "  ← asked in reviews" else ""}")
        if (k.kunReadings.isNotEmpty()) Text("Kun'yomi: ${k.kunReadings.joinToString("、")}${if (k.askedReadingType == "kun") "  ← asked in reviews" else ""}")
    }
    Section("Meanings") { Text(k.meanings.joinToString(", ") { it.text }) }
    Section("Meaning mnemonic") { Text(k.meaningMnemonic) }
    Section("Reading mnemonic") { Text(k.readingMnemonic) }
    if (item.vocab.isNotEmpty()) Section("Words you will meet") {
        item.vocab.forEach { v -> Row { KanjiText(v.word, fontSize = 20.sp); Text("  ${v.primaryReading} · ${v.primaryMeaning}", Modifier.align(Alignment.CenterVertically)) } }
    }
    k.oldFormOf?.let { Section("Old form of") { KanjiText(it, fontSize = 32.sp) } }
}

@Composable
private fun PredictionCard(k: KanjiInfo, series: app.kanjikodama.content.SeriesInfo?) {
    if (series == null || k.phonetic == null) return
    val actual = k.onReadings.firstOrNull() ?: return
    Section("Sound prediction") {
        Card {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    KanjiText(series.component, fontSize = 36.sp)
                    Text("  is the phonetic part. Its series reads ${series.reading}.", style = MaterialTheme.typography.bodyLarge)
                }
                Text(
                    when (k.seriesMatch) {
                        "exact" -> "Prediction: ${series.reading}. Actual: $actual ✓  The rule holds."
                        "variant" -> "Prediction: ${series.reading}. Actual: $actual ≈  A regular variant (voicing or length)."
                        else -> "Prediction: ${series.reading}. Actual: $actual ✗  An exception: learn this one."
                    },
                )
                Text("${(series.reliability * 100).toInt()} % of the ${series.totalMembers} ${series.component}-series kanji follow the rule.", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun VocabLesson(item: LessonItem.Vocab) {
    val v = item.info
    Header(v.word, emptyList(), SrsColors.VocabTint, "Vocabulary · ${v.primaryMeaning}")
    Section("Reading") { Text(v.readings.joinToString("、"), style = MaterialTheme.typography.headlineSmall) }
    if (item.kanji.isNotEmpty()) Section("Kanji inside") {
        item.kanji.values.forEach { k -> Row { KanjiText(k.literal, fontSize = 24.sp); Text("  ${k.primaryMeaning}${k.primaryReading?.let { " · $it" } ?: ""}", Modifier.align(Alignment.CenterVertically)) } }
    }
    Section("Meanings") { Text(v.meanings.joinToString(", ")) }
    if (v.pos.isNotBlank()) Section("Part of speech") { Text(v.pos) }
    if (v.sentences.isNotEmpty()) Section("Examples") {
        v.sentences.forEach { s -> Column(Modifier.padding(bottom = 8.dp)) { KanjiText(s.ja, fontSize = 18.sp); Text(s.en, style = MaterialTheme.typography.bodyMedium) } }
    }
}

private fun roleLabel(role: String) = when (role) {
    "semantic" -> "meaning"
    "phonetic" -> "sound"
    "both" -> "meaning + sound"
    else -> "shape"
}

@Composable
private fun roleColor(role: String) = when (role) {
    "semantic" -> MaterialTheme.colorScheme.secondaryContainer
    "phonetic" -> MaterialTheme.colorScheme.tertiaryContainer
    "both" -> MaterialTheme.colorScheme.primaryContainer
    else -> MaterialTheme.colorScheme.surfaceVariant
}
