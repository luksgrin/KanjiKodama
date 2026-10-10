package app.mojimori.ui.glyph

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.ui.unit.dp
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asComposePath
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.core.graphics.PathParser

private const val KANJIVG_SIZE = 109f

/**
 * Draws KanjiVG stroke paths. [visibleStrokes] limits how many strokes are drawn (for
 * step-by-step display); [highlight] colours the last visible stroke.
 */
@Composable
fun StrokeCanvas(
    strokes: List<String>,
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.onSurface,
    highlight: Color = MaterialTheme.colorScheme.primary,
    visibleStrokes: Int = strokes.size,
    strokeWidth: Float = 5f,
) {
    val paths = remember(strokes) {
        strokes.map { d -> runCatching { PathParser.createPathFromPathData(d).asComposePath() }.getOrElse { Path() } }
    }
    Canvas(modifier.aspectRatio(1f)) {
        val scale = size.minDimension / KANJIVG_SIZE
        // the scale() block also scales the stroke width, so pass it unscaled
        val style = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round)
        scale(scale, pivot = androidx.compose.ui.geometry.Offset.Zero) {
            paths.take(visibleStrokes).forEachIndexed { i, p ->
                drawPath(p, if (i == visibleStrokes - 1 && visibleStrokes < paths.size) highlight else color, style = style)
            }
        }
    }
}

/** A glyph as text when it has a code point, otherwise its strokes (synthetic components). */
@Composable
fun Glyph(glyph: String, strokes: List<String>, modifier: Modifier = Modifier, fontSize: androidx.compose.ui.unit.TextUnit = androidx.compose.ui.unit.TextUnit.Unspecified) {
    if (glyph.isNotEmpty()) {
        app.mojimori.ui.text.KanjiText(text = glyph, modifier = modifier, fontSize = fontSize)
    } else {
        StrokeCanvas(strokes, modifier.sizeIn(maxWidth = 160.dp, maxHeight = 160.dp))
    }
}
