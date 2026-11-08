/*
 * The review notification, as the Java app's services/NotificationWorker posts it: ONE notification
 * (id 1) on the "NewReviewsChannel" channel, updated in place, public on the lock screen, sound only
 * when new reviews became available. Notification settings (stored with each plan, `style`):
 * `notification_priority` → channel importance (`NotificationPriority.getManagerImportance`) and
 * compat priority, `notification_category` → the category, `notification_update_frequency` → when a
 * shown notification is updated with changed counts (`NotificationWorker.processAlarmHelper`): only
 * for new reviews (default), once per hour (at most once per clock hour; a change later in the hour
 * is posted at the next top of the hour), or continuously.
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
    private static final String KEY_FREQUENCY = "frequency";
    private static final String KEY_PRIORITY = "priority";
    private static final String KEY_CATEGORY = "category";
    /** Top of the hour of the last post or update (`PropertiesDao.getLastNotificationUpdate`). */
    private static final String KEY_LAST_UPDATE_HOUR = "lastUpdateHour";
    /** The counts last shown (`getLastNotificationAlertContext`). */
    private static final String KEY_LAST_LESSONS = "lastLessons";
    private static final String KEY_LAST_REVIEWS = "lastReviews";
    /** ONCE_PER_HOUR: the counts to show at the next top of the hour ({at, title, body, lessons, reviews}). */
    private static final String KEY_PENDING = "pending";
    private static final long HOUR = 3_600_000L;
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

    /** {@link #schedule(Context, JSONArray, JSONObject, JSONObject)} with the stored settings. */
    public static void schedule(final Context context, final JSONArray entries, final JSONObject current) {
        schedule(context, entries, current, null);
    }

    /**
     * Store the plan (and the notification settings, when given), update or clear a shown
     * notification with the current counts as the update frequency says, arm the alarm.
     */
    public static void schedule(final Context context, final JSONArray entries, final JSONObject current, final JSONObject style) {
        if (style != null) {
            prefs(context).edit()
                    .putString(KEY_FREQUENCY, style.optString("frequency", "ONLY_NEW_REVIEWS"))
                    .putString(KEY_PRIORITY, style.optString("priority", "DEFAULT"))
                    .putString(KEY_CATEGORY, style.optString("category", "RECOMMENDATION"))
                    .apply();
        }
        ensureChannel(context);
        cleanUpLegacy(context);
        prefs(context).edit().putString(KEY_PLAN, entries.toString()).remove(KEY_PENDING).apply();
        final long now = System.currentTimeMillis();
        if (current != null) {
            final int lessons = current.optInt("lessons", 0);
            final int reviews = current.optInt("reviews", 0);
            final boolean changed = lessons != prefs(context).getInt(KEY_LAST_LESSONS, -1)
                    || reviews != prefs(context).getInt(KEY_LAST_REVIEWS, -1);
            if (lessons == 0 && reviews == 0) {
                if (isShown(context)) {
                    cancelShown(context);
                }
                remember(context, now, 0, 0);
            } else if (changed) {
                // The app knows newer counts than the shown notification: update it silently if the
                // update frequency allows it now.
                final String frequency = frequency(context);
                if ("CONTINUOUSLY".equals(frequency)
                        || "ONCE_PER_HOUR".equals(frequency) && topOfHour(now) != prefs(context).getLong(KEY_LAST_UPDATE_HOUR, 0)) {
                    post(context, current.optString("title"), current.optString("body"), false);
                    remember(context, now, lessons, reviews);
                } else if ("ONCE_PER_HOUR".equals(frequency)) {
                    try {
                        final JSONObject pending = new JSONObject(current.toString());
                        pending.put("at", topOfHour(now) + HOUR);
                        prefs(context).edit().putString(KEY_PENDING, pending.toString()).apply();
                    } catch (final Exception e) {
                        // not posted then
                    }
                }
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
        prefs(context).edit().remove(KEY_PLAN).remove(KEY_LAST_POSTED).remove(KEY_PENDING)
                .remove(KEY_LAST_LESSONS).remove(KEY_LAST_REVIEWS).apply();
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
        final JSONObject pending = pending(context);
        if (due != null) {
            prefs(context).edit().putLong(KEY_LAST_POSTED, due.optLong("at")).remove(KEY_PENDING).apply();
            if (notificationsAllowed(context)) {
                ensureChannel(context);
                post(context, due.optString("title"), due.optString("body"), true);
                remember(context, now, due.optInt("lessons", -1), due.optInt("reviews", -1));
            }
        } else if (pending != null && pending.optLong("at", Long.MAX_VALUE) <= now) {
            // ONCE_PER_HOUR: the counts that changed during the last hour, silently.
            prefs(context).edit().remove(KEY_PENDING).apply();
            if (notificationsAllowed(context)) {
                ensureChannel(context);
                post(context, pending.optString("title"), pending.optString("body"), false);
                remember(context, now, pending.optInt("lessons", -1), pending.optInt("reviews", -1));
            }
        }
        armNext(context, now);
    }

    private static JSONObject pending(final Context context) {
        try {
            final String s = prefs(context).getString(KEY_PENDING, null);
            return s == null ? null : new JSONObject(s);
        } catch (final Exception e) {
            return null;
        }
    }

    private static long topOfHour(final long t) {
        return t - Math.floorMod(t, HOUR);
    }

    private static void remember(final Context context, final long now, final int lessons, final int reviews) {
        prefs(context).edit().putLong(KEY_LAST_UPDATE_HOUR, topOfHour(now))
                .putInt(KEY_LAST_LESSONS, lessons).putInt(KEY_LAST_REVIEWS, reviews).apply();
    }

    private static String frequency(final Context context) {
        return prefs(context).getString(KEY_FREQUENCY, "ONLY_NEW_REVIEWS");
    }

    /** `NotificationPriority`: {manager importance, compat priority}. */
    private static int[] priority(final Context context) {
        switch (prefs(context).getString(KEY_PRIORITY, "DEFAULT")) {
            case "MIN": return new int[] { NotificationManager.IMPORTANCE_MIN, NotificationCompat.PRIORITY_MIN };
            case "LOW": return new int[] { NotificationManager.IMPORTANCE_LOW, NotificationCompat.PRIORITY_LOW };
            case "HIGH": return new int[] { NotificationManager.IMPORTANCE_HIGH, NotificationCompat.PRIORITY_HIGH };
            case "MAX": return new int[] { NotificationManager.IMPORTANCE_MAX, NotificationCompat.PRIORITY_MAX };
            default: return new int[] { NotificationManager.IMPORTANCE_DEFAULT, NotificationCompat.PRIORITY_DEFAULT };
        }
    }

    /** `NotificationCategory.getCompatCategory`. */
    private static String category(final Context context) {
        switch (prefs(context).getString(KEY_CATEGORY, "RECOMMENDATION")) {
            case "CALL": return NotificationCompat.CATEGORY_CALL;
            case "NAVIGATION": return NotificationCompat.CATEGORY_NAVIGATION;
            case "MESSAGE": return NotificationCompat.CATEGORY_MESSAGE;
            case "EMAIL": return NotificationCompat.CATEGORY_EMAIL;
            case "EVENT": return NotificationCompat.CATEGORY_EVENT;
            case "PROMO": return NotificationCompat.CATEGORY_PROMO;
            case "ALARM": return NotificationCompat.CATEGORY_ALARM;
            case "PROGRESS": return NotificationCompat.CATEGORY_PROGRESS;
            case "SOCIAL": return NotificationCompat.CATEGORY_SOCIAL;
            case "ERROR": return NotificationCompat.CATEGORY_ERROR;
            case "TRANSPORT": return NotificationCompat.CATEGORY_TRANSPORT;
            case "SYSTEM": return NotificationCompat.CATEGORY_SYSTEM;
            case "SERVICE": return NotificationCompat.CATEGORY_SERVICE;
            case "REMINDER": return NotificationCompat.CATEGORY_REMINDER;
            case "STATUS": return NotificationCompat.CATEGORY_STATUS;
            default: return NotificationCompat.CATEGORY_RECOMMENDATION;
        }
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
        long next = 0;
        for (int i = 0; i < entries.length(); i++) {
            final JSONObject e = entries.optJSONObject(i);
            final long at = e == null ? 0 : e.optLong("at", 0);
            if (at > now && at > last) {
                next = at;
                break;
            }
        }
        final JSONObject pending = pending(context);
        final long p = pending == null ? 0 : pending.optLong("at", 0);
        if (p > now && (next == 0 || p < next)) {
            next = p;
        }
        return next;
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
        // `notification_priority` → the channel's importance, as NotificationWorker (Android keeps the
        // importance of an existing channel once the user changed it there).
        final NotificationChannel channel = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, priority(context)[0]);
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
                .setPriority(priority(context)[1])
                .setCategory(category(context))
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
