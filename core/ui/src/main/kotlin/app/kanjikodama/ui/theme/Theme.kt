package app.kanjikodama.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val ForestGreen = Color(0xFF1B4332)
private val Moss = Color(0xFF52B788)
private val Bark = Color(0xFF6B4F3A)

private val LightColors = lightColorScheme(
    primary = ForestGreen,
    secondary = Moss,
    tertiary = Bark,
)

private val DarkColors = darkColorScheme(
    primary = Moss,
    secondary = ForestGreen,
    tertiary = Bark,
)

@Composable
fun KanjiKodamaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColors
        else -> LightColors
    }
    MaterialTheme(colorScheme = colorScheme, content = content)
}
