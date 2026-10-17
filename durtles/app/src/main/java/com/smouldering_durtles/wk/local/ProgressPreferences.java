/*
 * KanjiKodama local mode: the "Progress" settings (server connection, WaniKani import, save to and restore from a file).
 * Licensed under the Apache License 2.0 like the rest of Smouldering Durtles.
 */

package com.smouldering_durtles.wk.local;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.text.InputType;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.preference.Preference;
import androidx.preference.PreferenceFragmentCompat;

import com.smouldering_durtles.wk.GlobalSettings;
import com.smouldering_durtles.wk.WkApplication;
import com.smouldering_durtles.wk.activities.MainActivity;
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

    private static final String SERVER_WARNING = "Switching replaces ALL progress on this device with the server's."
            + " Local progress is not sent to the server. Save your current progress first if you might want it back.";

    private final PreferenceFragmentCompat fragment;
    private final ActivityResultLauncher<String> saveLauncher;
    private final ActivityResultLauncher<String[]> openLauncher;
    private @Nullable Runnable afterSave = null;

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
        final @Nullable Preference server = fragment.findPreference("progress_server");
        if (server != null) {
            server.setSummary(LocalMode.isEnabled()
                    ? "Local (offline). Tap to connect to a WaniKani-compatible server such as OpenKani."
                    : "Server mode: " + ServerMode.label(GlobalSettings.Api.getBaseUrl()) + ". Tap to change.");
            server.setOnPreferenceClickListener(p -> {
                if (LocalMode.isEnabled()) {
                    askServer();
                }
                else {
                    showServer();
                }
                return true;
            });
        }
        click("progress_fast_travel", () -> CurriculumUi.fastTravel(fragment.requireActivity()));
        click("progress_level_test", () -> CurriculumUi.levelTest(fragment.requireActivity()));
        click("progress_import_wanikani", this::askToken);
        click("progress_save", this::save);
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

    // --- Server connection ----------------------------------------------------------------------------

    private EditText field(final Context context, final String hint, final @Nullable String value, final boolean secret) {
        final EditText input = new EditText(context);
        input.setInputType(secret
                ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setSingleLine(true);
        input.setHint(hint);
        if (value != null) {
            input.setText(value);
        }
        return input;
    }

    private LinearLayout box(final Context context, final EditText... inputs) {
        final LinearLayout box = new LinearLayout(context);
        box.setOrientation(LinearLayout.VERTICAL);
        final int pad = (int) (20 * context.getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        for (final EditText input: inputs) {
            box.addView(input);
        }
        return box;
    }

    /** Local mode: ask for a server and a token. */
    private void askServer() {
        final Context context = fragment.requireContext();
        final String saved = GlobalSettings.Api.getBaseUrl();
        // No default server: the address is always one the learner typed, so nothing goes to a server they did not choose.
        final EditText url = field(context, "Server address, e.g. https://my-openkani.vercel.app",
                ServerMode.isWaniKani(saved) ? null : saved, false);
        final EditText token = field(context, "API token for this server", null, true);
        new AlertDialog.Builder(context)
                .setTitle("Connect to a server")
                .setMessage("In server mode the server decides SRS stages, unlocks and level-ups, and lessons and"
                        + " reviews are sent to it. JLPT order, the extra kanji, fast travel and the level test are"
                        + " only available in local mode.\n\nPaste a token for the server. An OpenKani server can"
                        + " instead copy your data from WaniKani once and give back its own token: leave the token"
                        + " empty and use a WaniKani token. Your progress then lives on that server, so use one you"
                        + " run yourself or trust.")
                .setView(box(context, url, token))
                .setNegativeButton("Cancel", null)
                .setNeutralButton("Use WaniKani token", (d, w) -> withUrl(url, base -> askWaniKaniKey(base)))
                .setPositiveButton("Connect", (d, w) -> withUrl(url, base -> {
                    final String t = token.getText().toString().trim();
                    if (t.isEmpty()) {
                        Busy.message(fragment.requireActivity(), "No token", "Paste an API token for the server,"
                                + " or use a WaniKani token to copy your WaniKani data to it.");
                        return;
                    }
                    checkServer(base, t);
                }))
                .show();
    }

    private interface UrlAction {
        void accept(String baseUrl);
    }

    private void withUrl(final EditText url, final UrlAction action) {
        try {
            action.accept(ServerMode.normalize(url.getText().toString()));
        } catch (final IllegalArgumentException e) {
            Busy.message(fragment.requireActivity(), "Server address", e.getMessage() != null ? e.getMessage() : e.toString());
        }
    }

    private void askWaniKaniKey(final String base) {
        final Context context = fragment.requireContext();
        final EditText key = field(context, "WaniKani API token", null, true);
        new AlertDialog.Builder(context)
                .setTitle("Copy your WaniKani data to " + ServerMode.label(base))
                .setMessage("Paste a WaniKani personal access token (wanikani.com, Settings, API Tokens). "
                        + ServerMode.label(base) + " downloads your WaniKani data once into its own database and"
                        + " gives back a token for it. The WaniKani token is sent to " + ServerMode.label(base)
                        + ". If it copied your data before, it gives back the existing token. This can take a few minutes.")
                .setView(box(context, key))
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Next", (d, w) -> {
                    final String k = key.getText().toString().trim();
                    if (!k.isEmpty()) {
                        work("Copying your WaniKani data to " + ServerMode.label(base) + "…", () -> ServerMode.migrate(base, k),
                                t -> checkServer(base, t));
                    }
                })
                .show();
    }

    private void checkServer(final String base, final String token) {
        work("Checking the connection…", () -> ServerMode.check(base, token), user -> confirmServer(base, token, user));
    }

    private void confirmServer(final String base, final String token, final ApiUser user) {
        new AlertDialog.Builder(fragment.requireContext())
                .setTitle("Switch to server mode?")
                .setMessage("Connected to " + ServerMode.label(base) + " as " + user.getUsername() + ", level "
                        + user.getLevel() + ".\n\n" + SERVER_WARNING)
                .setNegativeButton("Cancel", null)
                .setNeutralButton("Save first", (d, w) -> {
                    afterSave = () -> confirmServer(base, token, user);
                    save();
                })
                .setPositiveButton("Switch", (d, w) -> work("Switching to server mode…", () -> {
                    ServerMode.switchToServer(base, token, user);
                    return "Server mode: downloading everything from " + ServerMode.label(base) + ".";
                }, this::restart))
                .show();
    }

    /** Server mode: show the connection and offer to go back to local mode. */
    private void showServer() {
        final String label = ServerMode.label(GlobalSettings.Api.getBaseUrl());
        work("Checking unsent answers…", ServerMode::pendingUploads, pending -> new AlertDialog.Builder(fragment.requireContext())
                .setTitle("Server mode")
                .setMessage("Connected to " + label + " (" + GlobalSettings.Api.getBaseUrl() + "). The server decides SRS"
                        + " stages, unlocks and level-ups."
                        + (pending > 0 ? "\n\n" + pending + " answers or notes have not been sent to " + label + " yet." : ""))
                .setNegativeButton("Close", null)
                .setPositiveButton("Switch to local mode", (d, w) -> askLocal(label, pending))
                .show());
    }

    private void askLocal(final String label, final int pending) {
        new AlertDialog.Builder(fragment.requireContext())
                .setTitle("Switch to local mode?")
                .setMessage("Local mode starts over from the bundled content and works offline. You can bring this"
                        + " account's progress from " + label + " along, or start at level 1."
                        + (pending > 0 ? "\n\n" + pending + " answers or notes not yet sent to " + label + " will be lost."
                                + " To keep them, close this, use Sync now from the main menu and try again." : ""))
                .setNegativeButton("Cancel", null)
                .setNeutralButton("Start at level 1", (d, w) -> work("Switching to local mode…",
                        () -> ServerMode.switchToLocal(null), this::restart))
                .setPositiveButton("Bring progress", (d, w) -> work("Downloading from " + label + "…", () -> {
                    final WaniKaniImporter.Download download = ServerMode.downloadForLocal();
                    return ServerMode.switchToLocal(download);
                }, this::restart))
                .show();
    }

    /** Start the app over on the dashboard, so menus, settings and the dashboard show the new mode. */
    private void restart(final String message) {
        final Activity activity = fragment.requireActivity();
        Toast.makeText(activity.getApplicationContext(), message, Toast.LENGTH_LONG).show();
        final Intent intent = new Intent(activity, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        activity.startActivity(intent);
        activity.finish();
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

    private void save() {
        saveLauncher.launch("kanjikodama-progress-" + new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date()) + ".json");
    }

    private void onSaveTarget(final @Nullable Uri uri) {
        final @Nullable Runnable next = afterSave;
        afterSave = null;
        if (uri == null) {
            if (next != null) {
                next.run();
            }
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
        }, message -> {
            if (next != null) {
                next.run();
            }
            else {
                done(message);
            }
        });
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
