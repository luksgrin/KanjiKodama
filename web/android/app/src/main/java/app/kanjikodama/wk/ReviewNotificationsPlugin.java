package app.kanjikodama.wk;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * `ReviewNotifications` (src/platform/androidNotifications.ts): the notification permission
 * (POST_NOTIFICATIONS on Android 13+) and the plan for the single review notification
 * (ReviewNotifications.java).
 */
@CapacitorPlugin(
        name = "ReviewNotifications",
        permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = ReviewNotificationsPlugin.DISPLAY))
public class ReviewNotificationsPlugin extends Plugin {
    static final String DISPLAY = "display";

    private String state() {
        if (Build.VERSION.SDK_INT >= 33) {
            final PermissionState s = getPermissionState(DISPLAY);
            if (s == PermissionState.GRANTED) {
                return ReviewNotifications.notificationsAllowed(getContext()) ? "granted" : "denied";
            }
            return s == PermissionState.DENIED ? "denied" : "prompt";
        }
        return ReviewNotifications.notificationsAllowed(getContext()) ? "granted" : "denied";
    }

    @PluginMethod
    public void permission(final PluginCall call) {
        final JSObject ret = new JSObject();
        ret.put("display", state());
        call.resolve(ret);
    }

    @PluginMethod
    public void request(final PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState(DISPLAY) != PermissionState.GRANTED) {
            requestPermissionForAlias(DISPLAY, call, "onPermission");
            return;
        }
        permission(call);
    }

    @PermissionCallback
    private void onPermission(final PluginCall call) {
        permission(call);
    }

    @PluginMethod
    public void schedule(final PluginCall call) {
        try {
            final JSArray entries = call.getArray("entries", new JSArray());
            final JSONObject current = call.getObject("current", null);
            final JSONObject style = call.getObject("style", null);
            ReviewNotifications.schedule(getContext(), new JSONArray(entries.toString()), current, style);
            final JSObject ret = new JSObject();
            ret.put("scheduled", entries.length());
            call.resolve(ret);
        } catch (final Exception e) {
            call.reject("Could not schedule the review notification: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void cancelAll(final PluginCall call) {
        ReviewNotifications.cancelAll(getContext());
        call.resolve();
    }
}
