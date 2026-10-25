package app.kanjikodama.wk;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** `Secrets` (src/platform/androidSecrets.ts): get / set / remove over {@link SecretStore}. */
@CapacitorPlugin(name = "Secrets")
public class SecretsPlugin extends Plugin {

    @PluginMethod
    public void get(final PluginCall call) {
        final String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        final JSObject ret = new JSObject();
        final String value = SecretStore.get(getContext(), key);
        ret.put("value", value == null ? JSObject.NULL : value);
        call.resolve(ret);
    }

    @PluginMethod
    public void set(final PluginCall call) {
        final String key = call.getString("key");
        final String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            SecretStore.set(getContext(), key, value);
            call.resolve();
        } catch (final Exception e) {
            call.reject("Could not store the secret: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void remove(final PluginCall call) {
        final String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        SecretStore.remove(getContext(), key);
        call.resolve();
    }
}
