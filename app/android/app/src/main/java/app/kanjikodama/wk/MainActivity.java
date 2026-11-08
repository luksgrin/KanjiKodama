package app.kanjikodama.wk;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static volatile boolean foreground = false;

    /** The splash stays until the page shows the app (or its start-up error), at most this long. */
    private static final long SPLASH_MAX_MS = 6000;
    private static final long SPLASH_POLL_MS = 40;
    /** `.kk-shell` is rendered once the app is ready (ui/shell/AppShell.tsx); the error screen has role=alert. */
    private static final String READY_JS = "!!document.querySelector('.kk-shell, .kk-startup[role=alert]')";

    private volatile boolean webReady = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    /** The app is on screen: background sync skips (the app syncs on resume itself). */
    public static boolean isInForeground() {
        return foreground;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Go from the splash screen straight to the dashboard: keep the system
        // splash until the web app is ready instead of showing the page's own loading screen.
        final SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !webReady);
        // Local plugins must be registered before the bridge is created in super.onCreate().
        registerPlugin(DocumentPlugin.class);
        registerPlugin(SecretsPlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(BackgroundSyncPlugin.class);
        registerPlugin(SystemUiPlugin.class);
        registerPlugin(ReviewNotificationsPlugin.class);
        registerPlugin(KkAudioPlugin.class);
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        pollReady(SystemClock.uptimeMillis() + SPLASH_MAX_MS);
    }

    private void pollReady(final long deadline) {
        if (webReady) return;
        if (SystemClock.uptimeMillis() >= deadline || bridge == null) {
            webReady = true;
            return;
        }
        final WebView wv = bridge.getWebView();
        if (wv == null) {
            webReady = true;
            return;
        }
        wv.evaluateJavascript(READY_JS, (v) -> {
            if ("true".equals(v)) {
                webReady = true;
                // adb logcat -s KkStartup: process start to the first app screen (cold start).
                Log.i("KkStartup", "app screen ready " + (SystemClock.uptimeMillis() - Process.getStartUptimeMillis()) + " ms after process start");
            } else handler.postDelayed(() -> pollReady(deadline), SPLASH_POLL_MS);
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        foreground = true;
    }

    @Override
    public void onPause() {
        foreground = false;
        super.onPause();
    }
}
