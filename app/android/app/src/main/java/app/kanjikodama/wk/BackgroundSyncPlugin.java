package app.kanjikodama.wk;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;
import java.util.Random;
import java.util.concurrent.TimeUnit;

/**
 * `BackgroundSync` (src/platform/androidBackgroundSync.ts): schedule or cancel
 * {@link BackgroundSyncWorker}: periodic, 1 hour with 5 minutes flex, network connected, battery not low, a random first delay
 * of up to an hour.
 */
@CapacitorPlugin(name = "BackgroundSync")
public class BackgroundSyncPlugin extends Plugin {
    /** The work's tag and unique name. */
    public static final String WORK_NAME = "bgsync2";

    static void schedule(final Context context) {
        final Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .build();
        final PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(BackgroundSyncWorker.class, 1, TimeUnit.HOURS, 5, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .addTag(WORK_NAME)
                .setInitialDelay(new Random().nextInt(3600), TimeUnit.SECONDS)
                .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
    }

    static void cancel(final Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME);
    }

    @PluginMethod
    public void configure(final PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        try {
            if (enabled) {
                schedule(getContext());
            } else {
                cancel(getContext());
            }
            final JSObject ret = new JSObject();
            ret.put("scheduled", enabled);
            call.resolve(ret);
        } catch (final Exception e) {
            call.reject("Could not configure background sync: " + e.getMessage(), e);
        }
    }

    /** One run soon ({@code delaySeconds}, default 0), outside the period: a manual trigger and the emulator smoke test. */
    @PluginMethod
    public void runNow(final PluginCall call) {
        final int delay = call.getInt("delaySeconds", 0);
        final OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(BackgroundSyncWorker.class)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInitialDelay(Math.max(0, delay), TimeUnit.SECONDS)
                .addTag(WORK_NAME + "-once")
                .build();
        WorkManager.getInstance(getContext()).enqueue(request);
        call.resolve();
    }

    @PluginMethod
    public void status(final PluginCall call) {
        new Thread(() -> {
            final JSObject ret = new JSObject();
            boolean scheduled = false;
            try {
                final List<WorkInfo> infos = WorkManager.getInstance(getContext()).getWorkInfosForUniqueWork(WORK_NAME).get();
                for (final WorkInfo info : infos) {
                    if (!info.getState().isFinished()) {
                        scheduled = true;
                    }
                }
            } catch (final Exception e) {
                // report not scheduled
            }
            ret.put("scheduled", scheduled);
            ret.put("lastRunAt", BackgroundSyncWorker.lastRunAt(getContext()));
            final String last = BackgroundSyncWorker.lastResult(getContext());
            ret.put("lastResult", last == null ? JSObject.NULL : last);
            call.resolve(ret);
        }).start();
    }
}
