package app.kanjikodama.wk;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * `KkSystemUi` (src/platform/androidSystemUi.ts): what the Java app's windows do natively.
 *
 * setBarColors: the Java app's status bar has the colour of its toolbar (dark, or the subject type
 * colour in sessions and on item pages) and its navigation bar the page background. Capacitor's
 * SystemBars pads the decor view by the bar insets when the WebView can't draw behind them
 * (WebView before 140, or no viewport-fit=cover) and fills that padding with the theme's window
 * background; this paints the top padding with the colour at the top of the page and the rest with
 * the colour at its bottom, and sets the bar icon colours to match. With WebView 140+ the page
 * paints behind the bars itself and only the icon colours matter.
 *
 * setImeHints: see KkWebView.
 */
@CapacitorPlugin(name = "KkSystemUi")
public class SystemUiPlugin extends Plugin {

    /** Fills the decor view's top padding (status bar inset) with one colour, the rest with another. */
    static final class BarsDrawable extends Drawable {
        private final View owner;
        private final Paint top = new Paint();
        private final Paint bottom = new Paint();

        BarsDrawable(final View owner, final int topColor, final int bottomColor) {
            this.owner = owner;
            top.setColor(topColor);
            bottom.setColor(bottomColor);
        }

        @Override
        public void draw(@NonNull final Canvas canvas) {
            final int w = getBounds().width();
            final int h = getBounds().height();
            final int split = Math.min(owner.getPaddingTop(), h);
            if (split > 0) canvas.drawRect(0, 0, w, split, top);
            canvas.drawRect(0, split, w, h, bottom);
        }

        @Override public void setAlpha(final int alpha) { }
        @Override public void setColorFilter(@Nullable final ColorFilter colorFilter) { }
        @Override public int getOpacity() { return PixelFormat.OPAQUE; }
    }

    private static int parseColor(final PluginCall call, final String key) {
        final String s = call.getString(key, "#000000");
        try {
            return android.graphics.Color.parseColor(s);
        } catch (final IllegalArgumentException e) {
            return 0xff000000;
        }
    }

    @PluginMethod
    public void setBarColors(final PluginCall call) {
        final int top = parseColor(call, "top");
        final int bottom = parseColor(call, "bottom");
        final boolean lightTop = Boolean.TRUE.equals(call.getBoolean("lightTop", false));
        final boolean lightBottom = Boolean.TRUE.equals(call.getBoolean("lightBottom", true));
        getBridge().executeOnMainThread(() -> {
            final Window window = getActivity().getWindow();
            final View decor = window.getDecorView();
            decor.setBackground(new BarsDrawable(decor, top, bottom));
            if (Build.VERSION.SDK_INT < 35) {
                // Below Android 15 the system may still draw its own bar backgrounds.
                window.setStatusBarColor(top);
                window.setNavigationBarColor(bottom);
            }
            final WindowInsetsControllerCompat c = WindowCompat.getInsetsController(window, decor);
            c.setAppearanceLightStatusBars(lightTop);
            c.setAppearanceLightNavigationBars(lightBottom);
            call.resolve();
        });
    }

    @PluginMethod
    public void setImeHints(final PluginCall call) {
        final boolean noLearning = Boolean.TRUE.equals(call.getBoolean("noPersonalizedLearning", false));
        final boolean ascii = Boolean.TRUE.equals(call.getBoolean("forceAscii", false));
        getBridge().executeOnMainThread(() -> {
            final WebView wv = getBridge().getWebView();
            if (wv instanceof KkWebView) ((KkWebView) wv).setImeHints(noLearning, ascii);
            call.resolve();
        });
    }
}
