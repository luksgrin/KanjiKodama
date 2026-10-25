/*
 * Port of durtles' services/SessionWidgetProvider (Copyright 2019-2020 Ernst Jan Plugge, Apache 2.0):
 * same layouts, size breakpoints and texts. The counts come from WidgetStore (handed over by the
 * app) instead of the Room database; an inexact alarm at the next scheduled entry redraws the
 * widget when new reviews become available, without the app.
 */
package app.kanjikodama.wk;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Locale;

public final class SessionWidgetProvider extends AppWidgetProvider {
    /** The alarm's broadcast: the next scheduled entry has started. */
    static final String ACTION_TICK = "app.kanjikodama.wk.WIDGET_TICK";
    private static final long DAY = 24L * 60 * 60 * 1000;

    /** `TextUtil.formatShortTimeForDisplay(ts, false)`. */
    static String formatShortTime(final Context context, final long ts) {
        final ZonedDateTime dt = ZonedDateTime.ofInstant(Instant.ofEpochMilli(ts), ZoneId.systemDefault());
        final int hour = dt.getHour();
        final int minute = dt.getMinute();
        if (DateFormat.is24HourFormat(context)) {
            return String.format(Locale.ROOT, "%02d:%02d", hour, minute);
        }
        final int hour12 = (hour == 0) ? 12 : (hour > 12) ? hour - 12 : hour;
        if (minute == 0) {
            return String.format(Locale.ROOT, "%d%s", hour12, hour >= 12 ? "pm" : "am");
        }
        return String.format(Locale.ROOT, "%d.%02d%s", hour12, minute, hour >= 12 ? "pm" : "am");
    }

    static String getUpcomingMessage(final Context context, final long upcoming, final long now) {
        if (upcoming == 0) {
            return null;
        }
        if (upcoming - now < DAY) {
            return "More at " + formatShortTime(context, upcoming);
        }
        final float days = ((float) (upcoming - now)) / DAY;
        return String.format(Locale.ROOT, "More in %.1fd", days);
    }

    static int widgetCount(final Context context) {
        if (!context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_APP_WIDGETS)) {
            return 0;
        }
        return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, SessionWidgetProvider.class)).length;
    }

    /** Redraw every widget from the stored counts and set the alarm for the next entry. */
    public static int refresh(final Context context) {
        final int n = widgetCount(context);
        if (n == 0) {
            return 0;
        }
        final long now = System.currentTimeMillis();
        draw(context, WidgetStore.current(context, now), now);
        scheduleNext(context, now);
        return n;
    }

    private static void scheduleNext(final Context context, final long now) {
        final AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            return;
        }
        final Intent intent = new Intent(context, SessionWidgetProvider.class).setAction(ACTION_TICK);
        final PendingIntent pi = PendingIntent.getBroadcast(context, 1, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        final long next = WidgetStore.nextChange(context, now);
        if (next == 0) {
            am.cancel(pi);
            return;
        }
        // Inexact, not waking the device: the widget is only seen with the screen on, and a pending
        // alarm is delivered as soon as the device wakes (the Java app's alarm was inexact too).
        am.set(AlarmManager.RTC, next, pi);
    }

    private static void draw(final Context context, final WidgetStore.Counts ctx, final long now) {
        final AppWidgetManager manager = AppWidgetManager.getInstance(context);
        final ComponentName name = new ComponentName(context, SessionWidgetProvider.class);
        final Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        final PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        final int lessonCount = ctx.lessons;
        final int reviewCount = ctx.reviews;
        final String upcomingMessage = getUpcomingMessage(context, ctx.nextAt, now);

        for (final int id : manager.getAppWidgetIds(name)) {
            final Bundle options = manager.getAppWidgetOptions(id);
            final int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 40);
            final int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 40);

            final RemoteViews views;
            if (minWidth < 100) {
                views = new RemoteViews(context.getPackageName(), R.layout.session_appwidget_tall);
            } else if (minWidth < 200) {
                views = new RemoteViews(context.getPackageName(), R.layout.session_appwidget);
            } else {
                views = new RemoteViews(context.getPackageName(), R.layout.session_appwidget_wide);
            }
            views.setOnClickPendingIntent(R.id.widgetSurface, pendingIntent);

            if (minWidth < 100) {
                if (minHeight < 80) {
                    views.setViewVisibility(R.id.header1, View.GONE);
                    views.setViewVisibility(R.id.header2, View.GONE);
                    if (lessonCount > 0) {
                        views.setTextViewText(R.id.line1, String.format(Locale.ROOT, "L: %d", lessonCount));
                        views.setViewVisibility(R.id.line1, View.VISIBLE);
                    } else {
                        views.setViewVisibility(R.id.line1, View.GONE);
                    }
                    views.setTextViewText(R.id.line2, String.format(Locale.ROOT, "R: %d", reviewCount));
                } else {
                    views.setViewVisibility(R.id.header2, View.VISIBLE);
                    if (lessonCount > 0) {
                        views.setTextViewText(R.id.header1, "Lessons:");
                        views.setViewVisibility(R.id.header1, View.VISIBLE);
                        views.setTextViewText(R.id.line1, Integer.toString(lessonCount));
                        views.setTextViewTextSize(R.id.line1, TypedValue.COMPLEX_UNIT_SP, 18);
                        views.setViewVisibility(R.id.line1, View.VISIBLE);
                    } else {
                        views.setViewVisibility(R.id.header1, View.GONE);
                        views.setViewVisibility(R.id.line1, View.GONE);
                    }
                    views.setTextViewText(R.id.header2, "Reviews:");
                    views.setViewVisibility(R.id.header2, View.VISIBLE);
                    views.setTextViewText(R.id.line2, Integer.toString(reviewCount));
                    views.setTextViewTextSize(R.id.line2, TypedValue.COMPLEX_UNIT_SP, 18);
                }
            } else if (minWidth < 200) {
                if (lessonCount > 0) {
                    views.setTextViewText(R.id.header, "Lessons/Reviews:");
                    views.setTextViewText(R.id.body, String.format(Locale.ROOT, "%d/%d", lessonCount, reviewCount));
                } else {
                    views.setTextViewText(R.id.header, "Reviews:");
                    views.setTextViewText(R.id.body, Integer.toString(reviewCount));
                }
            } else if (minWidth < 250) {
                if (lessonCount > 0) {
                    views.setTextViewText(R.id.leader, "L/R");
                    views.setTextViewText(R.id.body, String.format(Locale.ROOT, "%d/%d", lessonCount, reviewCount));
                } else {
                    views.setTextViewText(R.id.leader, "Rev");
                    views.setTextViewText(R.id.body, Integer.toString(reviewCount));
                }
            } else {
                if (lessonCount > 0) {
                    views.setTextViewText(R.id.leader, "Lessons/\nReviews");
                    views.setTextViewText(R.id.body, String.format(Locale.ROOT, "%d/%d", lessonCount, reviewCount));
                } else {
                    views.setTextViewText(R.id.leader, "Reviews");
                    views.setTextViewText(R.id.body, Integer.toString(reviewCount));
                }
            }

            if (upcomingMessage == null) {
                views.setViewVisibility(R.id.footer, View.GONE);
            } else {
                views.setViewVisibility(R.id.footer, View.VISIBLE);
                views.setTextViewText(R.id.footer, upcomingMessage);
            }

            manager.updateAppWidget(id, views);
        }
    }

    @Override
    public void onReceive(final Context context, final Intent intent) {
        if (ACTION_TICK.equals(intent.getAction())) {
            refresh(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(final Context context, final AppWidgetManager appWidgetManager, final int[] appWidgetIds) {
        refresh(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(final Context context, final AppWidgetManager appWidgetManager, final int appWidgetId, final Bundle newOptions) {
        refresh(context);
    }
}
