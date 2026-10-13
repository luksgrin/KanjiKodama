/*
 * KanjiKodama local mode: the "Progress" settings (WaniKani import, save to and restore from a file).
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.content.Context;
import android.net.Uri;
import android.text.InputType;
import android.widget.EditText;
import android.widget.FrameLayout;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.preference.Preference;
import androidx.preference.PreferenceFragmentCompat;

import com.smouldering_durtles.wk.GlobalSettings;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.api.model.ApiUser;
import com.smouldering_durtles.wk.tasks.WaniKaniImporter;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import javax.annotation.Nullable;

/**
 * Wires the progress preferences of a settings fragment. Create it as a field of the fragment (so the
 * document pickers are registered before the fragment starts) and call {@link #attach()} from
 * onCreatePreferences.
 */
public final class ProgressPreferences {
    private static final String OVERRIDE_WARNING = "This replaces ALL progress in KanjiKodama (levels, SRS stages,"
            + " review history and notes) on this device. It cannot be undone. Save your current progress first"
            + " if you might want it back.";

    private final PreferenceFragmentCompat fragment;
    private final ActivityResultLauncher<String> saveLauncher;
    private final ActivityResultLauncher<String[]> openLauncher;

    public ProgressPreferences(final PreferenceFragmentCompat fragment) {
        this.fragment = fragment;
        saveLauncher = fragment.registerForActivityResult(
                new ActivityResultContracts.CreateDocument("application/json"), this::onSaveTarget);
        openLauncher = fragment.registerForActivityResult(
                new ActivityResultContracts.OpenDocument(), this::onOpenSource);
    }

    public void attach() {
        final @Nullable Preference curriculum = fragment.findPreference("progress_curriculum");
        if (curriculum != null) {
            curriculum.setSummary(Curriculum.getMode().label + ". Tap to switch; progress on every item is kept.");
            curriculum.setOnPreferenceClickListener(p -> {
                CurriculumUi.chooseCurriculum(fragment.requireActivity(),
                        () -> curriculum.setSummary(Curriculum.getMode().label + ". Tap to switch; progress on every item is kept."));
                return true;
            });
        }
        click("progress_fast_travel", () -> CurriculumUi.fastTravel(fragment.requireActivity()));
        click("progress_level_test", () -> CurriculumUi.levelTest(fragment.requireActivity()));
        click("progress_import_wanikani", this::askToken);
        click("progress_save", () -> saveLauncher.launch(
                "kanjikodama-progress-" + new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date()) + ".json"));
        click("progress_restore", () -> openLauncher.launch(new String[] {"application/json", "text/plain", "application/octet-stream"}));
    }

    private void click(final String key, final Runnable action) {
        final @Nullable Preference pref = fragment.findPreference(key);
        if (pref != null) {
            pref.setOnPreferenceClickListener(p -> {
                action.run();
                return true;
            });
        }
    }

    // --- WaniKani import -------------------------------------------------------------------------------

    private void askToken() {
        final Context context = fragment.requireContext();
        final EditText input = new EditText(context);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        input.setSingleLine(true);
        input.setHint("API token");
        final @Nullable String saved = GlobalSettings.Api.getApiKey();
        if (saved != null) {
            input.setText(saved);
        }
        final FrameLayout box = new FrameLayout(context);
        final int pad = (int) (20 * context.getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView(input);
        new AlertDialog.Builder(context)
                .setTitle("Import from WaniKani")
                .setMessage("Paste a WaniKani personal access token (wanikani.com, Settings, API Tokens)."
                        + " A read-only token is enough.")
                .setView(box)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Next", (d, w) -> {
                    final String key = input.getText().toString().trim();
                    if (!key.isEmpty()) {
                        checkToken(key);
                    }
                })
                .show();
    }

    private void checkToken(final String key) {
        work("Checking the token…", () -> WaniKaniImporter.checkToken(key), user -> new AlertDialog.Builder(fragment.requireContext())
                .setTitle("Override local progress?")
                .setMessage("WaniKani account " + user.getUsername() + " is at level " + user.getLevel() + ".\n\n"
                        + "Importing downloads that account's progress. " + OVERRIDE_WARNING)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Import and override", (d, w) -> work("Importing from WaniKani…",
                        () -> WaniKaniImporter.importAll(user), this::done))
                .show());
    }

    // --- Save ------------------------------------------------------------------------------------------

    private void onSaveTarget(final @Nullable Uri uri) {
        if (uri == null) {
            return;
        }
        work("Saving progress…", () -> {
            final byte[] data = ProgressStore.export(WkApplication.getDatabase()).getBytes(StandardCharsets.UTF_8);
            try (final @Nullable OutputStream os = fragment.requireContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (os == null) {
                    throw new IllegalStateException("Could not open the file for writing.");
                }
                os.write(data);
            }
            return "Progress saved.";
        }, this::done);
    }

    // --- Restore ---------------------------------------------------------------------------------------

    private void onOpenSource(final @Nullable Uri uri) {
        if (uri == null) {
            return;
        }
        final String[] json = new String[1];
        work("Reading the file…", () -> {
            try (final @Nullable InputStream is = fragment.requireContext().getContentResolver().openInputStream(uri)) {
                if (is == null) {
                    throw new IllegalStateException("Could not open the file.");
                }
                final ByteArrayOutputStream bos = new ByteArrayOutputStream();
                final byte[] buf = new byte[65536];
                int n;
                while ((n = is.read(buf)) > 0) {
                    bos.write(buf, 0, n);
                }
                json[0] = bos.toString("UTF-8");
            }
            return ProgressStore.describe(json[0]);
        }, summary -> new AlertDialog.Builder(fragment.requireContext())
                .setTitle("Override local progress?")
                .setMessage(summary + "\n\n" + OVERRIDE_WARNING)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Restore and override", (d, w) -> work("Restoring progress…", () -> {
                    ProgressStore.restore(WkApplication.getDatabase(), json[0]);
                    return "Progress restored, level " + WkApplication.getDatabase().propertiesDao().getUserLevel() + ".";
                }, this::done))
                .show());
    }

    // --- Plumbing --------------------------------------------------------------------------------------

    private void done(final String message) {
        Busy.message(fragment.requireActivity(), null, message);
    }

    private <T> void work(final String label, final Busy.Work<T> work, final Busy.Then<T> then) {
        Busy.run(fragment.requireActivity(), label, work, then);
    }
}
