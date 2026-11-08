package app.kanjikodama.wk;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Minimal Storage Access Framework bridge: save text to a user-chosen document
 * (ACTION_CREATE_DOCUMENT) and read a user-chosen document (ACTION_OPEN_DOCUMENT).
 * Needs no storage permissions; Drive appears as a provider when installed.
 */
@CapacitorPlugin(name = "Document")
public class DocumentPlugin extends Plugin {

    private static final int MAX_BYTES = 20 * 1024 * 1024;

    /**
     * The text being saved, kept here instead of in the call: Capacitor stores a pending call's
     * options in the activity's saved state when the picker covers it, and a real progress file
     * (~750 KB, twice in the bundle) overflows the 1 MB binder limit: TransactionTooLargeException
     * crashed the app as soon as the picker opened.
     */
    private String pendingText;

    @PluginMethod
    public void save(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            call.reject("text is required");
            return;
        }
        pendingText = text;
        call.getData().remove("text");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/json"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("filename", "progress.json"));
        startActivityForResult(call, intent, "onSaveResult");
    }

    @ActivityCallback
    private void onSaveResult(PluginCall call, ActivityResult result) {
        final String text = pendingText;
        pendingText = null;
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }
        Uri uri = data.getData();
        if (text == null) {
            // The app was restarted while the picker was open: the text is gone.
            call.reject("The app was restarted while the file picker was open. Please save again.");
            return;
        }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) throw new IllegalStateException("Cannot open output stream");
            out.write(text.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            call.reject("Write failed: " + e.getMessage(), e);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("saved", true);
        ret.put("uri", uri.toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        JSArray types = call.getArray("mimeTypes");
        if (types != null && types.length() > 0) {
            try {
                intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toList().toArray(new String[0]));
            } catch (Exception ignored) {
                // fall back to */*
            }
        }
        startActivityForResult(call, intent, "onOpenResult");
    }

    @ActivityCallback
    private void onOpenResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri uri = data.getData();
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("Cannot open input stream");
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) != -1) {
                buf.write(chunk, 0, n);
                if (buf.size() > MAX_BYTES) throw new IllegalStateException("File too large");
            }
            JSObject ret = new JSObject();
            ret.put("cancelled", false);
            ret.put("text", buf.toString(StandardCharsets.UTF_8.name()));
            ret.put("name", displayName(uri));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage(), e);
        }
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
        }
        return null;
    }
}
