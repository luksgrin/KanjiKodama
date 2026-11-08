package app.kanjikodama.wk;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * The app's self-update (the page decides what to offer: src/core/update): downloads a release APK
 * into the cache dir with progress events, checks its SHA-256 against the release's SHA256SUMS,
 * checks that it is this app (same package), signed with this app's certificate and newer, then
 * installs it with a PackageInstaller session. Android always asks the user to confirm the update;
 * the first time it also asks to allow installs from this app ("Install unknown apps").
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    private static final String DIR = "updates";
    private static final String STATUS_ACTION = ".UPDATE_INSTALL_STATUS";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    /** A progress event at most every this many bytes (and at the end). */
    private static final long PROGRESS_STEP = 256 * 1024;

    private BroadcastReceiver statusReceiver;

    @PluginMethod
    public void info(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            JSObject ret = new JSObject();
            ret.put("appId", ctx.getPackageName());
            ret.put("versionCode", versionCode(pi));
            ret.put("versionName", pi.versionName);
            ret.put("canInstall", canInstall());
            ret.put("testReleaseUrl", testReleaseUrl(ctx));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), "INFO", e);
        }
    }

    /**
     * Debuggable (debug) builds only: `adb shell setprop debug.kk.update_url <url>` points the check
     * at a test release JSON (the emulator test). Release builds are never debuggable and never read it.
     */
    private static String testReleaseUrl(Context ctx) {
        if ((ctx.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) return null;
        try {
            Process p = Runtime.getRuntime().exec(new String[] { "getprop", "debug.kk.update_url" });
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                String line = r.readLine();
                return line == null || line.trim().isEmpty() ? null : line.trim();
            }
        } catch (Exception e) {
            return null;
        }
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String sha256 = call.getString("sha256");
        if (url == null || sha256 == null || !sha256.matches("[0-9a-fA-F]{64}")) {
            call.reject("url and a SHA-256 are required", "ARGS");
            return;
        }
        new Thread(() -> {
            File dir = new File(getContext().getCacheDir(), DIR);
            File file = new File(dir, "update.apk");
            try {
                deleteAll(dir);
                if (!dir.mkdirs() && !dir.isDirectory()) throw new IllegalStateException("Cannot create " + dir);
                String actual = fetch(url, file);
                if (!actual.equalsIgnoreCase(sha256)) {
                    deleteAll(dir);
                    call.reject("The download doesn't match the release's checksum.", "CHECKSUM");
                    return;
                }
                long code = verify(file);
                JSObject ret = new JSObject();
                ret.put("path", file.getAbsolutePath());
                ret.put("versionCode", code);
                call.resolve(ret);
            } catch (VerifyException e) {
                deleteAll(dir);
                call.reject(e.getMessage(), e.code);
            } catch (Exception e) {
                deleteAll(dir);
                call.reject("Download failed: " + e.getMessage(), "NETWORK", e);
            }
        }, "kk-update-download").start();
    }

    /** Downloads `url` into `out` (redirects followed), sending progress events; returns its SHA-256. */
    private String fetch(String url, File out) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        HttpURLConnection conn = null;
        String current = url;
        for (int hops = 0; ; hops++) {
            conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setInstanceFollowRedirects(false);
            conn.setRequestProperty("User-Agent", "KanjiKodama-updater");
            int status = conn.getResponseCode();
            if (status >= 300 && status < 400 && hops < 5) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null) throw new IllegalStateException("Redirect without a location");
                current = new URL(new URL(current), location).toString();
                continue;
            }
            if (status != 200) {
                conn.disconnect();
                throw new IllegalStateException("HTTP " + status);
            }
            break;
        }
        long total = conn.getContentLengthLong();
        long received = 0;
        long nextEvent = 0;
        try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) {
                os.write(buf, 0, n);
                digest.update(buf, 0, n);
                received += n;
                if (received >= nextEvent) {
                    progress(received, total);
                    nextEvent = received + PROGRESS_STEP;
                }
            }
        } finally {
            conn.disconnect();
        }
        progress(received, total);
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format(Locale.ROOT, "%02x", b));
        return hex.toString();
    }

    private void progress(long received, long total) {
        JSObject ev = new JSObject();
        ev.put("received", received);
        ev.put("total", total);
        notifyListeners("downloadProgress", ev);
    }

    private static final class VerifyException extends Exception {
        final String code;

        VerifyException(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    /** The APK is this app, signed with this app's certificate(s), and newer; returns its versionCode. */
    private long verify(File apk) throws Exception {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (archive == null) throw new VerifyException("NOT_THIS_APP", "The download isn't an Android app.");
        if (!ctx.getPackageName().equals(archive.packageName)) {
            throw new VerifyException("NOT_THIS_APP", "The download is a different app (" + archive.packageName + ").");
        }
        PackageInfo installed = pm.getPackageInfo(ctx.getPackageName(), flags);
        Set<String> want = certificates(installed);
        Set<String> got = certificates(archive);
        if (want.isEmpty() || !want.equals(got)) {
            throw new VerifyException("SIGNATURE", "The download isn't signed with this app's key.");
        }
        long code = versionCode(archive);
        if (code <= versionCode(installed)) throw new VerifyException("NOT_NEWER", "The download isn't newer than this app.");
        return code;
    }

    /** SHA-256 digests of the package's signing certificates. */
    private static Set<String> certificates(PackageInfo pi) throws Exception {
        Signature[] sigs;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            SigningInfo si = pi.signingInfo;
            if (si == null) return new HashSet<>();
            sigs = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
        } else {
            sigs = pi.signatures;
        }
        Set<String> out = new HashSet<>();
        if (sigs == null) return out;
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        for (Signature s : sigs) {
            StringBuilder hex = new StringBuilder();
            for (byte b : md.digest(s.toByteArray())) hex.append(String.format(Locale.ROOT, "%02x", b));
            out.add(hex.toString());
        }
        return out;
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo pi) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : pi.versionCode;
    }

    /** "Install unknown apps" for this app; resolves with whether installs are now allowed. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (canInstall()) {
            JSObject ret = new JSObject();
            ret.put("canInstall", true);
            call.resolve(ret);
            return;
        }
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        startActivityForResult(call, intent, "onInstallSettingsResult");
    }

    @ActivityCallback
    private void onInstallSettingsResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        ret.put("canInstall", canInstall());
        call.resolve(ret);
    }

    /**
     * Installs the downloaded APK: a PackageInstaller session, committed; Android then asks the user
     * to confirm (the status broadcast's confirmation intent is started here). Resolves once the
     * session is committed; later statuses arrive as `installStatus` events. On success Android
     * stops this app and replaces it, keeping its data.
     */
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        File apk = path == null ? null : new File(path);
        File dir = new File(getContext().getCacheDir(), DIR);
        if (apk == null || !apk.isFile() || !apk.getParentFile().equals(dir)) {
            call.reject("No downloaded update", "ARGS");
            return;
        }
        if (!canInstall()) {
            call.reject("Installing updates isn't allowed for this app yet.", "PERMISSION");
            return;
        }
        try {
            registerStatusReceiver();
            PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(getContext().getPackageName());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
            }
            int id = installer.createSession(params);
            try (PackageInstaller.Session session = installer.openSession(id)) {
                try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("update.apk", 0, apk.length())) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                    session.fsync(out);
                }
                Intent status = new Intent(getContext().getPackageName() + STATUS_ACTION).setPackage(getContext().getPackageName());
                int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
                PendingIntent pending = PendingIntent.getBroadcast(getContext(), id, status, piFlags);
                session.commit(pending.getIntentSender());
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Install failed: " + e.getMessage(), "INSTALL", e);
        }
    }

    private void registerStatusReceiver() {
        if (statusReceiver != null) return;
        statusReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) {
                        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(confirm);
                    }
                    sendStatus("confirming", null);
                } else if (status == PackageInstaller.STATUS_SUCCESS) {
                    sendStatus("installed", null);
                } else if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
                    sendStatus("cancelled", null);
                } else {
                    sendStatus("failed", intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
                }
            }
        };
        ContextCompat.registerReceiver(getContext(), statusReceiver,
            new IntentFilter(getContext().getPackageName() + STATUS_ACTION), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private void sendStatus(String status, String message) {
        JSObject ev = new JSObject();
        ev.put("status", status);
        if (message != null) ev.put("message", message);
        notifyListeners("installStatus", ev);
    }

    /** Deletes the downloaded update (after an install, a failure or "Later"). */
    @PluginMethod
    public void cleanup(PluginCall call) {
        deleteAll(new File(getContext().getCacheDir(), DIR));
        call.resolve();
    }

    private static void deleteAll(File f) {
        if (f == null || !f.exists()) return;
        File[] children = f.listFiles();
        if (children != null) for (File c : children) deleteAll(c);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    @Override
    protected void handleOnDestroy() {
        if (statusReceiver != null) {
            try {
                getContext().unregisterReceiver(statusReceiver);
            } catch (IllegalArgumentException ignored) {
                // already gone
            }
            statusReceiver = null;
        }
        super.handleOnDestroy();
    }
}
