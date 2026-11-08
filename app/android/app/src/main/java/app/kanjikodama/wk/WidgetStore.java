package app.kanjikodama.wk;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The widget's counts as the app last handed them over (core `planWidget`, src/platform/androidWidget.ts):
 * the counts now plus later entries ({at, lessons, reviews, nextAt}), so the widget can move on at
 * the next review hour without the app running.
 */
public final class WidgetStore {
    private static final String PREFS = "kk_widget";
    private static final String KEY = "plan";

    /** What one widget draw needs (`AlertContext`). */
    public static final class Counts {
        public final int lessons;
        public final int reviews;
        /** 0: none. */
        public final long nextAt;

        Counts(final int lessons, final int reviews, final long nextAt) {
            this.lessons = lessons;
            this.reviews = reviews;
            this.nextAt = nextAt;
        }
    }

    private WidgetStore() {}

    private static SharedPreferences prefs(final Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void save(final Context context, final JSONObject plan) {
        prefs(context).edit().putString(KEY, plan.toString()).apply();
    }

    private static JSONObject plan(final Context context) {
        try {
            final String s = prefs(context).getString(KEY, null);
            return s == null ? null : new JSONObject(s);
        } catch (final Exception e) {
            return null;
        }
    }

    private static Counts countsOf(final JSONObject o) {
        return new Counts(o.optInt("lessons", 0), o.optInt("reviews", 0), o.optLong("nextAt", 0));
    }

    /** The counts at {@code now}: the newest schedule entry that has started, else the base counts. */
    public static Counts current(final Context context, final long now) {
        final JSONObject p = plan(context);
        if (p == null) {
            return new Counts(0, 0, 0);
        }
        Counts c = countsOf(p);
        final JSONArray schedule = p.optJSONArray("schedule");
        if (schedule != null) {
            for (int i = 0; i < schedule.length(); i++) {
                final JSONObject e = schedule.optJSONObject(i);
                if (e != null && e.optLong("at", Long.MAX_VALUE) <= now) {
                    c = countsOf(e);
                }
            }
        }
        return c;
    }

    /** The next schedule entry's time after {@code now}, or 0. */
    public static long nextChange(final Context context, final long now) {
        final JSONObject p = plan(context);
        final JSONArray schedule = p == null ? null : p.optJSONArray("schedule");
        if (schedule == null) {
            return 0;
        }
        for (int i = 0; i < schedule.length(); i++) {
            final JSONObject e = schedule.optJSONObject(i);
            final long at = e == null ? 0 : e.optLong("at", 0);
            if (at > now) {
                return at;
            }
        }
        return 0;
    }
}
