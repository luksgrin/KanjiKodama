package app.kanjikodama.wk;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.webkit.WebViewAssetLoader;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Background sync (server mode, "Allow background sync"). The sync logic is the app's JavaScript (src/sync/), and its
 * data is the WebView's IndexedDB, so this worker loads the app's own bundled index.html in a
 * headless WebView on the app's origin (https://localhost, as Capacitor serves it: same origin,
 * same IndexedDB) with {@code ?kk-background-sync}. main.tsx then runs only src/sync/background.ts:
 * one sync and the widget's counts, handed back through {@code window.KKBackground.done}.
 *
 * No Capacitor bridge runs here; the injected {@code KKBackground} gives the page native HTTP
 * (HttpURLConnection, like CapacitorHttp), the token from {@link SecretStore} and the app version.
 *
 * Skipped while the app is in the foreground (it syncs itself on resume) and more than once in the
 * same hour (a top-of-hour check on the last run). After the sync the review notification is
 * rescheduled with the plan the page computed (the counts may have changed), like the app does after
 * its own syncs; without notification permission it is only cancelled, as the app's plugin does.
 */
public final class BackgroundSyncWorker extends Worker {
    private static final String TAG = "KKBackgroundSync";
    private static final String PREFS = "kk_bgsync";
    private static final long HOUR = 60L * 60 * 1000;
    private static final long TIMEOUT_MINUTES = 4;
    static final String URL = "https://localhost/index.html?kk-background-sync";

    public BackgroundSyncWorker(@NonNull final Context context, @NonNull final WorkerParameters params) {
        super(context, params);
    }

    private static SharedPreferences prefs(final Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static long lastRunAt(final Context c) {
        return prefs(c).getLong("lastRunAt", 0);
    }

    static String lastResult(final Context c) {
        return prefs(c).getString("lastResult", null);
    }

    @NonNull
    @Override
    public Result doWork() {
        final Context context = getApplicationContext();
        if (MainActivity.isInForeground()) {
            Log.i(TAG, "app in the foreground: skipped");
            return Result.success();
        }
        final long now = System.currentTimeMillis();
        final long topOfHour = now - now % HOUR;
        if (prefs(context).getLong("lastTopOfHour", 0) == topOfHour) {
            return Result.success();
        }
        prefs(context).edit().putLong("lastTopOfHour", topOfHour).putLong("lastRunAt", now).apply();
        Log.i(TAG, "Background sync starts");
        final String result = runInWebView(context);
        prefs(context).edit().putString("lastResult", result).apply();
        Log.i(TAG, "Background sync ends: " + result);
        return Result.success();
    }

    /** Loads the app headless and waits for {@code KKBackground.done}; returns its JSON (or an error text). */
    private static String runInWebView(final Context context) {
        final Handler main = new Handler(Looper.getMainLooper());
        final CountDownLatch latch = new CountDownLatch(1);
        final String[] result = {"{\"ok\":false,\"message\":\"timeout\"}"};
        final WebView[] holder = new WebView[1];
        final ExecutorService http = Executors.newFixedThreadPool(2);
        main.post(() -> {
            try {
                holder[0] = createWebView(context, main, http, json -> {
                    result[0] = json;
                    applyResult(context, json);
                    latch.countDown();
                });
                holder[0].loadUrl(URL);
            } catch (final Throwable t) {
                result[0] = "{\"ok\":false,\"message\":" + JSONObject.quote(String.valueOf(t)) + "}";
                latch.countDown();
            }
        });
        try {
            latch.await(TIMEOUT_MINUTES, TimeUnit.MINUTES);
        } catch (final InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        main.post(() -> {
            if (holder[0] != null) {
                holder[0].stopLoading();
                holder[0].destroy();
            }
        });
        http.shutdownNow();
        return result[0];
    }

    /** The widget counts and the review notification plan from the sync (the app would have done this itself). */
    static void applyResult(final Context context, final String json) {
        try {
            final JSONObject o = new JSONObject(json);
            final JSONObject widget = o.optJSONObject("widget");
            if (widget != null) {
                WidgetStore.save(context, widget);
                SessionWidgetProvider.refresh(context);
            }
            final JSONObject notifications = o.optJSONObject("notifications");
            if (notifications != null) {
                if (!notifications.optBoolean("enabled", true) || !ReviewNotifications.notificationsAllowed(context)) {
                    ReviewNotifications.cancelAll(context);
                } else {
                    final JSONArray entries = notifications.optJSONArray("entries");
                    ReviewNotifications.schedule(context, entries == null ? new JSONArray() : entries,
                            notifications.optJSONObject("current"));
                }
            }
        } catch (final Exception e) {
            Log.w(TAG, "bad result: " + e);
        }
    }

    interface Done {
        void accept(String json);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private static WebView createWebView(final Context context, final Handler main, final ExecutorService http, final Done done) {
        final WebView view = new WebView(context);
        final WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain("localhost")
                .addPathHandler("/", new PublicAssets(context.getAssets()))
                .build();
        view.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(final WebView v, final WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        view.addJavascriptInterface(new Bridge(context, view, main, http, done), "KKBackground");
        return view;
    }

    /** The bundled web app (assets/public/), served at https://localhost/ as Capacitor does. */
    static final class PublicAssets implements WebViewAssetLoader.PathHandler {
        private final AssetManager assets;

        PublicAssets(final AssetManager assets) {
            this.assets = assets;
        }

        static String mimeOf(final String path) {
            final String p = path.toLowerCase(java.util.Locale.ROOT);
            if (p.endsWith(".html")) return "text/html";
            if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
            if (p.endsWith(".css")) return "text/css";
            if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
            if (p.endsWith(".wasm")) return "application/wasm";
            if (p.endsWith(".svg")) return "image/svg+xml";
            if (p.endsWith(".png")) return "image/png";
            if (p.endsWith(".woff2")) return "font/woff2";
            return "application/octet-stream";
        }

        @Override
        public WebResourceResponse handle(@NonNull final String path) {
            final String file = path.isEmpty() ? "index.html" : path;
            try {
                final InputStream in = assets.open("public/" + file);
                return new WebResourceResponse(mimeOf(file), "utf-8", in);
            } catch (final Exception e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
            }
        }
    }

    /** {@code window.KKBackground} (src/sync/background.ts `BackgroundBridge`). */
    static final class Bridge {
        private final Context context;
        private final WebView view;
        private final Handler main;
        private final ExecutorService http;
        private final Done done;

        Bridge(final Context context, final WebView view, final Handler main, final ExecutorService http, final Done done) {
            this.context = context;
            this.view = view;
            this.main = main;
            this.http = http;
            this.done = done;
        }

        @JavascriptInterface
        public String token() {
            return SecretStore.get(context, "server.token");
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
            } catch (final Exception e) {
                return "0";
            }
        }

        @JavascriptInterface
        public void log(final String message) {
            Log.i(TAG, message);
        }

        @JavascriptInterface
        public void done(final String json) {
            done.accept(json);
        }

        @JavascriptInterface
        public void request(final String id, final String json) {
            http.execute(() -> {
                final String response = perform(json);
                main.post(() -> view.evaluateJavascript(
                        "window.__kkBgResponse && window.__kkBgResponse(" + JSONObject.quote(id) + "," + JSONObject.quote(response) + ")", null));
            });
        }

        /** One request ({url, method, headers, body, timeoutMs}) → {status, headers, body} or {error}. */
        static String perform(final String json) {
            HttpURLConnection conn = null;
            try {
                final JSONObject req = new JSONObject(json);
                conn = (HttpURLConnection) new URL(req.getString("url")).openConnection();
                conn.setRequestMethod(req.optString("method", "GET"));
                conn.setConnectTimeout(10_000);
                conn.setReadTimeout(req.optInt("timeoutMs", 60_000));
                conn.setInstanceFollowRedirects(true);
                final JSONObject headers = req.optJSONObject("headers");
                if (headers != null) {
                    for (final Iterator<String> it = headers.keys(); it.hasNext(); ) {
                        final String k = it.next();
                        conn.setRequestProperty(k, headers.getString(k));
                    }
                }
                final String body = req.has("body") && !req.isNull("body") ? req.getString("body") : null;
                if (body != null) {
                    conn.setDoOutput(true);
                    if (conn.getRequestProperty("Content-Type") == null) {
                        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    }
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                }
                final int status = conn.getResponseCode();
                final JSONObject out = new JSONObject();
                out.put("status", status);
                final JSONObject h = new JSONObject();
                for (final Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                    if (e.getKey() != null) {
                        h.put(e.getKey().toLowerCase(java.util.Locale.ROOT), String.join(", ", e.getValue()));
                    }
                }
                out.put("headers", h);
                final InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                out.put("body", in == null ? "" : readAll(in));
                return out.toString();
            } catch (final Exception e) {
                try {
                    return new JSONObject().put("error", String.valueOf(e)).toString();
                } catch (final Exception never) {
                    return "{\"error\":\"request failed\"}";
                }
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }

        private static String readAll(final InputStream in) throws Exception {
            try (InputStream is = in) {
                final ByteArrayOutputStream bos = new ByteArrayOutputStream();
                final byte[] buf = new byte[16384];
                int n;
                while ((n = is.read(buf)) > 0) {
                    bos.write(buf, 0, n);
                }
                return bos.toString("UTF-8");
            }
        }
    }
}
