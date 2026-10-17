/*
 * KanjiKodama local mode: the app runs fully offline on bundled WaniKani content.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.view.Menu;
import android.view.MenuItem;

import androidx.preference.Preference;
import androidx.preference.PreferenceFragmentCompat;

import com.smouldering_durtles.wk.GlobalSettings;
import com.smouldering_durtles.wk.R;

import javax.annotation.Nullable;

/**
 * Global switch between the two modes. In local mode (the default) nothing talks to a server:
 * content comes from the bundled asset and unlocks and level-ups are computed locally. In server
 * mode the upstream code paths run against a WaniKani-compatible server, which decides SRS, and
 * the local-only features (JLPT order, extra kanji, fast travel, level test) are hidden.
 */
public final class LocalMode {
    /** Highest level available locally (no subscription cap). */
    public static final int MAX_LEVEL = 60;

    /** Menu items that only make sense with a server. */
    private static final int[] ONLINE_MENU_ITEMS = {
            R.id.action_sync_now, R.id.action_sync_subject, R.id.action_flush_tasks,
    };

    /** Menu items that only make sense in local mode. */
    private static final int[] LOCAL_MENU_ITEMS = {
            R.id.action_fast_travel, R.id.action_level_test,
    };

    /** Preferences that only make sense with a server. */
    private static final String[] ONLINE_PREFERENCES = {
            "api_key_help", "api_key", "enable_background_sync", "sync_on_open", "web_password",
            "delay_result_upload",
    };

    /** Preferences that only make sense in local mode. */
    private static final String[] LOCAL_PREFERENCES = {
            "progress_curriculum", "progress_level_test", "progress_fast_travel", "progress_restore",
            "progress_import_wanikani",
    };

    /**
     * True in local mode, false in server mode.
     *
     * @return the value
     */
    public static boolean isEnabled() {
        return !GlobalSettings.Api.getServerMode();
    }

    /** Show the menu items of the current mode. Safe to call repeatedly. */
    public static void applyToMenu(final @Nullable Menu menu) {
        if (menu == null) {
            return;
        }
        final boolean local = isEnabled();
        setVisible(menu, ONLINE_MENU_ITEMS, !local);
        setVisible(menu, LOCAL_MENU_ITEMS, local);
        // Upstream's support screen is about upstream's developers, not this fork.
        setVisible(menu, new int[] {R.id.action_support}, false);
    }

    private static void setVisible(final Menu menu, final int[] ids, final boolean visible) {
        for (final int id: ids) {
            final @Nullable MenuItem item = menu.findItem(id);
            if (item != null) {
                item.setVisible(visible);
            }
        }
    }

    /** Show the preferences of the current mode and retitle the API section. */
    public static void applyToPreferences(final PreferenceFragmentCompat fragment) {
        final boolean local = isEnabled();
        if (local) {
            hide(fragment, ONLINE_PREFERENCES);
        }
        else {
            hide(fragment, LOCAL_PREFERENCES);
            if (!ServerMode.isWaniKani()) {
                // Resurrect and burn log in to wanikani.com itself, which would act on the wrong account.
                hide(fragment, new String[] {"web_password"});
            }
        }
        hide(fragment, new String[] {"support_and_feedback"});
        final @Nullable Preference api = fragment.findPreference("api_settings");
        if (api != null) {
            api.setTitle(local ? "Audio download settings" : "API and audio download settings");
        }
    }

    private static void hide(final PreferenceFragmentCompat fragment, final String[] keys) {
        for (final String key: keys) {
            final @Nullable Preference pref = fragment.findPreference(key);
            if (pref != null) {
                pref.setVisible(false);
            }
        }
    }

    private LocalMode() {
        //
    }
}
