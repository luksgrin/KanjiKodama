package app.kanjikodama.ui.text

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.TextUnit

/**
 * Text tagged with the Japanese locale so Android renders Japanese glyph forms
 * (e.g. 直, 骨, 海) instead of Chinese variants from the shared CJK font.
 */
@Composable
fun KanjiText(
    text: String,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    fontSize: TextUnit = style.fontSize,
) {
    Text(
        text = text,
        modifier = modifier,
        style = style.copy(fontSize = fontSize, localeList = LocaleList("ja-JP")),
    )
}
