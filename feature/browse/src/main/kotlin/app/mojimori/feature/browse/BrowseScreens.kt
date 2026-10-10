package app.mojimori.feature.browse

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.mojimori.content.KanjiInfo
import app.mojimori.content.LevelInfo
import app.mojimori.model.Assignment
import app.mojimori.model.Block
import app.mojimori.model.ItemKey
import app.mojimori.ui.glyph.Glyph
import app.mojimori.ui.glyph.StrokeCanvas
import app.mojimori.ui.srs.SrsColors
import app.mojimori.ui.text.KanjiText

// ------------------------------------------------------------------ blocks and levels

@Composable
fun BrowseScreen(onLevel: (Int) -> Unit, onBack: () -> Unit, viewModel: BrowseViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { TextButton(onClick = onBack) { Text("← Dashboard") } }
            Block.entries.forEach { block ->
                val levels = state.levels.filter { it.block == block }
                if (levels.isEmpty()) return@forEach
                item {
                    Text("${block.label} · ${block.nickname}", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 12.dp))
                    Text("Levels ${levels.first().number}–${levels.last().number}", style = MaterialTheme.typography.bodySmall)
                }
                items(levels) { lv -> LevelRow(lv, lv.number <= state.openLevel, state.passedPerLevel[lv.number] ?: 0, state.kanjiPerLevel[lv.number] ?: 0, onLevel) }
            }
        }
    }
}

@Composable
private fun LevelRow(lv: LevelInfo, open: Boolean, passed: Int, total: Int, onLevel: (Int) -> Unit) {
    Card(Modifier.fillMaxWidth().clickable { onLevel(lv.number) }, colors = CardDefaults.cardColors(containerColor = if (open) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.surface)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Level ${lv.number}", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            Text(if (open) "$passed / $total passed" else "locked", style = MaterialTheme.typography.bodySmall)
        }
        if (total > 0) LinearProgressIndicator(progress = { passed.toFloat() / total }, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(bottom = 8.dp))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LevelScreen(onItem: (type: String, key: String) -> Unit, onBack: () -> Unit, viewModel: LevelViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            TextButton(onClick = onBack) { Text("← Levels") }
            Text("Level ${state.level}", style = MaterialTheme.typography.headlineSmall)
            Text("Components (${state.components.size})", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.components.forEach { c ->
                    Tile(stage = state.assignments[ItemKey.component(c.slug)]?.stage, onClick = { onItem("COMPONENT", c.slug) }) {
                        Glyph(c.glyph, c.strokes, Modifier.size(40.dp), fontSize = 30.sp)
                        Text(c.name, style = MaterialTheme.typography.labelSmall, color = Color.White, maxLines = 1)
                    }
                }
            }
            Text("Kanji (${state.kanji.size})", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.kanji.forEach { k ->
                    Tile(stage = state.assignments[ItemKey.kanji(k.literal)]?.stage, onClick = { onItem("KANJI", k.literal) }) {
                        KanjiText(k.literal, fontSize = 30.sp, style = MaterialTheme.typography.headlineSmall.copy(color = Color.White))
                        Text(k.primaryMeaning, style = MaterialTheme.typography.labelSmall, color = Color.White, maxLines = 1)
                    }
                }
            }
            Text("Vocabulary (${state.vocab.size})", style = MaterialTheme.typography.titleMedium)
            state.vocab.forEach { v ->
                Row(Modifier.fillMaxWidth().clickable { onItem("VOCABULARY", v.id.toString()) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    StageDot(state.assignments[ItemKey.vocab(v.id)]?.stage)
                    KanjiText(v.word, fontSize = 20.sp, modifier = Modifier.padding(horizontal = 8.dp))
                    Text("${v.primaryReading} · ${v.primaryMeaning}", style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Tile(stage: Int?, onClick: () -> Unit, content: @Composable () -> Unit) {
    Column(
        Modifier.clip(RoundedCornerShape(8.dp)).background(stage?.let { SrsColors.forStage(it) } ?: SrsColors.Locked).clickable(onClick = onClick).padding(8.dp).size(width = 72.dp, height = 68.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) { content() }
}

@Composable
private fun StageDot(stage: Int?) {
    Box(Modifier.size(12.dp).clip(RoundedCornerShape(6.dp)).background(stage?.let { SrsColors.forStage(it) } ?: SrsColors.Locked))
}

// ------------------------------------------------------------------ item detail

@Composable
fun ItemScreen(onItem: (type: String, key: String) -> Unit, onSeries: (Int) -> Unit, onBack: () -> Unit, viewModel: ItemViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            TextButton(onClick = onBack, Modifier.padding(horizontal = 8.dp)) { Text("← Back") }
            when (val d = state.detail) {
                null -> Text("Loading…", Modifier.padding(24.dp))
                ItemDetail.Missing -> Text("This item is not in the current content.", Modifier.padding(24.dp))
                is ItemDetail.Kanji -> KanjiDetail(d, state.assignment, onItem, onSeries)
                is ItemDetail.Component -> ComponentDetail(d, state.assignment, onItem)
                is ItemDetail.Vocab -> VocabDetail(d, state.assignment, onItem)
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun SrsBadge(a: Assignment?) {
    val stage = a?.stage
    Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.clip(RoundedCornerShape(6.dp)).background(stage?.let { SrsColors.forStage(it) } ?: SrsColors.Locked).padding(horizontal = 10.dp, vertical = 4.dp)) {
            Text(stage?.let { SrsColors.label(it) } ?: "Locked", color = Color.White, style = MaterialTheme.typography.labelMedium)
        }
        val nextAt = a?.availableAt
        if (a != null && nextAt != null && !a.isBurned && a.isStarted) {
            Text("  next review ${java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT, java.text.DateFormat.SHORT).format(java.util.Date(nextAt))}", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun Header(glyph: String, strokes: List<String>, tint: Color, subtitle: String) {
    Column(Modifier.fillMaxWidth().background(tint).padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Glyph(glyph, strokes, Modifier.size(if (glyph.isEmpty()) 100.dp else 130.dp), fontSize = if (glyph.length > 2) 40.sp else 88.sp)
        Text(subtitle, color = Color.White, style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
        Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(4.dp))
        content()
    }
}

@Composable
private fun StrokeOrder(strokes: List<String>) {
    if (strokes.isEmpty()) return
    var visible by remember(strokes) { mutableIntStateOf(strokes.size) }
    Section("Stroke order · ${strokes.size} strokes") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StrokeCanvas(strokes, Modifier.size(140.dp), visibleStrokes = visible)
            Column(Modifier.padding(start = 16.dp).weight(1f)) {
                Slider(value = visible.toFloat(), onValueChange = { visible = it.toInt() }, valueRange = 0f..strokes.size.toFloat(), steps = (strokes.size - 1).coerceAtLeast(0))
                Text("Stroke $visible of ${strokes.size}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun KanjiDetail(d: ItemDetail.Kanji, a: Assignment?, onItem: (String, String) -> Unit, onSeries: (Int) -> Unit) {
    val k: KanjiInfo = d.info
    Header(k.literal, k.strokes, SrsColors.KanjiTint, "Kanji · Level ${k.level} · ${k.block.label}")
    SrsBadge(a)
    Section("Meanings") { Text(k.meanings.joinToString(", ") { it.text }, style = MaterialTheme.typography.bodyLarge) }
    Section("Readings") {
        if (k.onReadings.isNotEmpty()) Text("On'yomi: ${k.onReadings.joinToString("、")}${if (k.askedReadingType == "on") "  (asked)" else ""}")
        if (k.kunReadings.isNotEmpty()) Text("Kun'yomi: ${k.kunReadings.joinToString("、")}${if (k.askedReadingType == "kun") "  (asked)" else ""}")
    }
    Section("Structure") {
        if (k.components.isEmpty()) Text("Atomic: this kanji is its own component.")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            k.components.forEach { use ->
                val cs = d.components[use.slug]
                Card(Modifier.clickable { onItem("COMPONENT", use.slug) }) {
                    Column(Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Glyph(cs?.glyph ?: use.slug, cs?.strokes ?: emptyList(), Modifier.size(44.dp), fontSize = 32.sp)
                        Text(cs?.name ?: use.slug, style = MaterialTheme.typography.labelSmall)
                        Text(when (use.role) { "semantic" -> "meaning"; "phonetic" -> "sound"; "both" -> "meaning + sound"; else -> "shape" } + (use.position?.let { " · $it" } ?: ""), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
    d.series?.let { s ->
        Section("Phonetic series") {
            Card(Modifier.clickable { onSeries(s.id) }) {
                Column(Modifier.padding(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        KanjiText(s.component, fontSize = 32.sp)
                        Text("  → ${s.reading} · ${(s.reliability * 100).toInt()} % of ${s.totalMembers} kanji", style = MaterialTheme.typography.bodyLarge)
                    }
                    Text(
                        when (k.seriesMatch) { "exact" -> "${k.literal} follows the rule."; "variant" -> "${k.literal} is a regular variant."; else -> "${k.literal} is an exception." },
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
    Section("Meaning mnemonic") { Text(k.meaningMnemonic) }
    Section("Reading mnemonic") { Text(k.readingMnemonic) }
    StrokeOrder(k.strokes)
    if (d.vocab.isNotEmpty()) Section("Vocabulary using ${k.literal} (${d.vocab.size})") {
        d.vocab.forEach { v ->
            Row(Modifier.fillMaxWidth().clickable { onItem("VOCABULARY", v.id.toString()) }.padding(vertical = 4.dp)) {
                KanjiText(v.word, fontSize = 20.sp)
                Text("  ${v.primaryReading} · ${v.primaryMeaning} · L${v.level}", Modifier.align(Alignment.CenterVertically), maxLines = 1)
            }
        }
    }
    k.oldFormOf?.let { Section("Old form of") { KanjiText(it, fontSize = 32.sp, modifier = Modifier.clickable { onItem("KANJI", it) }) } }
    Section("Facts") { Text(listOfNotNull(k.grade?.let { "grade $it" }, k.freq?.let { "frequency rank $it" }, k.strokeCount?.let { "$it strokes" }, "category ${k.category}").joinToString(" · ")) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ComponentDetail(d: ItemDetail.Component, a: Assignment?, onItem: (String, String) -> Unit) {
    val c = d.info
    Header(c.glyph, c.strokes, SrsColors.ComponentTint, "Component · ${c.name}")
    SrsBadge(a)
    Section("Meaning") { Text(c.meaning, style = MaterialTheme.typography.bodyLarge) }
    Section("Role tendency") { Text(c.roleTendency + (if (c.onReadings.isNotEmpty()) " · reads ${c.onReadings.joinToString("、")}" else "")) }
    c.variantOf?.let { Section("Variant of") { KanjiText(it, fontSize = 32.sp) } }
    if (c.isKanji) Section("Also a kanji") { TextButton(onClick = { onItem("KANJI", c.slug) }) { Text("Open kanji ${c.slug}") } }
    StrokeOrder(c.strokes)
    Section("Kanji using it (${d.usedIn.size})") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            d.usedIn.forEach { k -> KanjiText(k.literal, fontSize = 30.sp, modifier = Modifier.clickable { onItem("KANJI", k.literal) }) }
        }
    }
}

@Composable
private fun VocabDetail(d: ItemDetail.Vocab, a: Assignment?, onItem: (String, String) -> Unit) {
    val v = d.info
    Header(v.word, emptyList(), SrsColors.VocabTint, "Vocabulary · Level ${v.level}")
    SrsBadge(a)
    Section("Reading") { Text(v.readings.joinToString("、"), style = MaterialTheme.typography.headlineSmall) }
    Section("Meanings") { Text(v.meanings.joinToString(", "), style = MaterialTheme.typography.bodyLarge) }
    if (v.pos.isNotBlank()) Section("Part of speech") { Text(v.pos) }
    if (d.kanji.isNotEmpty()) Section("Kanji") {
        d.kanji.values.forEach { k ->
            Row(Modifier.clickable { onItem("KANJI", k.literal) }.padding(vertical = 4.dp)) { KanjiText(k.literal, fontSize = 26.sp); Text("  ${k.primaryMeaning}${k.primaryReading?.let { " · $it" } ?: ""}", Modifier.align(Alignment.CenterVertically)) }
        }
    }
    if (v.sentences.isNotEmpty()) Section("Examples") {
        v.sentences.forEach { s -> Column(Modifier.padding(bottom = 8.dp)) { KanjiText(s.ja, fontSize = 18.sp); Text(s.en, style = MaterialTheme.typography.bodyMedium) } }
    }
}

// ------------------------------------------------------------------ series

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SeriesScreen(onItem: (type: String, key: String) -> Unit, onBack: () -> Unit, viewModel: SeriesViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
            TextButton(onClick = onBack, Modifier.padding(horizontal = 8.dp)) { Text("← Back") }
            val s = state.series
            if (s == null) {
                Text("Loading…", Modifier.padding(24.dp)); return@Column
            }
            Header(s.component, emptyList(), MaterialTheme.colorScheme.tertiary, "Phonetic series → ${s.reading}")
            Section("Reliability") {
                LinearProgressIndicator(progress = { s.reliability.toFloat() }, modifier = Modifier.fillMaxWidth())
                Text("${(s.reliability * 100).toInt()} % of the ${s.totalMembers} N5–N1 kanji with ${s.component} as phonetic read ${s.reading} or a regular variant.")
            }
            Section("Members in your content (${s.members.size})") {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    s.members.forEach { m ->
                        val stage = state.assignments[ItemKey.kanji(m.literal)]?.stage
                        Column(
                            Modifier.clip(RoundedCornerShape(8.dp)).background(
                                when (m.match) { "exact" -> Color(0xFFD8F3DC); "variant" -> Color(0xFFFFF3BF); else -> Color(0xFFFFD8D8) },
                            ).clickable { onItem("KANJI", m.literal) }.padding(8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            KanjiText(m.literal, fontSize = 30.sp, style = MaterialTheme.typography.headlineSmall.copy(color = Color.Black))
                            Text(m.actualReading, style = MaterialTheme.typography.labelSmall, color = Color.Black)
                            Text(stage?.let { SrsColors.label(it) } ?: "locked", style = MaterialTheme.typography.labelSmall, color = Color.DarkGray)
                        }
                    }
                }
                Text("green = follows the rule · yellow = regular variant · red = exception", style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}
