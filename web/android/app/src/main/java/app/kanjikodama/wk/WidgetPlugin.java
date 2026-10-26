package app.kanjikodama.wk;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/** `Widget` (src/platform/androidWidget.ts): store the counts, redraw the widgets. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void update(final PluginCall call) {
        try {
            final JSONObject plan = new JSONObject(call.getData().toString());
            WidgetStore.save(getContext(), plan);
            final JSObject ret = new JSObject();
            ret.put("widgets", SessionWidgetProvider.refresh(getContext()));
            call.resolve(ret);
        } catch (final Exception e) {
            call.reject("Could not update the widget: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void requestPin(final PluginCall call) {
        final JSObject ret = new JSObject();
        boolean requested = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            final AppWidgetManager m = AppWidgetManager.getInstance(getContext());
            if (m.isRequestPinAppWidgetSupported()) {
                requested = m.requestPinAppWidget(new ComponentName(getContext(), SessionWidgetProvider.PROVIDER), null, null);
            }
        }
        ret.put("requested", requested);
        call.resolve(ret);
    }
}
