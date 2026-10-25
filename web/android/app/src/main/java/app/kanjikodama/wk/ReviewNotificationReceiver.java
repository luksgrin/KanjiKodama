package app.kanjikodama.wk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The review notification's alarm, and re-arming it after a reboot or an app update (alarms are
 * dropped then): `ReviewNotifications.onAlarm` posts a due entry (one missed while the device was
 * off counts) and arms the next.
 */
public final class ReviewNotificationReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(final Context context, final Intent intent) {
        final String action = intent.getAction();
        if (ReviewNotifications.ACTION_POST.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            ReviewNotifications.onAlarm(context);
        }
    }
}
