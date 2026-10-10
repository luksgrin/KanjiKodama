package app.mojimori.ui.question

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.mojimori.model.ItemType
import app.mojimori.srs.KanaConverter
import app.mojimori.ui.glyph.Glyph
import app.mojimori.ui.srs.SrsColors

enum class PromptKind { MEANING, READING }

/** One prompt: what to show, what to ask. The caller owns answer checking. */
data class Question(
    val itemType: ItemType,
    val glyph: String,
    val strokes: List<String> = emptyList(),
    val kind: PromptKind,
    val tag: String? = null,
)

enum class Feedback { NONE, CORRECT, INCORRECT, SHAKE }

/**
 * Shared prompt UI for reviews and practice. Reading prompts convert romaji to kana live.
 * After [feedback] is CORRECT or INCORRECT, the button becomes "Next".
 */
@Composable
fun QuestionCard(
    question: Question,
    feedback: Feedback,
    correctAnswer: String?,
    onSubmit: (String) -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier,
    extra: @Composable () -> Unit = {},
) {
    var field by remember(question) { mutableStateOf(TextFieldValue("")) }
    val text = field.text
    val focus = remember { FocusRequester() }
    LaunchedEffect(question) { focus.requestFocus() }
    val tint = when (question.itemType) {
        ItemType.KANJI -> SrsColors.KanjiTint
        ItemType.VOCABULARY -> SrsColors.VocabTint
        ItemType.COMPONENT -> SrsColors.ComponentTint
    }
    val fieldColor by animateColorAsState(
        when (feedback) {
            Feedback.CORRECT -> Color(0xFF2E7D32)
            Feedback.INCORRECT -> Color(0xFFC62828)
            else -> MaterialTheme.colorScheme.surface
        },
        label = "feedback",
    )
    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Column(
            Modifier.fillMaxWidth().background(tint).padding(vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            question.tag?.let { AssistChip(onClick = {}, label = { Text(it) }) }
            Glyph(
                question.glyph,
                question.strokes,
                Modifier.padding(8.dp).then(if (question.glyph.isEmpty()) Modifier.size(140.dp) else Modifier),
                fontSize = if (question.glyph.length > 2) 48.sp else 96.sp,
            )
        }
        Text(
            text = "${question.itemType.name.lowercase().replaceFirstChar { it.uppercase() }} ${if (question.kind == PromptKind.MEANING) "Meaning" else "Reading"}",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(top = 16.dp),
        )
        val finished = feedback == Feedback.CORRECT || feedback == Feedback.INCORRECT
        OutlinedTextField(
            value = field,
            onValueChange = { raw ->
                if (!finished) {
                    field = if (question.kind == PromptKind.READING) {
                        // Rewriting the text invalidates the IME's composing region; drop it and
                        // move the cursor to the end, or keyboards re-commit the old romaji.
                        val converted = KanaConverter.toHiraganaLive(raw.text)
                        if (converted == raw.text) raw else TextFieldValue(converted, TextRange(converted.length))
                    } else raw
                }
            },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp).focusRequester(focus).background(fieldColor),
            singleLine = true,
            readOnly = finished,
            placeholder = { Text(if (question.kind == PromptKind.READING) "答え" else "Your answer") },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Ascii,
                capitalization = KeyboardCapitalization.None,
                autoCorrectEnabled = false,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { if (finished) onNext() else onSubmit(submitted(question, text)) }),
            isError = feedback == Feedback.SHAKE,
            supportingText = when (feedback) {
                Feedback.SHAKE -> ({ Text("That is the other reading. Give the ${if (question.kind == PromptKind.READING) "asked" else ""} one.") })
                Feedback.INCORRECT -> ({ Text("Answer: ${correctAnswer ?: ""}") })
                else -> null
            },
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp), horizontalArrangement = Arrangement.End) {
            Button(onClick = { if (finished) onNext() else onSubmit(submitted(question, text)) }) {
                Text(if (finished) "Next" else "Check")
            }
        }
        Spacer(Modifier.height(8.dp))
        if (finished) extra()
    }
}

/** Final form of an answer: readings get their trailing "n" resolved to ん. */
private fun submitted(question: Question, text: String): String =
    if (question.kind == PromptKind.READING) KanaConverter.toHiragana(text) else text
