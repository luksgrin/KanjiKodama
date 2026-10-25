/*
 * The review notification, as the Java app's services/NotificationWorker posts it: ONE notification
 * (id 1) on the "NewReviewsChannel" channel, updated in place, public on the lock screen, category
 * "recommendation", sound only when new reviews became available.
 *
 * The Java app recomputes the counts at its hourly alarm. This app can't run its JS then, so it hands
 * over the plan (core planReviewNotifications: one entry per future hour in which reviews become
 * available, with the counts at that hour); an inexact AlarmManager alarm at the next entry posts or
 * updates the notification and arms the alarm for the entry after it. The plan survives reboots and
 * app updates (ReviewNotificationReceiver re-arms on BOOT_COMPLETED / MY_PACKAGE_REPLACED).
 */
package app.kanjikodama.wk;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

public final class ReviewNotifications {
    /** `NotificationWorker`: `notificationManager.notify(1, ...)`. */
    static final int NOTIFICATION_ID = 1;
    static final String CHANNEL_ID = "NewReviewsChannel";
    private static final String CHANNEL_NAME = "NewReviewsChannel";
    private static final String CHANNEL_DESCRIPTION = "New reviews available";
    /** The channel @capacitor/local-notifications used to create; removed (the Java app has only one). */
    private static final String LEGACY_DEFAULT_CHANNEL = "default";
    static final String ACTION_POST = "app.kanjikodama.wk.REVIEW_NOTIFICATION";

    private static final String PREFS = "kk_review_notifications";
    private static final String KEY_PLAN = "plan";
    private static final String KEY_LAST_POSTED = "lastPostedAt";
    private static final String KEY_LEGACY_CLEANED = "legacyCleaned";
    /** The receiver @capacitor/local-notifications scheduled its alarms with (ids 1 and 1000–1063). */
    private static final String LEGACY_PUBLISHER = "com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher";

    private ReviewNotifications() {}

    private static SharedPreferences prefs(final Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** The planned entries ({at, title, body}), earliest first; empty when none. */
    static JSONArray plan(final Context context) {
        try {
            final String s = prefs(context).getString(KEY_PLAN, null);
            return s == null ? new JSONArray() : new JSONArray(s);
        } catch (final Exception e) {
            return new JSONArray();
        }
    }

    /** Store the plan, update (or clear) a shown notification with the current counts, arm the alarm. */
    public static void schedule(final Context context, final JSONArray entries, final JSONObject current) {
        ensureChannel(context);
        cleanUpLegacy(context);
        prefs(context).edit().putString(KEY_PLAN, entries.toString()).apply();
        final long now = System.currentTimeMillis();
        if (current != null && isShown(context)) {
            if (current.optInt("lessons", 0) == 0 && current.optInt("reviews", 0) == 0) {
                cancelShown(context);
            } else {
                // The app knows newer counts than the shown notification: update it, silently.
                post(context, current.optString("title"), current.optString("body"), false);
            }
        }
        // An entry that is already due (the app was killed before its alarm) counts as posted:
        // the app was running then, and the dashboard shows the counts.
        prefs(context).edit().putLong(KEY_LAST_POSTED, Math.max(lastPosted(context), latestDue(entries, now))).apply();
        armNext(context, now);
    }

    /** Forget the plan, cancel the alarm and the shown notification (`enable_notifications` off). */
    public static void cancelAll(final Context context) {
        cleanUpLegacy(context);
        prefs(context).edit().remove(KEY_PLAN).remove(KEY_LAST_POSTED).apply();
        final AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            am.cancel(alarmIntent(context));
        }
        cancelShown(context);
    }

    /**
     * The alarm (or boot / app update): post the newest due entry not posted yet, with sound (new
     * reviews), then arm the alarm for the next one.
     */
    static void onAlarm(final Context context) {
        final long now = System.currentTimeMillis();
        final JSONArray entries = plan(context);
        final long last = lastPosted(context);
        JSONObject due = null;
        for (int i = 0; i < entries.length(); i++) {
            final JSONObject e = entries.optJSONObject(i);
            if (e == null) {
                continue;
            }
            final long at = e.optLong("at", Long.MAX_VALUE);
            if (at <= now && at > last) {
                due = e;
            }
        }
        if (due != null) {
            prefs(context).edit().putLong(KEY_LAST_POSTED, due.optLong("at")).apply();
            if (notificationsAllowed(context)) {
                ensureChannel(context);
                post(context, due.optString("title"), due.optString("body"), true);
            }
        }
        armNext(context, now);
    }

    private static long lastPosted(final Context context) {
        return prefs(context).getLong(KEY_LAST_POSTED, 0);
    }

    private static long latestDue(final JSONArray entries, final long now) {
        long latest = 0;
        for (int i = 0; i < entries.length(); i++) {
            final JSONObject e = entries.optJSONObject(i);
            final long at = e == null ? Long.MAX_VALUE : e.optLong("at", Long.MAX_VALUE);
            if (at <= now) {
                latest = Math.max(latest, at);
            }
        }
        return latest;
    }

    /** The first entry after {@code now} and not posted yet, or 0. */
    static long nextAt(final Context context, final long now) {
        final JSONArray entries = plan(context);
        final long last = lastPosted(context);
        for (int i = 0; i < entries.length(); i++) {
            final JSONObject e = entries.optJSONObject(i);
            final long at = e == null ? 0 : e.optLong("at", 0);
            if (at > now && at > last) {
                return at;
            }
        }
        return 0;
    }

    private static PendingIntent alarmIntent(final Context context) {
        final Intent intent = new Intent(context, ReviewNotificationReceiver.class).setAction(ACTION_POST);
        return PendingIntent.getBroadcast(context, 2, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void armNext(final Context context, final long now) {
        final AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            return;
        }
        final PendingIntent pi = alarmIntent(context);
        final long next = nextAt(context, now);
        if (next == 0) {
            am.cancel(pi);
            return;
        }
        // Inexact and allowed in Doze, as the Java app's BackgroundAlarmReceiver
        // (setAndAllowWhileIdle, RTC_WAKEUP); no SCHEDULE_EXACT_ALARM needed.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
    }

    /**
     * Once after the update from the build that used @capacitor/local-notifications: cancel its
     * pending alarms (their receiver is gone) and its notifications (one per review hour).
     */
    private static void cleanUpLegacy(final Context context) {
        if (prefs(context).getBoolean(KEY_LEGACY_CLEANED, false)) {
            return;
        }
        final AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        final NotificationManagerCompat nm = NotificationManagerCompat.from(context);
        final android.content.ComponentName publisher = new android.content.ComponentName(context.getPackageName(), LEGACY_PUBLISHER);
        final int[] mutability = { PendingIntent.FLAG_IMMUTABLE, PendingIntent.FLAG_MUTABLE };
        for (int id = 1000; id <= 1064; id++) {
            final int requestCode = id == 1064 ? 1 : id;
            if (requestCode != NOTIFICATION_ID) {
                nm.cancel(requestCode);
            }
            if (am == null) {
                continue;
            }
            for (final int m : mutability) {
                final PendingIntent pi = PendingIntent.getBroadcast(context, requestCode, new Intent().setComponent(publisher),
                        PendingIntent.FLAG_NO_CREATE | m);
                if (pi != null) {
                    am.cancel(pi);
                    pi.cancel();
                }
            }
        }
        prefs(context).edit().putBoolean(KEY_LEGACY_CLEANED, true).apply();
    }

    static boolean notificationsAllowed(final Context context) {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    static void ensureChannel(final Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        final NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) {
            return;
        }
        // `notification_priority` default DEFAULT → IMPORTANCE_DEFAULT.
        final NotificationChannel channel = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(CHANNEL_DESCRIPTION);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(channel);
        if (nm.getNotificationChannel(LEGACY_DEFAULT_CHANNEL) != null) {
            nm.deleteNotificationChannel(LEGACY_DEFAULT_CHANNEL);
        }
    }

    private static boolean isShown(final Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return false;
        }
        final NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) {
            return false;
        }
        for (final StatusBarNotification n : nm.getActiveNotifications()) {
            if (n.getId() == NOTIFICATION_ID) {
                return true;
            }
        }
        return false;
    }

    private static void cancelShown(final Context context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
    }

    /** `NotificationWorker.postNotification`. */
    private static void post(final Context context, final String title, final String body, final boolean needsSound) {
        if (!notificationsAllowed(context)) {
            return;
        }
        final Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        final PendingIntent content = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE);
        final NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_name)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
                .setContentIntent(content)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(!needsSound)
                .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, b.build());
        } catch (final SecurityException e) {
            // Permission revoked between the check and the post.
        }
    }
}
