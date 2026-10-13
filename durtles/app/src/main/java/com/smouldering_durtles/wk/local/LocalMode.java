/*
 * KanjiKodama local mode: the app runs fully offline on bundled WaniKani content.
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.view.Menu;
import android.view.MenuItem;

import androidx.preference.Preference;
import androidx.preference.PreferenceFragmentCompat;

import com.smouldering_durtles.wk.R;

import javax.annotation.Nullable;

/**
 * Global switch for the offline fork. When enabled, nothing talks to the WaniKani API:
 * content comes from the bundled asset and unlocks and level-ups are computed locally.
 */
public final class LocalMode {
    /** KanjiKodama always runs offline. Kept as a constant so upstream code paths stay readable. */
    public static final boolean ENABLED = true;

    /** Highest level available locally (no subscription cap). */
    public static final int MAX_LEVEL = 60;

    /** Menu items that only make sense with a WaniKani account. */
    private static final int[] ONLINE_MENU_ITEMS = {
            R.id.action_sync_now, R.id.action_sync_subject, R.id.action_flush_tasks, R.id.action_support,
    };

    /** Preferences that only make sense with a WaniKani account. */
    private static final String[] ONLINE_PREFERENCES = {
            "api_key_help", "api_key", "enable_background_sync", "sync_on_open", "web_password",
            "delay_result_upload", "support_and_feedback",
    };

    /** Hide account-only menu items. Safe to call repeatedly. */
    public static void applyToMenu(final @Nullable Menu menu) {
        if (!ENABLED || menu == null) {
            return;
        }
        for (final int id: ONLINE_MENU_ITEMS) {
            final @Nullable MenuItem item = menu.findItem(id);
            if (item != null) {
                item.setVisible(false);
            }
        }
        for (final int id: new int[] {R.id.action_fast_travel, R.id.action_level_test}) {
            final @Nullable MenuItem item = menu.findItem(id);
            if (item != null) {
                item.setVisible(true);
            }
        }
    }

    /** Hide account-only preferences and retitle the API section. */
    public static void applyToPreferences(final PreferenceFragmentCompat fragment) {
        if (!ENABLED) {
            return;
        }
        for (final String key: ONLINE_PREFERENCES) {
            final @Nullable Preference pref = fragment.findPreference(key);
            if (pref != null) {
                pref.setVisible(false);
            }
        }
        final @Nullable Preference api = fragment.findPreference("api_settings");
        if (api != null) {
            api.setTitle("Audio download settings");
        }
    }

    private LocalMode() {
        //
    }
}
